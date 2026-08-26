// Visual Note 01 — 아데노신과 수면압력
//
// 모형은 Borbély의 2-프로세스 모형(1982)을 그대로 따른다.
//   프로세스 S = 아데노신(수면압력). 깨어 있으면 100%를 향해 지수적으로 차오르고, 자면 지수적으로 빠진다.
//   프로세스 C = 몸시계가 만드는 각성 신호. S가 이 곡선을 위로 뚫으면 잠들고, 아래로 빠지면 깬다.
// 시상수와 파형은 Daan·Beersma·Borbély(1984)의 값을 쓴다. 수치 근거는 저장소의 수면압력.md 참고.

const svg = document.querySelector("#sleepChart");

const controls = {
  riseTau: document.querySelector("#riseTau"),
  initialAdenosine: document.querySelector("#initialAdenosine"),
  fallTau: document.querySelector("#fallTau"),
  period: document.querySelector("#cyclePeriod"),
  troughClock: document.querySelector("#troughClock"),
  sleepThreshold: document.querySelector("#sleepThreshold"),
  wakeGap: document.querySelector("#wakeGap"),
  sleepLimit: document.querySelector("#sleepLimit"),
  autoSleep: document.querySelector("#autoSleep"),
  forcedMode: document.querySelector("#forcedMode"),
  clearForcedSleep: document.querySelector("#clearForcedSleep"),
  reset: document.querySelector("#resetDefaults"),
};

const readouts = {
  riseTau: document.querySelector("#riseTauValue"),
  initialAdenosine: document.querySelector("#initialAdenosineValue"),
  fallTau: document.querySelector("#fallTauValue"),
  period: document.querySelector("#periodValue"),
  troughClock: document.querySelector("#troughClockValue"),
  sleepThreshold: document.querySelector("#sleepThresholdValue"),
  wakeGap: document.querySelector("#wakeGapValue"),
  sleepLimit: document.querySelector("#sleepLimitValue"),
  autoSleep: document.querySelector("#autoSleepValue"),
  forcedMode: document.querySelector("#forcedModeValue"),
  forcedCount: document.querySelector("#forcedCountValue"),
};

const summary = {
  nights: document.querySelector("#sumNights"),
  length: document.querySelector("#sumLength"),
  bedtime: document.querySelector("#sumBedtime"),
  waketime: document.querySelector("#sumWaketime"),
  peakDoze: document.querySelector("#sumPeakDoze"),
  leftover: document.querySelector("#sumLeftover"),
};

// ── 튜닝 상수 ──────────────────────────────────────────────
// 여기 값들을 바꾸면 하루가 통째로 달라진다. 왜 이 숫자인지는 수면압력.md에 적어 두었다.

// 각성 신호(프로세스 C)의 크기. 아데노신과 같은 0~1 눈금 위에 놓는다.
// mean/amplitude는 "기본값으로 두면 23:00에 잠들고 07:00에 깬다"가 성립하도록 역산한 값이다.
const circadian = {
  mean: 0.473,
  amplitude: 0.199,
  troughPhase: 1.0452, // 아래 파형이 최저가 되는 위상(rad)
  norm: 1.00374, // 파형을 -1~1로 맞추는 나눗수
};

// Daan·Beersma·Borbély(1984)가 쓴 찌그러진 sin. 고조파가 섞여 있어서
// 순수 sin과 달리 저녁까지 완만히 오르고 새벽에 가파르게 떨어진다.
// 실제 각성 리듬의 "저녁 각성 유지 구간 → 새벽 급락"이 이 비대칭에서 나온다.
const circadianHarmonics = [0.97, 0.22, 0.07, 0.03, 0.001];

const totalHours = 72; // 화면에 그리는 길이
// 마지막 밤이 오른쪽 끝에서 잘려 "7시간 36분"처럼 거짓 길이가 찍히던 문제 때문에
// 계산은 화면보다 길게 돌린다. 그리기는 여전히 totalHours까지만 한다.
const simHours = totalHours + 14;
const step = 0.1;
const dayStartClock = 7; // 가로축 0시간 = 아침 7시
const minSleepBout = 0.6; // 이보다 짧은 잠은 채택하지 않는다. 문턱 근처에서 잠·깸이 떨리는 걸 막는 장치
const adenosineCeiling = 1; // 깨어 있을 때 아데노신이 다가가는 천장 = 100%

// ── 지오메트리 ─────────────────────────────────────────────
// 패널을 셋으로 나눈다. 위는 두 힘의 곡선, 가운데는 그 차이(졸림 지수), 맨 아래는 졸림 색띠.
//
// 가로:세로를 2.7:1로 눌러 놓은 건 순전히 배치 때문이다. 이 차트는 화면 위쪽에
// 고정(sticky)되고 그 아래로 슬라이더가 지나가야 해서, 렌더 높이가 400px을 넘으면
// 슬라이더를 만지는 동안 그래프가 화면 밖으로 밀려난다.
const width = 1360;
const height = 470;
const padding = { top: 34, right: 104, bottom: 23, left: 60 };
const plotWidth = width - padding.left - padding.right;

const forceTop = padding.top;
const forceHeight = 246;
const forceBottom = forceTop + forceHeight;
const dozeTop = forceBottom + 34;
const dozeHeight = 96;
const dozeBottom = dozeTop + dozeHeight;
// 졸림 색띠. 곡선 높이를 눈으로 좇지 않아도 "몇 시에 얼마나 졸린지"가 색 하나로 읽힌다.
const heatTop = dozeBottom + 7;
const heatHeight = 14;
const heatBottom = heatTop + heatHeight;
const heatStep = 0.5; // 색띠 한 칸의 길이(시간). 잘게 쪼갤수록 매끈하지만 노드가 늘어난다

// 아래 패널 눈금: 0 = 깨는 선, 100 = 잠드는 선. 바깥으로 조금 여유를 준다.
// 범위를 벗어난 값은 잘라내지 않고 clipPath로 가린다. 낮잠 뒤처럼 한참 아래로 내려가는 구간을
// 바닥에 붙여 놓으면 곡선이 평평해져서 "값이 멈췄다"로 잘못 읽힌다.
const dozeMin = -50;
const dozeMax = 130;

const state = {
  forcedSleeps: [],
  nextForcedId: 1,
  dragStart: null,
  dragEnd: null,
  clickStart: null,
  ignoreNextClick: false,
  hoverHour: null,
  // 슬라이더를 만지기 직전의 곡선. 회색으로 겹쳐 그려서 "무엇이 어떻게 달라졌는지"를 보여준다.
  // 이게 없으면 사흘치 곡선이 통째로 갈아끼워져 어디가 바뀌었는지 눈으로 못 쫓는다.
  lastPoints: null,
  ghostPoints: null,
  ghostTimer: null,
  interacting: false,
};

const GHOST_LINGER_MS = 900; // 슬라이더를 놓은 뒤 회색 곡선이 남아 있는 시간

function readSettings() {
  return {
    riseTau: Number(controls.riseTau.value),
    initialAdenosine: Number(controls.initialAdenosine.value) / 100,
    fallTau: Number(controls.fallTau.value),
    period: Number(controls.period.value),
    troughClock: Number(controls.troughClock.value),
    sleepThreshold: Number(controls.sleepThreshold.value) / 100,
    wakeGap: Number(controls.wakeGap.value) / 100,
    sleepLimit: Number(controls.sleepLimit.value),
    autoSleep: controls.autoSleep.checked,
    forcedMode: controls.forcedMode.checked,
  };
}

function circadianWave(phase) {
  let sum = 0;
  circadianHarmonics.forEach((weight, index) => {
    sum += weight * Math.sin((index + 1) * phase);
  });
  // 부호를 뒤집어야 '각성' 신호가 된다. 뒤집기 전 파형은 잠이 오는 정도라 위아래가 반대다.
  return -sum / circadian.norm;
}

function circadianAt(hour, settings) {
  // 사용자가 고른 시계 시각에 최저점이 오도록 위상을 맞춘다.
  const troughHour = (settings.troughClock - dayStartClock + 24) % 24;
  const phase = ((hour - troughHour) / settings.period) * Math.PI * 2 + circadian.troughPhase;
  return circadian.mean + circadian.amplitude * circadianWave(phase);
}

function forcedSleepAt(hour) {
  return state.forcedSleeps.find((sleep) => hour >= sleep.start && hour < sleep.end) ?? null;
}

// 졸림 지수. 깨는 선이 0, 잠드는 선이 100이 되도록 두 문턱 사이를 100등분한 값이다.
// 원래 압력값(S − C)은 −0.2~0.07처럼 읽기 나쁜 숫자라 그대로 보여주지 않는다.
function dozeIndex(adenosine, circadianValue, settings) {
  const low = circadianValue - settings.wakeGap;
  const high = circadianValue + settings.sleepThreshold;
  const span = Math.max(0.02, high - low);
  return ((adenosine - low) / span) * 100;
}

function buildSimulation(settings) {
  let adenosine = clamp(settings.initialAdenosine, 0, adenosineCeiling);
  let sleeping = false;
  let sleepStart = null;
  let sleepReason = "auto";
  let activeForcedId = null;
  const points = [];
  const sleepWindows = [];

  for (let hour = 0; hour <= simHours + 0.001; hour += step) {
    const circadianValue = circadianAt(hour, settings);
    const forced = forcedSleepAt(hour);

    if (forced !== null && activeForcedId !== forced.id) {
      if (sleeping && sleepStart !== null) {
        sleepWindows.push({ start: sleepStart, end: hour, reason: sleepReason, forcedId: activeForcedId });
      }
      sleeping = true;
      sleepStart = hour;
      sleepReason = "forced";
      activeForcedId = forced.id;
    } else if (
      !sleeping &&
      settings.autoSleep &&
      forced === null &&
      adenosine >= circadianValue + settings.sleepThreshold
    ) {
      sleeping = true;
      sleepStart = hour;
      sleepReason = "auto";
      activeForcedId = null;
    }

    if (hour <= totalHours + 0.001) {
      points.push({
        hour,
        adenosine,
        circadian: circadianValue,
        sleepLine: circadianValue + settings.sleepThreshold,
        wakeLine: circadianValue - settings.wakeGap,
        doze: dozeIndex(adenosine, circadianValue, settings),
        sleeping,
        // areaBetween이 두 계열 사이만 채울 수 있어서, 바닥까지 채우려면 상수 계열이 필요하다.
        floor: 0,
      });
    }

    // 상태를 기록한 뒤에 한 칸 전진시킨다. 그래야 곡선의 꺾이는 점과 수면 구간의 경계가 어긋나지 않는다.
    if (sleeping) {
      adenosine *= Math.exp(-step / settings.fallTau);
    } else {
      adenosine += (adenosineCeiling - adenosine) * (step / settings.riseTau);
    }

    const nextCircadian = circadianAt(hour + step, settings);
    const sleptLongEnough = sleepStart !== null && hour - sleepStart >= minSleepBout;
    const reachedLimit = sleepStart !== null && hour - sleepStart >= settings.sleepLimit;
    const autoWake = sleptLongEnough && (adenosine <= nextCircadian - settings.wakeGap || reachedLimit);
    const activeForced =
      activeForcedId === null ? null : (state.forcedSleeps.find((sleep) => sleep.id === activeForcedId) ?? null);
    const forcedWake = sleepReason === "forced" && (activeForced === null || hour + step >= activeForced.end);
    const shouldWake = sleepReason === "forced" ? forcedWake : autoWake;

    if (sleeping && shouldWake) {
      const end = activeForced === null ? hour + step : Math.min(activeForced.end, hour + step);
      sleepWindows.push({ start: sleepStart, end, reason: sleepReason, forcedId: activeForcedId });
      sleeping = false;
      sleepStart = null;
      activeForcedId = null;
    }
  }

  if (sleeping && sleepStart !== null) {
    sleepWindows.push({ start: sleepStart, end: simHours, reason: sleepReason, forcedId: activeForcedId, open: true });
  }

  // 화면 밖에서 시작한 잠은 버린다. 끝이 넘어가는 건 남겨야 길이를 제대로 적을 수 있다.
  return { points, sleepWindows: sleepWindows.filter((sleep) => sleep.start < totalHours) };
}

function x(hour) {
  return padding.left + (hour / totalHours) * plotWidth;
}

function yForce(value) {
  return forceBottom - clamp(value, 0, adenosineCeiling) * forceHeight;
}

function yDoze(value) {
  const normalized = (value - dozeMin) / (dozeMax - dozeMin);
  return dozeBottom - normalized * dozeHeight;
}

function pathFor(points, key, yScale) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.hour).toFixed(2)} ${yScale(point[key]).toFixed(2)}`)
    .join(" ");
}

// 두 곡선 사이를 채운다. 조건이 참인 구간마다 닫힌 도형을 하나씩 만들어,
// 예전처럼 세로 막대를 200개 쌓지 않는다(줄무늬가 생겨 지저분했다).
function areaBetween(points, upperKey, lowerKey, yScale, isInside) {
  const shapes = [];
  let run = [];

  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const top = run.map((p) => `${x(p.hour).toFixed(2)},${yScale(p[upperKey]).toFixed(2)}`);
    const bottom = run
      .slice()
      .reverse()
      .map((p) => `${x(p.hour).toFixed(2)},${yScale(p[lowerKey]).toFixed(2)}`);
    shapes.push(`M ${top.join(" L ")} L ${bottom.join(" L ")} Z`);
    run = [];
  };

  points.forEach((point) => {
    if (isInside(point)) run.push(point);
    else flush();
  });
  flush();
  return shapes.join(" ");
}

function labelForHour(hour) {
  const clock = (dayStartClock + hour) % 24;
  return `${String(Math.floor(clock)).padStart(2, "0")}:00`;
}

function clockLabel(hour) {
  const clock = (dayStartClock + hour) % 24;
  const whole = Math.floor(clock);
  const minutes = Math.round((clock - whole) * 60);
  if (minutes === 60) return `${String((whole + 1) % 24).padStart(2, "0")}:00`;
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// 여러 취침 시각의 평균. 23:50과 00:10처럼 자정을 걸치면 산술평균이 정오로 튀므로
// 각도로 바꿔 평균 낸 뒤 되돌린다.
function averageClock(hours) {
  if (hours.length === 0) return null;
  let sumSin = 0;
  let sumCos = 0;
  hours.forEach((hour) => {
    const angle = (((dayStartClock + hour) % 24) / 24) * Math.PI * 2;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  });
  const mean = Math.atan2(sumSin / hours.length, sumCos / hours.length);
  const clock = ((mean / (Math.PI * 2)) * 24 + 24) % 24;
  const whole = Math.floor(clock);
  const minutes = Math.round((clock - whole) * 60);
  if (minutes === 60) return `${String((whole + 1) % 24).padStart(2, "0")}:00`;
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// 이 요약은 곡선 아래에 붙어 화면에 늘 남는다. 슬라이더를 만졌을 때
// "그래서 결과가 어떻게 달라졌는지"를 숫자로 즉시 돌려주는 자리다.
function updateSummary(sleepWindows, points) {
  // 사흘 통틀어 가장 졸렸던 순간. 곡선의 봉우리를 눈대중할 필요를 없앤다.
  const peak = points.reduce((best, point) => Math.max(best, point.doze), -Infinity);
  summary.peakDoze.textContent = Number.isFinite(peak) ? String(Math.round(peak)) : "—";

  const closed = sleepWindows.filter((sleep) => sleep.open !== true);
  if (closed.length === 0) {
    [summary.length, summary.bedtime, summary.waketime, summary.leftover].forEach((node) => {
      node.textContent = "—";
    });
    summary.nights.textContent = "0번";
    return;
  }

  const lengths = closed.map((sleep) => sleep.end - sleep.start);
  const average = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  summary.nights.textContent = `${closed.length}번`;
  summary.length.textContent = formatHours(average);
  summary.bedtime.textContent = averageClock(closed.map((sleep) => sleep.start)) ?? "—";
  summary.waketime.textContent = averageClock(closed.map((sleep) => sleep.end)) ?? "—";

  // 깬 순간에 남아 있던 아데노신. 덜 자면 여기가 올라가고, 그게 다음 날의 출발점이 된다.
  const leftovers = closed.map((sleep) => points[clamp(Math.round(sleep.end / step), 0, points.length - 1)].adenosine);
  const meanLeftover = leftovers.reduce((sum, value) => sum + value, 0) / leftovers.length;
  summary.leftover.textContent = `${Math.round(meanLeftover * 100)}%`;
}

function updateReadouts(settings) {
  readouts.riseTau.textContent = `${settings.riseTau.toFixed(1)}시간`;
  readouts.initialAdenosine.textContent = `${Math.round(settings.initialAdenosine * 100)}%`;
  readouts.fallTau.textContent = `${settings.fallTau.toFixed(1)}시간`;
  readouts.period.textContent = `${settings.period.toFixed(1)}시간`;
  readouts.troughClock.textContent = `${String(settings.troughClock).padStart(2, "0")}:00`;
  readouts.sleepThreshold.textContent = `${settings.sleepThreshold >= 0 ? "+" : ""}${Math.round(settings.sleepThreshold * 100)}%p`;
  readouts.wakeGap.textContent = `${Math.round(settings.wakeGap * 100)}%p`;
  readouts.sleepLimit.textContent = `${settings.sleepLimit.toFixed(1)}시간`;
  readouts.autoSleep.textContent = settings.autoSleep ? "ON" : "OFF";
  readouts.forcedMode.textContent = settings.forcedMode ? "ON" : "OFF";
  document.body.classList.toggle("forced-draw-mode", settings.forcedMode);
  readouts.forcedCount.textContent =
    state.forcedSleeps.length === 0 ? "강제수면 없음" : `강제수면 ${state.forcedSleeps.length}개`;
}

// ── 그리기 ─────────────────────────────────────────────────

// 밤(22시~06시)을 옅게 깔아 둔다. 곡선이 어느 시간대에 있는지 눈금 없이도 읽히게 하는 장치다.
// 마우스를 움직일 때마다 다시 그리므로 잘게 쪼개지 말고 이어지는 구간 하나로 만든다.
function drawNightBands() {
  const nightStarts = [];
  for (let clockDay = -1; clockDay <= 3; clockDay += 1) {
    nightStarts.push(22 - dayStartClock + clockDay * 24);
  }
  nightStarts.forEach((start) => {
    const from = clamp(start, 0, totalHours);
    const to = clamp(start + 8, 0, totalHours);
    if (to - from <= 0) return;
    svg.appendChild(
      create("rect", {
        class: "sp-night",
        x: x(from),
        y: forceTop,
        width: x(to) - x(from),
        height: heatBottom - forceTop,
      }),
    );
  });
}

function drawSleepBands(sleepWindows) {
  sleepWindows.forEach(({ start, end, reason, forcedId }) => {
    const isForced = reason === "forced";
    const drawnEnd = Math.min(end, totalHours);
    const band = create("rect", {
      class: isForced ? "sp-band sp-band-forced" : "sp-band",
      x: x(start),
      y: forceTop,
      width: Math.max(1, x(drawnEnd) - x(start)),
      height: heatBottom - forceTop,
    });

    if (isForced) {
      band.addEventListener("click", (event) => {
        event.stopPropagation();
        state.forcedSleeps = state.forcedSleeps.filter((sleep) => sleep.id !== forcedId);
        drawChart();
      });
    }
    svg.appendChild(band);

    // 구간이 좁으면 글자가 밴드를 삐져나가 옆 밴드와 겹친다. 그때는 라벨을 접는다.
    const boxWidth = x(drawnEnd) - x(start);
    if (boxWidth < 46) return;
    svg.appendChild(
      create(
        "text",
        { class: "sp-band-label", x: x(start) + boxWidth / 2, y: forceTop + 18, "text-anchor": "middle" },
        isForced ? `강제 ${forcedId}` : formatHours(end - start),
      ),
    );
    if (boxWidth < 96) return;
    svg.appendChild(
      create(
        "text",
        { class: "sp-band-sub", x: x(start) + boxWidth / 2, y: forceTop + 34, "text-anchor": "middle" },
        `${clockLabel(start)} → ${clockLabel(end)}`,
      ),
    );
  });
}

function drawFrame(settings) {
  // 졸림 지수 100 위쪽은 "버티지 못하는 영역"이라 바탕부터 다르게 깔아 둔다.
  // 곡선이 이 구역에 들어갔는지만 봐도 잠들 시각을 읽을 수 있다.
  svg.appendChild(
    create("rect", {
      class: "sp-doze-zone",
      x: padding.left,
      y: dozeTop,
      width: plotWidth,
      height: Math.max(0, yDoze(100) - dozeTop),
    }),
  );

  // 위 패널 눈금은 0~100%로 고정한다. 예전처럼 최댓값에 맞춰 늘리면
  // 슬라이더를 만질 때마다 축이 움직여서 앞뒤를 견줄 수 없다.
  [0, 25, 50, 75, 100].forEach((percent) => {
    const yValue = yForce(percent / 100);
    svg.appendChild(
      create("line", { class: "sp-grid", x1: padding.left, x2: width - padding.right, y1: yValue, y2: yValue }),
    );
    svg.appendChild(
      create("text", { class: "sp-tick", x: padding.left - 10, y: yValue + 4, "text-anchor": "end" }, `${percent}%`),
    );
  });

  [0, 50, 100].forEach((value) => {
    const yValue = yDoze(value);
    svg.appendChild(
      create("line", {
        class: value === 100 ? "sp-grid sp-grid-strong" : "sp-grid",
        x1: padding.left,
        x2: width - padding.right,
        y1: yValue,
        y2: yValue,
      }),
    );
    svg.appendChild(
      create("text", { class: "sp-tick", x: padding.left - 10, y: yValue + 4, "text-anchor": "end" }, String(value)),
    );
  });

  for (let hour = 0; hour <= totalHours; hour += 3) {
    const isMajor = hour % 6 === 0;
    svg.appendChild(
      create("line", {
        class: isMajor ? "sp-grid" : "sp-grid sp-grid-faint",
        x1: x(hour),
        x2: x(hour),
        y1: forceTop,
        y2: dozeBottom,
      }),
    );
    if (!isMajor) continue;
    svg.appendChild(
      create(
        "text",
        { class: "sp-tick", x: x(hour), y: heatBottom + 16, "text-anchor": "middle" },
        labelForHour(hour),
      ),
    );
  }

  // 자정마다 날짜 경계. 사흘치가 한 화면에 있으면 며칠째인지 금방 헷갈린다.
  for (let day = 1; day <= 2; day += 1) {
    const boundary = 24 - dayStartClock + (day - 1) * 24;
    if (boundary > totalHours) break;
    svg.appendChild(
      create("line", { class: "sp-daybreak", x1: x(boundary), x2: x(boundary), y1: forceTop + 42, y2: heatBottom }),
    );
    svg.appendChild(
      create("text", { class: "sp-day-label", x: x(boundary) + 7, y: forceTop - 6 }, `${day + 1}일차`),
    );
  }

  // 패널 제목은 축 바깥이 아니라 눈금 위에 왼쪽 정렬로 둔다.
  // 축 바깥(padding.left 60px)에 넣으면 두 글자를 넘는 순간 잘린다.
  svg.appendChild(
    create("text", { class: "sp-axis-title", x: padding.left, y: forceTop - 11 }, "아데노신과 각성 신호 (%)"),
  );
  svg.appendChild(
    create("text", { class: "sp-axis-title", x: padding.left, y: dozeTop - 9 }, "졸림 지수 (100이면 잠든다)"),
  );
  svg.appendChild(
    create("text", { class: "sp-tick", x: padding.left - 10, y: heatTop + 11, "text-anchor": "end" }, "졸림"),
  );
}

// 졸림 지수를 시간축 위의 색 한 줄로 바꾼다. --pressure의 진하기만 바꿔 쓰므로 새 색은 없다.
// 곡선을 읽을 줄 몰라도 "언제 시커메지는가"만 보면 하루의 졸림 리듬이 그대로 보인다.
function drawHeatStrip(points) {
  svg.appendChild(
    create("rect", { class: "sp-heat-base", x: padding.left, y: heatTop, width: plotWidth, height: heatHeight }),
  );

  for (let hour = 0; hour < totalHours; hour += heatStep) {
    const index = clamp(Math.round((hour + heatStep / 2) / step), 0, points.length - 1);
    const level = clamp(points[index].doze / 100, 0, 1);
    svg.appendChild(
      create("rect", {
        class: "sp-heat",
        x: x(hour),
        y: heatTop,
        // 칸 사이에 흰 실선이 보이지 않도록 반 픽셀 겹쳐 그린다.
        width: x(hour + heatStep) - x(hour) + 0.5,
        height: heatHeight,
        "fill-opacity": (0.04 + level * 0.92).toFixed(3),
      }),
    );
  }
}

// 슬라이더를 만지기 직전의 곡선. 값 자체보다 "이 슬라이더가 무엇을 움직이는가"를 보여주는 게 목적이라
// 아데노신과 졸림 지수 둘만 남기고 문턱선은 생략한다(네 줄이 되면 회색이 그림을 덮는다).
function drawGhost() {
  const ghost = state.ghostPoints;
  if (ghost === null) return;

  svg.appendChild(create("path", { class: "sp-ghost", d: pathFor(ghost, "adenosine", yForce) }));
  svg.appendChild(create("path", { class: "sp-ghost", d: pathFor(ghost, "sleepLine", yForce) }));

  const clipped = create("g", { "clip-path": "url(#sp-doze-clip)" });
  clipped.appendChild(create("path", { class: "sp-ghost", d: pathFor(ghost, "doze", yDoze) }));
  svg.appendChild(clipped);

  svg.appendChild(
    create(
      "text",
      { class: "sp-ghost-label", x: width - padding.right, y: forceTop - 12, "text-anchor": "end" },
      "회색 = 바꾸기 전",
    ),
  );
}

function drawCurves(points, settings) {
  // 문턱 띠: 잠드는 선과 깨는 선 사이. "이 사이에 있으면 자지도 깨지도 않는다"가 한눈에 보인다.
  // 띠 자체가 몸시계의 하루 리듬을 그대로 그리므로, 이 덩어리가 오르내리는 모양이 곧 하루주기다.
  svg.appendChild(
    create("path", { class: "sp-threshold-band", d: areaBetween(points, "sleepLine", "wakeLine", yForce, () => true) }),
  );

  // 아데노신은 "쌓이는" 양이라 선만으로는 축적이 안 읽힌다. 바닥까지 채워야 부피로 보인다.
  svg.appendChild(
    create("path", { class: "sp-adenosine-fill", d: areaBetween(points, "adenosine", "floor", yForce, () => true) }),
  );

  // 잠드는 선을 넘어선 부분만 진하게 덧칠한다. 이 면적이 곧 '넘친 수면압력'이다.
  svg.appendChild(
    create("path", {
      class: "sp-overflow",
      d: areaBetween(points, "adenosine", "sleepLine", yForce, (point) => point.adenosine > point.sleepLine),
    }),
  );

  // 각성 신호(프로세스 C) 본체. 예전엔 문턱선 두 개만 그렸는데,
  // 그러면 "몸시계"라는 것이 화면 어디에도 없어서 하루주기가 개념으로 안 잡혔다.
  svg.appendChild(create("path", { class: "sp-line sp-line-circadian", d: pathFor(points, "circadian", yForce) }));
  svg.appendChild(create("path", { class: "sp-line sp-line-wake", d: pathFor(points, "wakeLine", yForce) }));
  svg.appendChild(create("path", { class: "sp-line sp-line-sleep", d: pathFor(points, "sleepLine", yForce) }));
  svg.appendChild(create("path", { class: "sp-line sp-line-adenosine", d: pathFor(points, "adenosine", yForce) }));

  // 곡선 끝 라벨. 범례를 눈으로 왕복하지 않아도 되게 선 옆에 바로 붙인다.
  const last = points[points.length - 1];
  const endLabels = [
    { key: "adenosine", text: "아데노신", className: "sp-end-label sp-end-adenosine" },
    { key: "sleepLine", text: "잠드는 선", className: "sp-end-label sp-end-sleep" },
    { key: "circadian", text: "각성 신호", className: "sp-end-label sp-end-circadian" },
    { key: "wakeLine", text: "깨는 선", className: "sp-end-label sp-end-wake" },
  ];
  // 값이 붙어 있으면 라벨끼리 겹친다. 위에서부터 최소 간격을 확보하며 아래로 민다.
  const placed = endLabels
    .map((label) => ({ ...label, y: yForce(last[label.key]) }))
    .sort((a, b) => a.y - b.y);
  placed.forEach((label, index) => {
    if (index > 0) label.y = Math.max(label.y, placed[index - 1].y + 14);
    svg.appendChild(
      create("text", { class: label.className, x: width - padding.right + 10, y: label.y + 4 }, label.text),
    );
  });

  // 졸림 지수도 0선을 기준으로 채운다. 0 위는 잠 쪽, 아래는 각성 쪽이라 부호가 색으로 갈린다.
  const dozeGroup = create("g", { "clip-path": "url(#sp-doze-clip)" });
  dozeGroup.appendChild(
    create("path", {
      class: "sp-doze-fill",
      d: areaBetween(points, "doze", "floor", yDoze, (point) => point.doze > 0),
    }),
  );
  dozeGroup.appendChild(
    create("path", {
      class: "sp-doze-fill sp-doze-fill-alert",
      d: areaBetween(points, "floor", "doze", yDoze, (point) => point.doze <= 0),
    }),
  );
  dozeGroup.appendChild(create("path", { class: "sp-line sp-line-doze", d: pathFor(points, "doze", yDoze) }));
  svg.appendChild(dozeGroup);

  svg.appendChild(
    create("text", { class: "sp-end-label sp-end-doze", x: width - padding.right + 10, y: yDoze(100) + 4 }, "100 잠"),
  );
  svg.appendChild(
    create("text", { class: "sp-end-label sp-end-doze", x: width - padding.right + 10, y: yDoze(0) + 4 }, "0 각성"),
  );
}

function drawDragPreview() {
  if (state.clickStart !== null && state.dragStart === null) {
    svg.appendChild(
      create("line", { class: "sp-forced-line", x1: x(state.clickStart), x2: x(state.clickStart), y1: forceTop, y2: heatBottom }),
    );
  }

  if (state.dragStart === null || state.dragEnd === null) return;
  const start = Math.min(state.dragStart, state.dragEnd);
  const end = Math.max(state.dragStart, state.dragEnd);
  if (end - start < 0.05) return;

  svg.appendChild(
    create("rect", {
      class: "sp-drag-preview",
      x: x(start),
      y: forceTop,
      width: Math.max(1, x(end) - x(start)),
      height: heatBottom - forceTop,
    }),
  );
}

// 마우스를 올린 시각의 값을 그대로 읽어 준다. 곡선 높이를 눈대중하지 않아도 되게 만드는 게 목적이다.
function drawHoverReadout(points) {
  if (state.hoverHour === null) return;
  const index = clamp(Math.round(state.hoverHour / step), 0, points.length - 1);
  const point = points[index];
  const px = x(point.hour);

  svg.appendChild(create("line", { class: "sp-crosshair", x1: px, x2: px, y1: forceTop, y2: heatBottom }));
  [
    { value: point.adenosine, scale: yForce, className: "sp-dot sp-dot-adenosine" },
    { value: point.circadian, scale: yForce, className: "sp-dot sp-dot-circadian" },
    { value: point.sleepLine, scale: yForce, className: "sp-dot sp-dot-sleep" },
    { value: clamp(point.doze, dozeMin, dozeMax), scale: yDoze, className: "sp-dot sp-dot-doze" },
  ].forEach(({ value, scale, className }) => {
    svg.appendChild(create("circle", { class: className, cx: px, cy: scale(value), r: 4 }));
  });

  const rows = [
    ["아데노신", `${Math.round(point.adenosine * 100)}%`],
    ["각성 신호", `${Math.round(point.circadian * 100)}%`],
    ["잠드는 선", `${Math.round(point.sleepLine * 100)}%`],
    ["졸림 지수", String(Math.round(point.doze))],
  ];
  const boxWidth = 142;
  const boxHeight = 26 + rows.length * 18;
  const flip = px + boxWidth + 16 > width - padding.right;
  const boxX = flip ? px - boxWidth - 12 : px + 12;

  const group = create("g", { class: "sp-readout" });
  group.appendChild(create("rect", { class: "sp-readout-box", x: boxX, y: forceTop + 8, width: boxWidth, height: boxHeight, rx: 8 }));
  group.appendChild(
    create(
      "text",
      { class: "sp-readout-title", x: boxX + 12, y: forceTop + 28 },
      `${clockLabel(point.hour)} · ${point.sleeping ? "자는 중" : "깨어 있음"}`,
    ),
  );
  rows.forEach(([label, value], index) => {
    const rowY = forceTop + 48 + index * 18;
    group.appendChild(create("text", { class: "sp-readout-key", x: boxX + 12, y: rowY }, label));
    group.appendChild(
      create("text", { class: "sp-readout-value", x: boxX + boxWidth - 12, y: rowY, "text-anchor": "end" }, value),
    );
  });
  svg.appendChild(group);
}

function drawChart() {
  const settings = readSettings();
  const { points, sleepWindows } = buildSimulation(settings);
  updateReadouts(settings);
  updateSummary(sleepWindows, points);

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.appendChild(create("title", { id: "chart-title" }, "아데노신과 각성 신호, 그리고 졸림 지수"));
  svg.appendChild(
    create(
      "desc",
      { id: "chart-desc" },
      "위 그래프는 깨어 있을 때 차오르는 아데노신과 몸시계가 만드는 각성 신호·잠드는 선·깨는 선이다. 아데노신이 잠드는 선을 넘으면 잠들고 깨는 선 아래로 내려가면 깬다. 가운데 그래프는 두 문턱 사이를 0에서 100으로 환산한 졸림 지수이고, 맨 아래 색띠는 같은 값을 진하기로 나타낸 것이다.",
    ),
  );

  // 졸림 패널 밖으로 나간 곡선을 잘라내는 마스크. 회색 곡선도 같이 쓰므로 맨 처음에 만든다.
  const defs = create("defs");
  const clip = create("clipPath", { id: "sp-doze-clip" });
  clip.appendChild(create("rect", { x: padding.left, y: dozeTop, width: plotWidth, height: dozeHeight }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  drawNightBands();
  drawSleepBands(sleepWindows);
  drawFrame(settings);
  drawGhost();
  drawCurves(points, settings);
  drawHeatStrip(points);
  drawDragPreview();
  drawHoverReadout(points);

  state.lastPoints = points;
}

// ── 입력 ───────────────────────────────────────────────────

function hourFromPointer(event) {
  const rect = svg.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / rect.width) * width;
  const rawHour = ((localX - padding.left) / plotWidth) * totalHours;
  return clamp(Math.round(rawHour * 4) / 4, 0, totalHours);
}

function addForcedSleep(start, end) {
  const normalizedStart = Math.min(start, end);
  const normalizedEnd = Math.max(start, end);
  if (normalizedEnd - normalizedStart < 0.25) return false;

  state.forcedSleeps.push({ id: state.nextForcedId, start: normalizedStart, end: normalizedEnd });
  state.forcedSleeps.sort((a, b) => a.start - b.start);
  state.nextForcedId += 1;
  state.clickStart = null;
  return true;
}

function beginDrag(event) {
  if (!controls.forcedMode.checked) return;
  event.preventDefault();
  state.dragStart = hourFromPointer(event);
  state.dragEnd = state.dragStart;
  drawChart();
}

function moveDrag(event) {
  if (state.dragStart === null || !controls.forcedMode.checked) return;
  event.preventDefault();
  state.dragEnd = hourFromPointer(event);
  drawChart();
}

function finishDrag(event) {
  if (state.dragStart === null) return;
  event.preventDefault();
  state.dragEnd = hourFromPointer(event);
  state.ignoreNextClick = addForcedSleep(state.dragStart, state.dragEnd);
  state.dragStart = null;
  state.dragEnd = null;
  drawChart();
}

function cancelDrag() {
  state.dragStart = null;
  state.dragEnd = null;
  drawChart();
}

// ── 무엇을 만졌는지 보여주기 ───────────────────────────────
// 슬라이더 하나가 사흘치 곡선을 통째로 갈아끼우기 때문에, 아무 표시가 없으면
// 값을 바꿔도 화면 어디가 달라졌는지 눈으로 못 쫓는다. 두 가지로 답한다.
//   1) 만지기 직전 곡선을 회색으로 남긴다(ghost)
//   2) 그 슬라이더가 움직이는 곡선을 굵게 강조한다(focus). 강조 대상은 HTML의 data-affects에 적혀 있다.

function captureGhost() {
  window.clearTimeout(state.ghostTimer);
  if (state.interacting) return; // 드래그 도중이면 처음 잡아 둔 곡선을 계속 기준으로 삼는다
  state.interacting = true;
  state.ghostPoints = state.lastPoints;
}

function releaseGhost() {
  if (!state.interacting) return;
  state.interacting = false;
  window.clearTimeout(state.ghostTimer);
  state.ghostTimer = window.setTimeout(() => {
    state.ghostPoints = null;
    drawChart();
  }, GHOST_LINGER_MS);
}

function setFocus(control) {
  const affects = control.closest("[data-affects]")?.dataset.affects;
  if (affects) svg.dataset.focus = affects;
}

function clearFocus() {
  delete svg.dataset.focus;
}

Object.values(controls).forEach((control) => {
  if (!(control instanceof HTMLInputElement)) return;
  control.addEventListener("input", drawChart);
  control.addEventListener("change", drawChart);

  if (control.type !== "range") return;
  // pointerdown과 keydown 양쪽을 잡아야 마우스로 끌 때와 화살표 키로 옮길 때가 똑같이 동작한다.
  ["pointerdown", "keydown"].forEach((eventName) => {
    control.addEventListener(eventName, () => {
      captureGhost();
      setFocus(control);
    });
  });
  ["change", "pointerup", "pointercancel", "blur"].forEach((eventName) => {
    control.addEventListener(eventName, () => {
      releaseGhost();
      clearFocus();
    });
  });
});

controls.clearForcedSleep.addEventListener("click", () => {
  state.forcedSleeps = [];
  state.dragStart = null;
  state.dragEnd = null;
  state.clickStart = null;
  drawChart();
});

// 슬라이더를 여기저기 만지다 보면 원래 하루가 어땠는지 돌아갈 길이 없어진다.
controls.reset.addEventListener("click", () => {
  Object.values(controls).forEach((control) => {
    if (!(control instanceof HTMLInputElement)) return;
    if (control.type === "checkbox") control.checked = control.defaultChecked;
    else control.value = control.defaultValue;
  });
  state.forcedSleeps = [];
  state.clickStart = null;
  state.ghostPoints = null;
  drawChart();
});

svg.addEventListener("pointerdown", (event) => {
  beginDrag(event);
  if (state.dragStart === null) return;
  svg.setPointerCapture(event.pointerId);
});

svg.addEventListener("pointermove", (event) => {
  if (state.dragStart !== null) {
    moveDrag(event);
    return;
  }
  const hour = hourFromPointer(event);
  if (state.hoverHour === hour) return; // 0.25시간 칸 안에서 움직이면 다시 그릴 이유가 없다
  state.hoverHour = hour;
  drawChart();
});

svg.addEventListener("pointerleave", () => {
  state.hoverHour = null;
  drawChart();
});

svg.addEventListener("pointerup", finishDrag);
svg.addEventListener("pointercancel", cancelDrag);

svg.addEventListener("click", (event) => {
  if (!controls.forcedMode.checked) return;
  if (state.ignoreNextClick) {
    state.ignoreNextClick = false;
    return;
  }

  const clickedHour = hourFromPointer(event);
  if (state.clickStart === null) state.clickStart = clickedHour;
  else addForcedSleep(state.clickStart, clickedHour);
  drawChart();
});

drawChart();
