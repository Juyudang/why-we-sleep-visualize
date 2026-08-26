// Visual Note 01 — 아데노신과 수면압력
//
// 모형은 Borbély의 2-프로세스 모형(1982)을 그대로 따른다.
//   프로세스 S = 아데노신(수면압력). 깨어 있으면 100%를 향해 지수적으로 차오르고, 자면 지수적으로 빠진다.
//   프로세스 C = 몸시계가 만드는 각성 신호. S가 이 곡선을 위로 뚫으면 잠들고, 아래로 빠지면 깬다.
// 시상수와 파형은 Daan·Beersma·Borbély(1984)의 값을 쓴다. 수치 근거는 저장소의 수면압력.md 참고.
//
// 화면은 '지금' 주변만 잘라 보여준다. 계산은 여전히 사흘치를 통째로 돌린다.
// 사흘을 한 판에 밀어 넣으면 하루가 300px로 눌려서 곡선의 오르내림이 안 읽혔다.

const svg = document.querySelector("#sleepChart");
const miniSvg = document.querySelector("#sleepMinimap");

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

// 시간 창을 다루는 조작부. 위 controls와 성격이 달라서 따로 둔다 —
// 이쪽은 값을 바꿔도 시뮬레이션을 다시 돌릴 필요가 없고, 보는 위치만 옮긴다.
const timeControls = {
  nowHour: document.querySelector("#nowHour"),
  play: document.querySelector("#playToggle"),
  days: document.querySelector("#dayCount"),
  windowButtons: [...document.querySelectorAll("[data-hours]")],
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

const nowPanel = {
  clock: document.querySelector("#nowClock"),
  state: document.querySelector("#nowState"),
  adenosine: document.querySelector("#nowAdenosine"),
  circadian: document.querySelector("#nowCircadian"),
  doze: document.querySelector("#nowDoze"),
  next: document.querySelector("#nowNext"),
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

// 전체 길이는 이제 고정이 아니다. 사흘을 한 판에 그리던 때는 늘리는 순간 하루가 200px로
// 눌려서 늘릴 수가 없었는데, 화면이 '지금' 주변만 잘라 보여주니 며칠이든 상관없어졌다.
const defaultDays = 3;
const dayRange = { min: 2, max: 10 };
let totalHours = defaultDays * 24; // 시뮬레이션이 다루는 전체 길이. 미니맵이 보여주는 범위이기도 하다
// 마지막 밤이 오른쪽 끝에서 잘려 "7시간 36분"처럼 거짓 길이가 찍히던 문제 때문에
// 계산은 그보다 길게 돌린다. 기록은 여전히 totalHours까지만 한다.
const simTail = 14;
let simHours = totalHours + simTail;
const step = 0.1;
const dayStartClock = 7; // 시간축 0시간 = 아침 7시
const minSleepBout = 0.6; // 이보다 짧은 잠은 채택하지 않는다. 문턱 근처에서 잠·깸이 떨리는 걸 막는 장치
const adenosineCeiling = 1; // 깨어 있을 때 아데노신이 다가가는 천장 = 100%

// ── 시간 창 ────────────────────────────────────────────────
const windowChoices = [12, 24, 48]; // 한 화면에 보이는 시간. 버튼으로 고른다
const defaultWindowHours = 24;
const defaultNowHour = 16; // 첫날 23:00. 기본값에서 잠드는 순간이라 곡선 교차가 바로 보인다
const playHoursPerSecond = 1.5; // 재생 속도. 사흘을 48초에 지나간다
const heatCellCount = 120; // 졸림 색띠를 몇 칸으로 쪼갤지. 창 크기가 바뀌어도 칸 수는 유지한다

// ── 지오메트리 ─────────────────────────────────────────────
// 세 패널: 위=두 힘의 곡선, 가운데=졸림 지수, 아래=졸림 색띠.
// 사흘을 다 그리던 때는 가로:세로를 2.9:1까지 눕혀야 했지만, 이제 한 화면이 하루치라
// 세로를 되찾았다. 곡선의 오르내림이 실제로 보이는 건 이 높이 덕분이다.
const width = 1000;
const height = 535;
const padding = { top: 34, right: 88, bottom: 24, left: 56 };
const plotWidth = width - padding.left - padding.right;

const forceTop = padding.top;
const forceHeight = 282;
const forceBottom = forceTop + forceHeight;
const dozeTop = forceBottom + 36;
const dozeHeight = 100;
const dozeBottom = dozeTop + dozeHeight;
// 졸림 색띠. 곡선 높이를 눈으로 좇지 않아도 "몇 시에 얼마나 졸린지"가 색 하나로 읽힌다.
const heatTop = dozeBottom + 8;
const heatHeight = 15;
const heatBottom = heatTop + heatHeight;

// 미니맵. 창을 좁힌 대신 "사흘 중 지금 어디를 보고 있나"를 잃지 않으려고 둔다.
// 끌면 시간이 움직이므로 스크러버 노릇도 함께 한다.
const miniWidth = 1000;
const miniHeight = 74;
const miniPadding = { top: 16, right: 10, bottom: 16, left: 10 };
const miniPlotWidth = miniWidth - miniPadding.left - miniPadding.right;
const miniTop = miniPadding.top;
const miniBottom = miniHeight - miniPadding.bottom;

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
  nowHour: defaultNowHour,
  windowHours: defaultWindowHours,
  days: defaultDays,
  scrubbing: false,
  playing: false,
  playFrame: null,
  playStamp: 0,
  // 사흘치 곡선은 설정이 그대로면 다시 계산할 이유가 없다.
  // 재생 중에는 매 프레임 다시 그리므로 이 캐시가 없으면 초당 60번씩 헛계산을 한다.
  sim: null,
  // 슬라이더를 만지기 직전의 곡선. 회색으로 겹쳐 그려서 "무엇이 어떻게 달라졌는지"를 보여준다.
  lastPoints: null,
  ghostPoints: null,
  ghostTimer: null,
  interacting: false,
};

const GHOST_LINGER_MS = 900; // 슬라이더를 놓은 뒤 회색 곡선이 남아 있는 시간

// x()가 읽는 현재 창의 왼쪽 끝. drawChart가 매번 갱신한다.
let viewStart = 0;

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

  // 기록 밖에서 시작한 잠은 버린다. 끝이 넘어가는 건 남겨야 길이를 제대로 적을 수 있다.
  return { points, sleepWindows: sleepWindows.filter((sleep) => sleep.start < totalHours) };
}

// 설정이 그대로면 지난 결과를 그대로 쓴다. 재생 중에는 시간만 흐르고 곡선은 그대로이므로
// 이 캐시가 사실상 매 프레임 적중한다.
function getSimulation(settings) {
  const key = JSON.stringify([settings, state.forcedSleeps, state.days]);
  if (state.sim === null || state.sim.key !== key) {
    state.sim = { key, ...buildSimulation(settings) };
  }
  return state.sim;
}

// 일수를 바꾸면 전체 길이가 달라지므로 '지금'과 창 크기를 다시 범위 안으로 넣어 준다.
function setDays(days) {
  state.days = clamp(Math.round(days), dayRange.min, dayRange.max);
  totalHours = state.days * 24;
  simHours = totalHours + simTail;
  state.windowHours = Math.min(state.windowHours, totalHours);
  state.nowHour = clamp(state.nowHour, 0, totalHours);
  state.sim = null;
  state.ghostPoints = null; // 길이가 달라진 회색 곡선은 겹쳐 그려도 뜻이 없다
  drawChart();
}

// ── 좌표 ───────────────────────────────────────────────────

// 창의 왼쪽 끝. 양 끝에서는 '지금'을 가운데 두지 못하므로 창을 고정하고 표시만 움직인다.
// 그렇게 안 하면 사흘의 처음과 끝에 빈 공간이 생긴다.
function windowStartFor(nowHour) {
  return clamp(nowHour - state.windowHours / 2, 0, Math.max(0, totalHours - state.windowHours));
}

function x(hour) {
  return padding.left + ((hour - viewStart) / state.windowHours) * plotWidth;
}

function miniX(hour) {
  return miniPadding.left + (hour / totalHours) * miniPlotWidth;
}

function yForce(value) {
  return forceBottom - clamp(value, 0, adenosineCeiling) * forceHeight;
}

function yDoze(value) {
  const normalized = (value - dozeMin) / (dozeMax - dozeMin);
  return dozeBottom - normalized * dozeHeight;
}

// 창 안의 점만 넘긴다. 사흘치 721개를 매번 path로 만들면 화면 밖 좌표가 대부분이라 낭비다.
// 양쪽으로 한 점씩 더 떼어야 곡선이 창 가장자리까지 이어진다(클립으로 잘라 낸다).
function visibleSlice(points) {
  const from = clamp(Math.floor(viewStart / step) - 1, 0, points.length - 1);
  const to = clamp(Math.ceil((viewStart + state.windowHours) / step) + 2, 1, points.length);
  return points.slice(from, to);
}

function pointAt(points, hour) {
  return points[clamp(Math.round(hour / step), 0, points.length - 1)];
}

function pathFor(points, key, yScale, xScale = x) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.hour).toFixed(2)} ${yScale(point[key]).toFixed(2)}`)
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

// ── 시간 표기 ──────────────────────────────────────────────

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

function dayOf(hour) {
  // 0시간 = 1일차 아침 7시. 자정을 넘길 때마다 하루가 올라간다.
  return Math.floor((dayStartClock + hour) / 24) + 1;
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

// ── 숫자 패널 ──────────────────────────────────────────────

// '지금' 한 순간의 값. 창이 좁아진 만큼 이 패널이 예전 요약의 자리를 대신한다.
function updateNowPanel(points, sleepWindows) {
  const point = pointAt(points, state.nowHour);
  nowPanel.clock.textContent = `${clockLabel(state.nowHour)}`;
  nowPanel.state.textContent = point.sleeping ? "자는 중" : "깨어 있음";
  nowPanel.state.classList.toggle("is-asleep", point.sleeping);
  nowPanel.adenosine.textContent = `${Math.round(point.adenosine * 100)}%`;
  nowPanel.circadian.textContent = `${Math.round(point.circadian * 100)}%`;
  nowPanel.doze.textContent = String(Math.round(point.doze));

  // 다음 전환까지 얼마나 남았는지. 슬라이더를 만졌을 때 "그래서 언제 자는데?"에 바로 답한다.
  if (point.sleeping) {
    const current = sleepWindows.find((sleep) => state.nowHour >= sleep.start && state.nowHour < sleep.end);
    nowPanel.next.textContent = current ? `깨기까지 ${formatHours(current.end - state.nowHour)}` : "—";
    return;
  }
  const next = sleepWindows.find((sleep) => sleep.start > state.nowHour);
  nowPanel.next.textContent = next ? `잠들기까지 ${formatHours(next.start - state.nowHour)}` : "당분간 없음";
}

// 사흘 전체를 한 줄로 요약한다. 곡선만 보고는 "그래서 몇 시간 잤는데?"에 답이 안 된다.
function updateSummary(sleepWindows, points) {
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
  const leftovers = closed.map((sleep) => pointAt(points, sleep.end).adenosine);
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

function updateTimeControls() {
  document.querySelector("#nowHourValue").textContent = `${dayOf(state.nowHour)}일차 ${clockLabel(state.nowHour)}`;
  document.querySelector("#dayCountValue").textContent = `${state.days}일`;
  document.querySelector("#minimapLabel").textContent = `${state.days}일 전체 — 끌면 시간이 움직입니다`;
  timeControls.play.textContent = state.playing ? "정지" : "재생";
  timeControls.play.setAttribute("aria-pressed", String(state.playing));
  timeControls.days.value = String(state.days);

  timeControls.windowButtons.forEach((button) => {
    const hours = Number(button.dataset.hours);
    const active = hours === state.windowHours;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    // 이틀치를 켜 놓고 48시간 창을 고르면 창이 전체와 같아져 '지금'을 따라갈 게 없어진다.
    button.disabled = hours > totalHours;
  });

  timeControls.nowHour.max = String(totalHours);
  // 재생 중에는 슬라이더가 스스로 움직여야 시간이 흐르는 게 보인다.
  if (!state.scrubbing) timeControls.nowHour.value = String(state.nowHour);
}

// ── 그리기 ─────────────────────────────────────────────────

// 밤(22시~06시)을 옅게 깔아 둔다. 곡선이 어느 시간대에 있는지 눈금 없이도 읽히게 하는 장치다.
function drawNightBands() {
  for (let day = -1; day <= state.days; day += 1) {
    const start = 22 - dayStartClock + day * 24;
    const from = clamp(start, viewStart, viewStart + state.windowHours);
    const to = clamp(start + 8, viewStart, viewStart + state.windowHours);
    if (to - from <= 0) continue;
    svg.appendChild(
      create("rect", {
        class: "sp-night",
        x: x(from),
        y: forceTop,
        width: x(to) - x(from),
        height: heatBottom - forceTop,
      }),
    );
  }
}

function drawSleepBands(sleepWindows) {
  const viewEnd = viewStart + state.windowHours;
  sleepWindows.forEach(({ start, end, reason, forcedId }) => {
    const drawnStart = clamp(start, viewStart, viewEnd);
    const drawnEnd = clamp(Math.min(end, totalHours), viewStart, viewEnd);
    if (drawnEnd - drawnStart <= 0) return;

    const isForced = reason === "forced";
    const band = create("rect", {
      class: isForced ? "sp-band sp-band-forced" : "sp-band",
      x: x(drawnStart),
      y: forceTop,
      width: Math.max(1, x(drawnEnd) - x(drawnStart)),
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
    const boxWidth = x(drawnEnd) - x(drawnStart);
    if (boxWidth < 52) return;
    const middle = x(drawnStart) + boxWidth / 2;
    svg.appendChild(
      create("text", { class: "sp-band-label", x: middle, y: forceTop + 18, "text-anchor": "middle" },
        isForced ? `강제 ${forcedId}` : formatHours(end - start)),
    );
    if (boxWidth < 118) return;
    svg.appendChild(
      create("text", { class: "sp-band-sub", x: middle, y: forceTop + 34, "text-anchor": "middle" },
        `${clockLabel(start)} → ${clockLabel(end)}`),
    );
  });
}

// 창 크기에 따라 눈금 간격을 바꾼다. 12시간 창에 3시간 눈금은 너무 성기고,
// 48시간 창에 1시간 눈금은 라벨이 서로 붙는다.
function axisTicks() {
  if (state.windowHours <= 12) return { grid: 1, label: 2 };
  if (state.windowHours <= 24) return { grid: 1, label: 3 };
  return { grid: 2, label: 6 };
}

function drawFrame() {
  const viewEnd = viewStart + state.windowHours;

  // 졸림 지수 100 위쪽은 "버티지 못하는 영역"이라 바탕부터 다르게 깔아 둔다.
  svg.appendChild(
    create("rect", {
      class: "sp-doze-zone",
      x: padding.left,
      y: dozeTop,
      width: plotWidth,
      height: Math.max(0, yDoze(100) - dozeTop),
    }),
  );

  // 위 패널 눈금은 0~100%로 고정한다. 최댓값에 맞춰 늘리면
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

  const ticks = axisTicks();
  for (let hour = Math.ceil(viewStart / ticks.grid) * ticks.grid; hour <= viewEnd + 0.001; hour += ticks.grid) {
    const isMajor = Math.abs(hour % ticks.label) < 0.001;
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
      create("text", { class: "sp-tick", x: x(hour), y: heatBottom + 16, "text-anchor": "middle" }, labelForHour(hour)),
    );
  }

  // 자정마다 날짜 경계. 창을 옮기다 보면 며칠째인지 금방 헷갈린다.
  for (let day = 1; day < state.days + 1; day += 1) {
    const boundary = 24 - dayStartClock + (day - 1) * 24;
    if (boundary < viewStart || boundary > viewEnd) continue;
    svg.appendChild(
      create("line", { class: "sp-daybreak", x1: x(boundary), x2: x(boundary), y1: forceTop + 42, y2: heatBottom }),
    );
    svg.appendChild(create("text", { class: "sp-day-label", x: x(boundary) + 7, y: forceTop - 6 }, `${day + 1}일차`));
  }

  // 패널 제목은 축 바깥이 아니라 눈금 위에 왼쪽 정렬로 둔다.
  // 축 바깥(padding.left 56px)에 넣으면 두 글자를 넘는 순간 잘린다.
  svg.appendChild(create("text", { class: "sp-axis-title", x: padding.left, y: forceTop - 11 }, "아데노신과 각성 신호 (%)"));
  svg.appendChild(create("text", { class: "sp-axis-title", x: padding.left, y: dozeTop - 9 }, "졸림 지수 (100이면 잠든다)"));
  svg.appendChild(create("text", { class: "sp-tick", x: padding.left - 10, y: heatTop + 12, "text-anchor": "end" }, "졸림"));
}

// 졸림 지수를 시간축 위의 색 한 줄로 바꾼다. --pressure의 진하기만 바꿔 쓰므로 새 색은 없다.
// 곡선을 읽을 줄 몰라도 "언제 시커메지는가"만 보면 하루의 졸림 리듬이 그대로 보인다.
function drawHeatStrip(points) {
  const group = create("g", { "clip-path": "url(#sp-plot-clip)" });
  group.appendChild(
    create("rect", { class: "sp-heat-base", x: padding.left, y: heatTop, width: plotWidth, height: heatHeight }),
  );

  // 칸을 창 시작이 아니라 전역 격자에 맞춘다. 창 시작에 맞추면 스크러빙할 때 색띠가 아른거린다.
  const cell = state.windowHours / heatCellCount;
  const viewEnd = viewStart + state.windowHours;
  for (let hour = Math.floor(viewStart / cell) * cell; hour < viewEnd; hour += cell) {
    const level = clamp(pointAt(points, hour + cell / 2).doze / 100, 0, 1);
    group.appendChild(
      create("rect", {
        class: "sp-heat",
        x: x(hour),
        y: heatTop,
        // 칸 사이에 흰 실선이 보이지 않도록 반 픽셀 겹쳐 그린다.
        width: x(hour + cell) - x(hour) + 0.5,
        height: heatHeight,
        "fill-opacity": (0.04 + level * 0.92).toFixed(3),
      }),
    );
  }
  svg.appendChild(group);
}

// 슬라이더를 만지기 직전의 곡선. 값 자체보다 "이 슬라이더가 무엇을 움직이는가"를 보여주는 게 목적이라
// 아데노신과 졸림 지수 둘만 남기고 문턱선은 생략한다(네 줄이 되면 회색이 그림을 덮는다).
function drawGhost() {
  if (state.ghostPoints === null) return;
  const ghost = visibleSlice(state.ghostPoints);
  if (ghost.length < 2) return;

  const group = create("g", { "clip-path": "url(#sp-plot-clip)" });
  group.appendChild(create("path", { class: "sp-ghost", d: pathFor(ghost, "adenosine", yForce) }));
  group.appendChild(create("path", { class: "sp-ghost", d: pathFor(ghost, "sleepLine", yForce) }));
  svg.appendChild(group);

  const clipped = create("g", { "clip-path": "url(#sp-doze-clip)" });
  clipped.appendChild(create("path", { class: "sp-ghost", d: pathFor(ghost, "doze", yDoze) }));
  svg.appendChild(clipped);

  svg.appendChild(
    create("text", { class: "sp-ghost-label", x: width - padding.right, y: forceTop - 11, "text-anchor": "end" },
      "회색 = 바꾸기 전"),
  );
}

function drawCurves(view) {
  const group = create("g", { "clip-path": "url(#sp-plot-clip)" });

  // 문턱 띠: 잠드는 선과 깨는 선 사이. "이 사이에 있으면 자지도 깨지도 않는다"가 한눈에 보인다.
  // 띠 자체가 몸시계의 하루 리듬을 그리므로, 이 덩어리가 오르내리는 모양이 곧 하루주기다.
  group.appendChild(
    create("path", { class: "sp-threshold-band", d: areaBetween(view, "sleepLine", "wakeLine", yForce, () => true) }),
  );

  // 아데노신은 "쌓이는" 양이라 선만으로는 축적이 안 읽힌다. 바닥까지 채워야 부피로 보인다.
  group.appendChild(
    create("path", { class: "sp-adenosine-fill", d: areaBetween(view, "adenosine", "floor", yForce, () => true) }),
  );

  // 잠드는 선을 넘어선 부분만 진하게 덧칠한다. 이 면적이 곧 '넘친 수면압력'이다.
  group.appendChild(
    create("path", {
      class: "sp-overflow",
      d: areaBetween(view, "adenosine", "sleepLine", yForce, (point) => point.adenosine > point.sleepLine),
    }),
  );

  // 각성 신호(프로세스 C) 본체. 문턱 두 선은 이 선에서 위아래로 떨어뜨린 것뿐이라 실선은 하나면 된다.
  group.appendChild(create("path", { class: "sp-line sp-line-circadian", d: pathFor(view, "circadian", yForce) }));
  group.appendChild(create("path", { class: "sp-line sp-line-wake", d: pathFor(view, "wakeLine", yForce) }));
  group.appendChild(create("path", { class: "sp-line sp-line-sleep", d: pathFor(view, "sleepLine", yForce) }));
  group.appendChild(create("path", { class: "sp-line sp-line-adenosine", d: pathFor(view, "adenosine", yForce) }));
  svg.appendChild(group);

  // 곡선 끝 라벨. 범례를 눈으로 왕복하지 않아도 되게 선 옆에 바로 붙인다.
  const last = view[view.length - 1];
  const endLabels = [
    { key: "adenosine", text: "아데노신", className: "sp-end-label sp-end-adenosine" },
    { key: "sleepLine", text: "잠드는 선", className: "sp-end-label sp-end-sleep" },
    { key: "circadian", text: "각성 신호", className: "sp-end-label sp-end-circadian" },
    { key: "wakeLine", text: "깨는 선", className: "sp-end-label sp-end-wake" },
  ];
  // 값이 붙어 있으면 라벨끼리 겹친다. 위에서부터 최소 간격을 확보하며 아래로 민다.
  const placed = endLabels.map((label) => ({ ...label, y: yForce(last[label.key]) })).sort((a, b) => a.y - b.y);
  placed.forEach((label, index) => {
    if (index > 0) label.y = Math.max(label.y, placed[index - 1].y + 14);
    svg.appendChild(create("text", { class: label.className, x: width - padding.right + 8, y: label.y + 4 }, label.text));
  });

  // 졸림 지수도 0선을 기준으로 채운다. 0 위는 잠 쪽, 아래는 각성 쪽이라 부호가 색으로 갈린다.
  const dozeGroup = create("g", { "clip-path": "url(#sp-doze-clip)" });
  dozeGroup.appendChild(
    create("path", { class: "sp-doze-fill", d: areaBetween(view, "doze", "floor", yDoze, (p) => p.doze > 0) }),
  );
  dozeGroup.appendChild(
    create("path", { class: "sp-doze-fill sp-doze-fill-alert", d: areaBetween(view, "floor", "doze", yDoze, (p) => p.doze <= 0) }),
  );
  dozeGroup.appendChild(create("path", { class: "sp-line sp-line-doze", d: pathFor(view, "doze", yDoze) }));
  svg.appendChild(dozeGroup);

  svg.appendChild(
    create("text", { class: "sp-end-label sp-end-doze", x: width - padding.right + 8, y: yDoze(100) + 4 }, "100 잠"),
  );
  svg.appendChild(
    create("text", { class: "sp-end-label sp-end-doze", x: width - padding.right + 8, y: yDoze(0) + 4 }, "0 각성"),
  );
}

// '지금' 표시. 창이 이 선을 따라 움직이므로 화면에서 가장 강한 세로선이어야 한다.
function drawNowMarker(points) {
  const point = pointAt(points, state.nowHour);
  const px = x(state.nowHour);

  svg.appendChild(create("line", { class: "sp-now-line", x1: px, x2: px, y1: forceTop - 2, y2: heatBottom }));
  [
    { value: point.adenosine, scale: yForce, className: "sp-now-dot sp-dot-adenosine" },
    { value: point.circadian, scale: yForce, className: "sp-now-dot sp-dot-circadian" },
    { value: clamp(point.doze, dozeMin, dozeMax), scale: yDoze, className: "sp-now-dot sp-dot-doze" },
  ].forEach(({ value, scale, className }) => {
    svg.appendChild(create("circle", { class: className, cx: px, cy: scale(value), r: 5 }));
  });

  // 시각 알약. 창 끝에 붙으면 밖으로 삐져나가므로 안쪽으로 당긴다.
  const boxWidth = 62;
  const boxX = clamp(px - boxWidth / 2, padding.left, width - padding.right - boxWidth);
  const flag = create("g", { class: "sp-now-flag" });
  flag.appendChild(create("rect", { x: boxX, y: forceTop - 21, width: boxWidth, height: 18, rx: 9 }));
  flag.appendChild(
    create("text", { x: boxX + boxWidth / 2, y: forceTop - 8, "text-anchor": "middle" }, clockLabel(state.nowHour)),
  );
  svg.appendChild(flag);
}

// 마우스를 올린 시각의 값을 그대로 읽어 준다. '지금'과 별개로 다른 시각을 넘겨볼 때 쓴다.
function drawHoverReadout(points) {
  if (state.hoverHour === null) return;
  const point = pointAt(points, state.hoverHour);
  const px = x(point.hour);

  svg.appendChild(create("line", { class: "sp-crosshair", x1: px, x2: px, y1: forceTop, y2: heatBottom }));
  [
    { value: point.adenosine, scale: yForce, className: "sp-dot sp-dot-adenosine" },
    { value: point.sleepLine, scale: yForce, className: "sp-dot sp-dot-sleep" },
    { value: clamp(point.doze, dozeMin, dozeMax), scale: yDoze, className: "sp-dot sp-dot-doze" },
  ].forEach(({ value, scale, className }) => {
    svg.appendChild(create("circle", { class: className, cx: px, cy: scale(value), r: 4 }));
  });

  const rows = [
    ["아데노신", `${Math.round(point.adenosine * 100)}%`],
    ["각성 신호", `${Math.round(point.circadian * 100)}%`],
    ["졸림 지수", String(Math.round(point.doze))],
  ];
  const boxWidth = 138;
  const boxHeight = 26 + rows.length * 18;
  const flip = px + boxWidth + 16 > width - padding.right;
  const boxX = flip ? px - boxWidth - 12 : px + 12;

  const group = create("g", { class: "sp-readout" });
  group.appendChild(create("rect", { class: "sp-readout-box", x: boxX, y: forceTop + 44, width: boxWidth, height: boxHeight, rx: 8 }));
  group.appendChild(
    create("text", { class: "sp-readout-title", x: boxX + 12, y: forceTop + 64 },
      `${clockLabel(point.hour)} · ${point.sleeping ? "자는 중" : "깨어 있음"}`),
  );
  rows.forEach(([label, value], index) => {
    const rowY = forceTop + 84 + index * 18;
    group.appendChild(create("text", { class: "sp-readout-key", x: boxX + 12, y: rowY }, label));
    group.appendChild(
      create("text", { class: "sp-readout-value", x: boxX + boxWidth - 12, y: rowY, "text-anchor": "end" }, value),
    );
  });
  svg.appendChild(group);
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

// ── 미니맵 ─────────────────────────────────────────────────
// 창을 좁힌 대가로 사흘의 큰 그림을 잃을 뻔했다. 여기가 그 자리다.
// 지금 보고 있는 구간을 상자로 표시하고, 끌면 시간이 따라온다.
function drawMinimap(points, sleepWindows) {
  miniSvg.replaceChildren();
  miniSvg.setAttribute("viewBox", `0 0 ${miniWidth} ${miniHeight}`);

  miniSvg.appendChild(
    create("rect", { class: "sp-mini-base", x: miniPadding.left, y: miniTop, width: miniPlotWidth, height: miniBottom - miniTop }),
  );

  for (let day = -1; day <= state.days; day += 1) {
    const from = clamp(22 - dayStartClock + day * 24, 0, totalHours);
    const to = clamp(30 - dayStartClock + day * 24, 0, totalHours);
    if (to - from <= 0) continue;
    miniSvg.appendChild(
      create("rect", { class: "sp-night", x: miniX(from), y: miniTop, width: miniX(to) - miniX(from), height: miniBottom - miniTop }),
    );
  }

  sleepWindows.forEach(({ start, end, reason }) => {
    const to = clamp(Math.min(end, totalHours), 0, totalHours);
    if (to - start <= 0) return;
    miniSvg.appendChild(
      create("rect", {
        class: reason === "forced" ? "sp-band sp-band-forced" : "sp-band",
        x: miniX(start),
        y: miniTop,
        width: Math.max(1, miniX(to) - miniX(start)),
        height: miniBottom - miniTop,
      }),
    );
  });

  // 곡선은 형태만 알아보면 되므로 점을 솎아 낸다. 일수를 늘려도 점 개수가 비슷하게 유지되도록
  // 솎는 간격을 전체 길이에 비례시킨다.
  const stride = Math.max(2, Math.round(points.length / 300));
  const sparse = points.filter((_, index) => index % stride === 0);
  const yMini = (value) => miniBottom - clamp(value, 0, adenosineCeiling) * (miniBottom - miniTop);
  miniSvg.appendChild(create("path", { class: "sp-mini-line", d: pathFor(sparse, "adenosine", yMini, miniX) }));

  // 날짜 라벨은 자리가 있을 때만 적는다. 열흘치를 켜면 하루가 100px도 안 돼서 글자가 겹친다.
  const dayWidth = miniPlotWidth / state.days;
  for (let day = 1; day < state.days + 1; day += 1) {
    const boundary = 24 - dayStartClock + (day - 1) * 24;
    if (boundary > totalHours) break;
    miniSvg.appendChild(
      create("line", { class: "sp-daybreak", x1: miniX(boundary), x2: miniX(boundary), y1: miniTop, y2: miniBottom }),
    );
    if (dayWidth < 74) continue;
    miniSvg.appendChild(create("text", { class: "sp-day-label", x: miniX(boundary) + 5, y: miniTop - 4 }, `${day + 1}일차`));
  }
  if (dayWidth >= 74) {
    miniSvg.appendChild(create("text", { class: "sp-day-label", x: miniPadding.left + 2, y: miniTop - 4 }, "1일차"));
  }

  // 지금 보고 있는 구간.
  miniSvg.appendChild(
    create("rect", {
      class: "sp-mini-window",
      x: miniX(viewStart),
      y: miniTop - 3,
      width: Math.max(4, miniX(viewStart + state.windowHours) - miniX(viewStart)),
      height: miniBottom - miniTop + 6,
    }),
  );
  miniSvg.appendChild(
    create("line", { class: "sp-mini-now", x1: miniX(state.nowHour), x2: miniX(state.nowHour), y1: miniTop - 5, y2: miniBottom + 5 }),
  );
}

// ── 한 번에 다시 그리기 ────────────────────────────────────

function drawChart() {
  const settings = readSettings();
  const { points, sleepWindows } = getSimulation(settings);

  viewStart = windowStartFor(state.nowHour);
  updateReadouts(settings);
  updateTimeControls();
  updateNowPanel(points, sleepWindows);
  updateSummary(sleepWindows, points);

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.appendChild(create("title", { id: "chart-title" }, "아데노신과 각성 신호, 그리고 졸림 지수"));
  svg.appendChild(
    create("desc", { id: "chart-desc" },
      "위 그래프는 깨어 있을 때 차오르는 아데노신과 몸시계가 만드는 각성 신호·잠드는 선·깨는 선이다. 아데노신이 잠드는 선을 넘으면 잠들고 깨는 선 아래로 내려가면 깬다. 가운데 그래프는 두 문턱 사이를 0에서 100으로 환산한 졸림 지수이고, 맨 아래 색띠는 같은 값을 진하기로 나타낸 것이다. 화면에는 '지금' 주변의 정해진 시간만 보이고, 아래 미니맵이 사흘 중 어디인지를 알려 준다."),
  );

  // 창 밖으로 삐져나간 곡선을 잘라내는 마스크. 회색 곡선과 색띠도 같이 쓰므로 맨 처음에 만든다.
  const defs = create("defs");
  const plotClip = create("clipPath", { id: "sp-plot-clip" });
  plotClip.appendChild(create("rect", { x: padding.left, y: 0, width: plotWidth, height }));
  const dozeClip = create("clipPath", { id: "sp-doze-clip" });
  dozeClip.appendChild(create("rect", { x: padding.left, y: dozeTop, width: plotWidth, height: dozeHeight }));
  defs.append(plotClip, dozeClip);
  svg.appendChild(defs);

  drawNightBands();
  drawSleepBands(sleepWindows);
  drawFrame();
  drawGhost();
  drawCurves(visibleSlice(points));
  drawHeatStrip(points);
  drawDragPreview();
  drawNowMarker(points);
  drawHoverReadout(points);
  drawMinimap(points, sleepWindows);

  state.lastPoints = points;
}

// ── 시간 이동 ──────────────────────────────────────────────

function setNowHour(hour, { fromSlider = false } = {}) {
  state.nowHour = clamp(hour, 0, totalHours);
  if (!fromSlider) timeControls.nowHour.value = String(state.nowHour);
  drawChart();
}

function stopPlaying() {
  if (!state.playing) return;
  state.playing = false;
  if (state.playFrame !== null) cancelAnimationFrame(state.playFrame);
  state.playFrame = null;
  drawChart();
}

function startPlaying() {
  if (state.playing) return;
  // 끝에 닿은 채로 재생을 누르면 처음으로 돌아간다. 안 그러면 아무 일도 안 일어난 것처럼 보인다.
  if (state.nowHour >= totalHours - 0.01) state.nowHour = 0;
  state.playing = true;
  // 기준 시각은 첫 프레임에서 잡는다. performance.now()로 미리 잡아 두면 안 된다 —
  // rAF가 넘겨주는 stamp와 시계가 달라서 첫 걸음이 엉뚱한 크기로(심지어 뒤로) 뛴다.
  state.playStamp = null;
  drawChart(); // 첫 프레임을 기다리지 않고 버튼을 '정지'로 바꾼다

  const tick = (stamp) => {
    if (!state.playing) return;
    if (state.playStamp === null) state.playStamp = stamp;
    // dt 클램프. 탭이 잠깐 멈췄다 돌아오면 한 프레임에 몇 시간씩 건너뛴다.
    const elapsed = clamp((stamp - state.playStamp) / 1000, 0, 0.25);
    state.playStamp = stamp;
    state.nowHour += elapsed * playHoursPerSecond;
    if (state.nowHour >= totalHours) {
      state.nowHour = totalHours;
      drawChart();
      stopPlaying();
      return;
    }
    drawChart();
    state.playFrame = requestAnimationFrame(tick);
  };
  state.playFrame = requestAnimationFrame(tick);
}

// ── 입력 ───────────────────────────────────────────────────

function hourFromPointer(event) {
  const rect = svg.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / rect.width) * width;
  const rawHour = viewStart + ((localX - padding.left) / plotWidth) * state.windowHours;
  return clamp(Math.round(rawHour * 4) / 4, 0, totalHours);
}

function hourFromMinimap(event) {
  const rect = miniSvg.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / rect.width) * miniWidth;
  return clamp(((localX - miniPadding.left) / miniPlotWidth) * totalHours, 0, totalHours);
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

function finishDrag(event) {
  if (state.dragStart === null) return;
  event.preventDefault();
  state.dragEnd = hourFromPointer(event);
  state.ignoreNextClick = addForcedSleep(state.dragStart, state.dragEnd);
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
  state.windowHours = defaultWindowHours;
  state.nowHour = defaultNowHour;
  stopPlaying();
  setDays(defaultDays);
});

// 시간 슬라이더. 손으로 끄는 동안에는 재생을 멈춘다 — 둘이 동시에 시간을 밀면 손이 진다.
timeControls.nowHour.addEventListener("pointerdown", () => {
  state.scrubbing = true;
  stopPlaying();
});
["pointerup", "pointercancel", "blur", "change"].forEach((eventName) => {
  timeControls.nowHour.addEventListener(eventName, () => {
    state.scrubbing = false;
  });
});
timeControls.nowHour.addEventListener("input", () => {
  setNowHour(Number(timeControls.nowHour.value), { fromSlider: true });
});

timeControls.play.addEventListener("click", () => {
  if (state.playing) stopPlaying();
  else startPlaying();
});

timeControls.windowButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.windowHours = Math.min(Number(button.dataset.hours), totalHours);
    drawChart();
  });
});

timeControls.days.addEventListener("input", () => setDays(Number(timeControls.days.value)));

// 미니맵을 끌면 시간이 따라온다. 사흘 중 원하는 지점으로 한 번에 건너뛰는 길이다.
miniSvg.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  stopPlaying();
  state.scrubbing = true;
  miniSvg.setPointerCapture(event.pointerId);
  setNowHour(hourFromMinimap(event));
});

miniSvg.addEventListener("pointermove", (event) => {
  if (!state.scrubbing) return;
  event.preventDefault();
  setNowHour(hourFromMinimap(event));
});

["pointerup", "pointercancel"].forEach((eventName) => {
  miniSvg.addEventListener(eventName, () => {
    state.scrubbing = false;
  });
});

svg.addEventListener("pointerdown", (event) => {
  beginDrag(event);
  if (state.dragStart === null) return;
  svg.setPointerCapture(event.pointerId);
});

svg.addEventListener("pointermove", (event) => {
  if (state.dragStart !== null) {
    if (!controls.forcedMode.checked) return;
    event.preventDefault();
    state.dragEnd = hourFromPointer(event);
    drawChart();
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
svg.addEventListener("pointercancel", () => {
  state.dragStart = null;
  state.dragEnd = null;
  drawChart();
});

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

// 읽는 법 안내는 그래프 위에 겹쳐 뜬다. 덮고 있는 동안은 드래그로 강제수면을 만들 수 없으므로
// 바깥을 누르거나 Esc를 치면 닫히게 한다. details 기본 동작에는 이게 없다.
const guide = document.querySelector(".sp-guide");
if (guide !== null) {
  document.addEventListener("pointerdown", (event) => {
    if (!guide.open) return;
    if (guide.contains(event.target)) return;
    guide.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !guide.open) return;
    guide.open = false;
    guide.querySelector("summary").focus();
  });
}

// 탭을 떠나면 재생을 멈춘다. 안 그러면 돌아왔을 때 시간이 엉뚱한 데 가 있다.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlaying();
});

timeControls.days.min = String(dayRange.min);
timeControls.days.max = String(dayRange.max);
timeControls.nowHour.value = String(defaultNowHour);
drawChart();
