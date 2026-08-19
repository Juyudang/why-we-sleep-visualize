// ── 밤의 뼈대 ─────────────────────────────────────────────
// 23시에 눕고 8시간 뒤에 침대에서 나온다. preHours는 그래프 왼쪽에 붙이는
// 취침 전 구간으로, "언제 마셨는가"를 시간축 위에 찍기 위해서만 존재한다.
const night = {
  bedtimeClock: 23,
  inBedHours: 8,
  preHours: 3,
  cycleHours: 1.5,
  baseOnsetHours: 0.25,
};

// 30초 간격으로 밤을 훑는다. 알코올이 만드는 각성은 1분이 안 되는 것이 많아서
// 1분 해상도로 보면 "짧아서 기억나지 않는 각성"이 통째로 사라진다.
const step = 1 / 120;
const nightSeed = 20260819;

// ── 혈중알코올 ────────────────────────────────────────────
// Widmark 근사. 표준잔 1잔 = 순수 알코올 14g, 체중 70kg, 체수분 계수 0.68.
// 한 잔이 올리는 최고 농도는 14 / (70000 × 0.68) ≒ 0.029%다.
const drink = {
  risePerDrink: 0.029,
  absorbHours: 0.75,
  burnPerHour: 0.015,
};

// ── 알코올이 밤에 하는 일 ─────────────────────────────────
// 세 가지 효과의 방향과 상대적 민감도만 연구에서 가져왔다. 절대값은 조정한 값이다.
//   · REM은 낮은 용량에서도 가장 먼저 밀린다 (Gardiner et al. 2025 메타분석)
//   · 서파(N3)는 전반부에 늘어난다 (Ebrahim et al. 2013)
//   · 잠들기까지가 줄어드는 것은 고용량에서만 확인된다 (같은 메타분석)
const effects = {
  remBlockBac: 0.012,
  remBlockFull: 0.095,
  // 아무리 마셔도 REM이 0이 되지는 않는다. 눌리는 최대 비율에 뚜껑을 씌운다.
  remBlockMax: 0.8,
  remReboundShare: 0.55,

  swsGainBac: 0.03,
  swsGainFull: 0.07,
  swsGainMax: 0.3,

  solCutBac: 0.055,
  solCutFull: 0.085,
  solCutMax: 0.45,

  // 30초당 각성 확률. 술이 없어도 밤에 두어 번은 깬다.
  arousalBase: 0.003,
  arousalRebound: 0.013,
  // 각성을 부르는 것은 "얼마나 떨어졌는가"다. 상대비가 아니라 절대 낙폭으로 재야
  //   많이 마신 밤이 덜 깨는 것처럼 뒤집히지 않는다.
  arousalDrop: 0.05,

  // 이보다 짧은 각성은 아침에 기억나지 않는 것으로 본다.
  rememberMinutes: 2,
};

// 사이클 하나 안의 단계 배치. 사이클 번호가 커질수록 N3가 줄고 REM이 길어진다.
const architecture = {
  n3First: 0.38,
  n3Drop: 0.1,
  remFirst: 0.06,
  remGrow: 0.075,
  remMax: 0.3,
  n2LeadShare: 0.45,
};

const stageRows = ["wake", "rem", "n1", "n2", "n3"];
const stageLabels = {
  wake: "각성",
  rem: "REM",
  n1: "N1",
  n2: "N2",
  n3: "N3 · 깊은 잠",
};

// ── 차트 배치 ─────────────────────────────────────────────
const chart = {
  width: 900,
  padding: { top: 26, right: 22, bottom: 42, left: 70 },
  gap: 30,
  panels: { bac: 84, hypnogram: 138, rem: 104 },
};
const plotWidth = chart.width - chart.padding.left - chart.padding.right;
const panelTop = {
  bac: chart.padding.top,
  hypnogram: chart.padding.top + chart.panels.bac + chart.gap,
  rem: chart.padding.top + chart.panels.bac + chart.panels.hypnogram + chart.gap * 2,
};
const chartHeight = panelTop.rem + chart.panels.rem + chart.padding.bottom;
const bacMax = 0.16;

// ── DOM ───────────────────────────────────────────────────
const eegCanvas = document.querySelector("#eegCanvas");
const eegCtx = eegCanvas.getContext("2d");
const svg = document.querySelector("#nightChart");
const memorySvg = document.querySelector("#memoryChart");

const controls = {
  eegDose: document.querySelector("#eegDose"),
  eegPlay: document.querySelector("#eegPlay"),
  drinks: document.querySelector("#drinks"),
  drinkAhead: document.querySelector("#drinkAhead"),
  speed: document.querySelector("#speed"),
  showRemembered: document.querySelector("#showRemembered"),
  playToggle: document.querySelector("#playToggle"),
  restart: document.querySelector("#restart"),
};

const readouts = {
  eegDose: document.querySelector("#eegDoseValue"),
  eegPlay: document.querySelector("#eegPlayValue"),
  delta: document.querySelector("#deltaValue"),
  spindle: document.querySelector("#spindleValue"),
  theta: document.querySelector("#thetaValue"),
  eegVerdict: document.querySelector("#eegVerdict"),

  drinks: document.querySelector("#drinksValue"),
  ahead: document.querySelector("#aheadValue"),
  speed: document.querySelector("#speedValue"),
  remembered: document.querySelector("#rememberedValue"),
  status: document.querySelector("#statusValue"),

  clock: document.querySelector("#clockValue"),
  bac: document.querySelector("#bacValue"),
  stage: document.querySelector("#stageValue"),
  rem: document.querySelector("#remValue"),
  wake: document.querySelector("#wakeValue"),
  remember: document.querySelector("#rememberValue"),

  sol: document.querySelector("#summarySol"),
  tst: document.querySelector("#summaryTst"),
  n3: document.querySelector("#summaryN3"),
  remTotal: document.querySelector("#summaryRem"),
  remBar: document.querySelector("#remBarFill"),
  verdict: document.querySelector("#summaryVerdict"),
};

// ── 작은 헬퍼 ─────────────────────────────────────────────
// 밤마다 각성이 어디에 떨어지는지는 무작위지만, 씨앗은 모든 설정에서 하나로 고정한다.
// 설정마다 씨앗이 달라지면 잔을 한 칸 올렸는데 REM이 오히려 늘어나는 식으로 결과가 튀어서,
// 무엇 때문에 달라졌는지 읽을 수 없다.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clockLabel(hour) {
  const minutes = Math.round((night.bedtimeClock + hour) * 60);
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatMinutes(hours) {
  return `${Math.round(hours * 60)}분`;
}

function x(hour) {
  return chart.padding.left + ((hour + night.preHours) / (night.preHours + night.inBedHours)) * plotWidth;
}

// ── 혈중알코올 곡선 ───────────────────────────────────────
// hour는 취침 시각 기준(음수면 눕기 전). 다 마신 시점부터 흡수가 시작된다고 본다.
function bacAt(hour, settings) {
  const since = hour + settings.ahead;
  if (since <= 0 || settings.drinks <= 0) return 0;
  const peak = settings.drinks * drink.risePerDrink;
  const absorbed = peak * Math.min(1, since / drink.absorbHours);
  return Math.max(0, absorbed - drink.burnPerHour * since);
}

// ── 하룻밤 만들기 ─────────────────────────────────────────
// 사이클 하나를 비율로 쪼갠다. bac이 높을수록 REM 자리가 줄고 그 몫의 일부를 서파가 가져간다.
function cycleShape(cycleIndex, bac) {
  const remBlock =
    clamp((bac - effects.remBlockBac) / (effects.remBlockFull - effects.remBlockBac), 0, 1) * effects.remBlockMax;
  const swsGain =
    clamp((bac - effects.swsGainBac) / (effects.swsGainFull - effects.swsGainBac), 0, 1) * effects.swsGainMax;

  const remBase = Math.min(architecture.remMax, architecture.remFirst + architecture.remGrow * cycleIndex);
  const n3Base = Math.max(0, architecture.n3First - architecture.n3Drop * cycleIndex);

  const rem = remBase * (1 - remBlock);
  const n3 = Math.min(0.62, n3Base * (1 + swsGain * 0.5) + (remBase - rem) * swsGain);
  const n2 = Math.max(0.1, 1 - rem - n3);
  return { rem, n3, n2 };
}

// 잠든 뒤 경과 시간(sleepElapsed)만으로 위치를 잡는다. 중간에 깨면 시계는 흐르지만
// 사이클은 멈춰 있다고 본다 — 그래서 각성이 잦으면 사이클 수 자체가 줄어든다.
function stageFromShape(sleepElapsed, shape) {
  if (sleepElapsed < 0.1) return "n1";
  const p = (sleepElapsed % night.cycleHours) / night.cycleHours;
  const lead = shape.n2 * architecture.n2LeadShare;
  if (p < lead) return "n2";
  if (p < lead + shape.n3) return "n3";
  if (p < 1 - shape.rem) return "n2";
  return "rem";
}

function arousalChance(bac, peakBac) {
  if (peakBac < 0.005) return effects.arousalBase;
  const fallen = clamp((peakBac - bac) / effects.arousalDrop, 0, 1);
  const strength = clamp(peakBac / 0.05, 0, 2);
  return effects.arousalBase + effects.arousalRebound * fallen * fallen * strength;
}

function buildNight(settings) {
  const rng = mulberry32(nightSeed);

  // 각성 확률의 기준이 되는 그날 밤 최고 농도.
  let peakBac = 0;
  for (let h = 0; h <= night.inBedHours; h += step) peakBac = Math.max(peakBac, bacAt(h, settings));

  // 잠들기까지는 고용량에서만 눈에 띄게 줄어든다. 눕고 20분쯤의 농도로 판정한다.
  const solPeak = Math.max(bacAt(0.33, settings), bacAt(0.83, settings));
  const solCut =
    clamp((solPeak - effects.solCutBac) / (effects.solCutFull - effects.solCutBac), 0, 1) * effects.solCutMax;
  const onsetHours = night.baseOnsetHours * (1 - solCut);

  const samples = [];
  const arousals = [];
  let sleepElapsed = 0;
  let wakeLeft = 0;
  let remDebt = 0;
  let remPaid = 0;
  const totals = { rem: 0, n3: 0, n2: 0, n1: 0, wake: 0 };

  const totalSteps = Math.round(night.inBedHours / step);
  for (let i = 0; i < totalSteps; i += 1) {
    const hour = i * step;
    const bac = bacAt(hour, settings);
    let stage;

    if (hour < onsetHours) {
      stage = "wake";
    } else if (wakeLeft > 0) {
      stage = "wake";
      wakeLeft -= step;
    } else if (rng() < arousalChance(bac, peakBac)) {
      // 대부분은 몇십 초짜리다. 가끔 몇 분씩 이어지는 것이 아침에 기억나는 각성이 된다.
      const minutes = rng() < 0.15 ? 2.5 + rng() * 4.5 : 0.5 + rng() * 1.2;
      arousals.push({ hour, minutes });
      wakeLeft = minutes / 60 - step;
      stage = "wake";
    } else {
      const cycleIndex = Math.floor(sleepElapsed / night.cycleHours);
      stage = stageFromShape(sleepElapsed, cycleShape(cycleIndex, bac));
      const sober = stageFromShape(sleepElapsed, cycleShape(cycleIndex, 0));

      if (sober === "rem" && stage !== "rem") {
        // 눌린 REM은 빚으로 쌓아둔다.
        remDebt += step;
      } else if (
        stage === "n2" &&
        bac < effects.remBlockBac &&
        remPaid < remDebt * effects.remReboundShare &&
        (sleepElapsed % night.cycleHours) / night.cycleHours > 0.55
      ) {
        // 농도가 빠진 뒤 사이클 뒷부분에서 일부만 되돌아온다(REM 반동).
        // 빚 전부가 아니라 일부만 갚기 때문에 총량은 끝내 회복되지 않는다.
        stage = "rem";
        remPaid += step;
      }
      sleepElapsed += step;
    }

    totals[stage] += step;
    samples.push({ hour, bac, stage });
  }

  const remembered = arousals.filter((a) => a.minutes >= effects.rememberMinutes);
  return {
    settings,
    samples,
    arousals,
    remembered,
    onsetHours,
    peakBac,
    totals,
    sleepHours: night.inBedHours - totals.wake,
    remDebt,
    remPaid,
  };
}

// 짧은 각성을 지운 밤. "본인이 기억하는 밤"이 실제와 얼마나 다른지 보여주는 데 쓴다.
function rememberedSamples(result) {
  const copy = result.samples.map((s) => ({ ...s }));
  let runStart = -1;
  for (let i = 0; i <= copy.length; i += 1) {
    const isWake = i < copy.length && copy[i].stage === "wake";
    if (isWake && runStart < 0) runStart = i;
    if (!isWake && runStart >= 0) {
      const minutes = (i - runStart) * step * 60;
      // 눕고 처음 깨어 있는 구간은 잠들기 전이므로 손대지 않는다.
      if (minutes < effects.rememberMinutes && runStart > 0) {
        const filler = copy[runStart - 1].stage;
        for (let j = runStart; j < i; j += 1) copy[j].stage = filler;
      }
      runStart = -1;
    }
  }
  return copy;
}

// ── 뇌파 합성 ─────────────────────────────────────────────
// 실제 기록이 아니라 각 상태의 특징을 더해 만든 모식 파형이다.
// 같은 시각에는 항상 같은 값이 나와야 파형이 "흐르는" 것처럼 보이므로 난수 대신 해시를 쓴다.
function hash(n) {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
}

function noise(v) {
  const i = Math.floor(v);
  const f = v - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i) * 2 - 1) * (1 - u) + (hash(i + 1) * 2 - 1) * u;
}

const spindlePeriod = 4.6;
const spindleWidth = 0.8;

function spindleEnvelope(t) {
  const phase = ((t % spindlePeriod) + spindlePeriod) % spindlePeriod;
  if (phase > spindleWidth) return 0;
  return Math.sin((phase / spindleWidth) * Math.PI) ** 2;
}

// K복합체: 아래로 크게 꺾였다가 위로 되튀는 한 방.
function kComplex(t) {
  const period = 9.3;
  const phase = ((t % period) + period) % period;
  const d = phase - 1.6;
  if (Math.abs(d) > 0.5) return 0;
  return -0.5 * Math.exp(-(d * d) / 0.006) + 0.28 * Math.exp(-((d - 0.2) ** 2) / 0.012);
}

function wakeTrace(t) {
  return 0.15 * Math.sin(2 * Math.PI * 10 * t) * (0.55 + 0.45 * noise(t * 1.7)) + 0.09 * noise(t * 45);
}

// s = 0이면 자연스러운 잠과 완전히 같은 식이다. 잔을 늘릴수록
// 느린 파도는 커지고, 방추와 K복합체는 지워지고, 고용량에서 5.5Hz 세타가 올라온다.
function sleepTrace(t, s) {
  const delta = (0.6 + 0.3 * s) * Math.sin(2 * Math.PI * (0.85 * t + 0.12 * noise(t * 0.4) * (1 - 0.7 * s)));
  const spindle = spindleEnvelope(t) * 0.26 * (1 - s) * Math.sin(2 * Math.PI * 13 * t);
  const theta = 0.34 * (clamp((s - 0.55) / 0.45, 0, 1)) * Math.sin(2 * Math.PI * 5.5 * t);
  return delta + spindle + kComplex(t) * (1 - 0.85 * s) + theta + 0.045 * noise(t * 32) * (1 - 0.4 * s);
}

const eeg = {
  windowSeconds: 12,
  lanes: [
    { title: "각성", note: "빠르고 작은 파형", color: "#c9822b", trace: () => 0 },
    { title: "자연스러운 잠 (N2·N3)", note: "느린 파도 + 수면방추", color: "#2f8f74", trace: () => 0 },
    { title: "알코올 진정", note: "느린 파도만 남는다", color: "#8c5a3c", trace: () => 0 },
  ],
};

function drawEeg(now) {
  const dose = Number(controls.eegDose.value);
  const s = clamp(dose / 4, 0, 1);
  const w = eegCanvas.width;
  const h = eegCanvas.height;
  const left = 176;
  const laneHeight = (h - 24) / 3;
  const traceWidth = w - left - 18;

  eegCtx.clearRect(0, 0, w, h);
  eegCtx.fillStyle = "#ffffff";
  eegCtx.fillRect(0, 0, w, h);

  const traces = [(t) => wakeTrace(t), (t) => sleepTrace(t, 0), (t) => sleepTrace(t, s)];

  eeg.lanes.forEach((lane, index) => {
    const top = 12 + laneHeight * index;
    const mid = top + laneHeight / 2;

    eegCtx.strokeStyle = "#e7edf2";
    eegCtx.lineWidth = 1;
    eegCtx.beginPath();
    eegCtx.moveTo(left, top + laneHeight - 2);
    eegCtx.lineTo(w - 18, top + laneHeight - 2);
    eegCtx.stroke();

    eegCtx.fillStyle = "#18202a";
    eegCtx.font = "800 14px Inter, system-ui, sans-serif";
    eegCtx.fillText(lane.title, 16, mid - 4);
    eegCtx.fillStyle = "#66727f";
    eegCtx.font = "700 12px Inter, system-ui, sans-serif";
    eegCtx.fillText(lane.note, 16, mid + 15);

    // 방추가 있어야 할 자리. 자연 수면에는 띠로 표시하고,
    // 알코올 쪽에서는 같은 자리가 비어 있다는 것을 점선으로 남긴다.
    if (index > 0) {
      const gone = index === 2 && s > 0.25;
      for (let k = -1; k < eeg.windowSeconds / spindlePeriod + 1; k += 1) {
        const start = Math.ceil((now - eeg.windowSeconds) / spindlePeriod + k) * spindlePeriod;
        const px0 = left + ((start - (now - eeg.windowSeconds)) / eeg.windowSeconds) * traceWidth;
        const px1 = px0 + (spindleWidth / eeg.windowSeconds) * traceWidth;
        if (px1 < left || px0 > w - 18) continue;
        eegCtx.save();
        eegCtx.beginPath();
        eegCtx.rect(left, top, traceWidth, laneHeight);
        eegCtx.clip();
        eegCtx.fillStyle = gone ? "rgb(140 90 60 / 0.07)" : "rgb(134 87 201 / 0.13)";
        eegCtx.fillRect(px0, top + 4, px1 - px0, laneHeight - 12);
        if (gone) {
          eegCtx.strokeStyle = "rgb(140 90 60 / 0.5)";
          eegCtx.setLineDash([3, 3]);
          eegCtx.strokeRect(px0, top + 4, px1 - px0, laneHeight - 12);
          eegCtx.setLineDash([]);
        }
        eegCtx.restore();
      }
    }

    eegCtx.strokeStyle = lane.color;
    eegCtx.lineWidth = 1.6;
    eegCtx.lineJoin = "round";
    eegCtx.beginPath();
    for (let px = 0; px <= traceWidth; px += 1) {
      const t = now - eeg.windowSeconds + (px / traceWidth) * eeg.windowSeconds;
      const y = mid - traces[index](t) * (laneHeight / 2 - 10);
      if (px === 0) eegCtx.moveTo(left, y);
      else eegCtx.lineTo(left + px, y);
    }
    eegCtx.stroke();
  });

  // 방추 라벨은 파형 위에 한 번만 얹는다.
  eegCtx.fillStyle = "#8657c9";
  eegCtx.font = "800 11px Inter, system-ui, sans-serif";
  eegCtx.fillText("수면방추", left + 6, 12 + laneHeight + 16);
  if (s > 0.25) {
    eegCtx.fillStyle = "#8c5a3c";
    eegCtx.fillText("방추가 있어야 할 자리", left + 6, 12 + laneHeight * 2 + 16);
  }
}

function updateEegReadout() {
  const dose = Number(controls.eegDose.value);
  const s = clamp(dose / 4, 0, 1);
  readouts.eegDose.textContent = dose === 0 ? "안 마심" : `${dose}잔`;
  readouts.delta.textContent = `${Math.round((1 + 0.5 * s) * 100)}%`;
  readouts.spindle.textContent = `${Math.round((1 - s) * 100)}%`;
  readouts.theta.textContent = `${Math.round(clamp((s - 0.55) / 0.45, 0, 1) * 100)}%`;

  if (s === 0) readouts.eegVerdict.textContent = "자연스러운 잠. 느린 파도 위에 방추가 규칙적으로 얹혀 있습니다.";
  else if (s < 0.4)
    readouts.eegVerdict.textContent = "느린 파도는 오히려 커졌는데 방추는 벌써 성글어졌습니다. 더 깊어 보이지만 하는 일은 줄었습니다.";
  else if (s < 0.7)
    readouts.eegVerdict.textContent = "방추가 거의 사라졌습니다. 뇌파의 진폭만 보면 깊은 잠 같지만 기억을 옮기는 신호가 없습니다.";
  else
    readouts.eegVerdict.textContent = "잠의 파형이라기보다 마취의 가벼운 형태에 가깝습니다. 잠에는 없는 5.5Hz 세타가 올라와 있습니다.";
}

// ── 밤 그래프 ─────────────────────────────────────────────
let result = null;
let baseline = null;
let playTime = 0;
let playing = false;
let lastFrame = null;

function settingsFromControls() {
  return {
    drinks: Number(controls.drinks.value),
    ahead: Number(controls.drinkAhead.value),
  };
}

function stageRowY(stage) {
  const rowHeight = chart.panels.hypnogram / stageRows.length;
  return panelTop.hypnogram + stageRows.indexOf(stage) * rowHeight + rowHeight / 2;
}

function cumulativeRem(samples) {
  const points = [];
  let total = 0;
  samples.forEach((s) => {
    if (s.stage === "rem") total += step;
    points.push({ hour: s.hour, total });
  });
  return points;
}

function renderChart() {
  const remCurve = cumulativeRem(result.samples);
  const baseCurve = cumulativeRem(baseline.samples);
  const remScale = Math.max(baseline.totals.rem, result.totals.rem, 0.5);
  const showRemembered = controls.showRemembered.checked;
  const shown = showRemembered ? rememberedSamples(result) : result.samples;

  svg.setAttribute("viewBox", `0 0 ${chart.width} ${chartHeight}`);
  const parts = [];

  // 취침 전 구간은 회색으로 눕히고, 취침 시각에 선을 긋는다.
  parts.push(
    create("rect", {
      class: "alcohol-prebed",
      x: chart.padding.left,
      y: chart.padding.top,
      width: x(0) - chart.padding.left,
      height: chartHeight - chart.padding.top - chart.padding.bottom,
    }),
  );

  // 시간 눈금 (한 시간마다)
  for (let h = -night.preHours; h <= night.inBedHours; h += 1) {
    parts.push(
      create("line", {
        class: "alcohol-grid",
        x1: x(h),
        x2: x(h),
        y1: chart.padding.top,
        y2: chartHeight - chart.padding.bottom,
      }),
    );
    if (h % 2 === 0 || h === night.inBedHours) {
      parts.push(
        create(
          "text",
          { class: "alcohol-axis-tick", x: x(h), y: chartHeight - chart.padding.bottom + 20 },
          clockLabel(h),
        ),
      );
    }
  }

  parts.push(
    create("line", {
      class: "alcohol-bedtime",
      x1: x(0),
      x2: x(0),
      y1: chart.padding.top - 4,
      y2: chartHeight - chart.padding.bottom,
    }),
  );
  parts.push(create("text", { class: "alcohol-marker-label", x: x(0) + 5, y: chart.padding.top + 8 }, "눕는다"));

  // ── A. 혈중알코올 ──
  const bacBottom = panelTop.bac + chart.panels.bac;
  parts.push(create("text", { class: "alcohol-panel-title", x: chart.padding.left, y: panelTop.bac - 8 }, "A. 혈중알코올 농도"));
  parts.push(
    create("line", {
      class: "alcohol-threshold",
      x1: chart.padding.left,
      x2: chart.width - chart.padding.right,
      y1: bacBottom - (0.05 / bacMax) * chart.panels.bac,
      y2: bacBottom - (0.05 / bacMax) * chart.panels.bac,
    }),
  );
  parts.push(
    create(
      "text",
      { class: "alcohol-threshold-label", x: chart.width - chart.padding.right, y: bacBottom - (0.05 / bacMax) * chart.panels.bac - 5 },
      "0.05%",
    ),
  );

  const bacPoints = [];
  for (let h = -night.preHours; h <= night.inBedHours; h += step * 4) {
    const value = bacAt(h, result.settings);
    bacPoints.push(`${x(h).toFixed(2)},${(bacBottom - (value / bacMax) * chart.panels.bac).toFixed(2)}`);
  }
  parts.push(
    create("polygon", {
      class: "alcohol-bac-fill",
      points: `${x(-night.preHours)},${bacBottom} ${bacPoints.join(" ")} ${x(night.inBedHours)},${bacBottom}`,
    }),
  );
  parts.push(create("polyline", { class: "alcohol-bac-line", points: bacPoints.join(" ") }));

  if (result.settings.drinks > 0) {
    const drinkHour = -result.settings.ahead;
    parts.push(
      create("line", { class: "alcohol-drink-line", x1: x(drinkHour), x2: x(drinkHour), y1: panelTop.bac, y2: bacBottom }),
    );
    parts.push(
      create("circle", { class: "alcohol-drink-dot", cx: x(drinkHour), cy: bacBottom, r: 4 }),
    );
    parts.push(
      create(
        "text",
        { class: "alcohol-marker-label", x: x(drinkHour) + 5, y: panelTop.bac + 12 },
        `${result.settings.drinks}잔`,
      ),
    );
  }

  // ── B. 힙노그램 ──
  const rowHeight = chart.panels.hypnogram / stageRows.length;
  parts.push(
    create("text", { class: "alcohol-panel-title", x: chart.padding.left, y: panelTop.hypnogram - 8 }, "B. 수면 단계"),
  );
  stageRows.forEach((stage, index) => {
    parts.push(
      create("rect", {
        class: `alcohol-stage-row row-${stage}`,
        x: chart.padding.left,
        y: panelTop.hypnogram + index * rowHeight,
        width: plotWidth,
        height: rowHeight,
      }),
    );
    parts.push(
      create(
        "text",
        { class: "alcohol-row-label", x: chart.padding.left - 8, y: panelTop.hypnogram + index * rowHeight + rowHeight / 2 + 4 },
        stageLabels[stage],
      ),
    );
  });

  const toPath = (list) => {
    const points = [];
    list.forEach((s, i) => {
      const y = stageRowY(s.stage);
      if (i > 0 && list[i - 1].stage !== s.stage) points.push(`${x(s.hour).toFixed(2)},${stageRowY(list[i - 1].stage).toFixed(2)}`);
      points.push(`${x(s.hour).toFixed(2)},${y.toFixed(2)}`);
    });
    return points.join(" ");
  };

  if (showRemembered) {
    parts.push(create("polyline", { class: "alcohol-hypnogram-line is-ghost", points: toPath(result.samples) }));
  }
  parts.push(create("polyline", { class: "alcohol-hypnogram-line", points: toPath(shown) }));

  // REM 구간은 따로 굵게 얹어야 눈에 들어온다.
  let runStart = null;
  shown.forEach((s, i) => {
    if (s.stage === "rem" && runStart === null) runStart = s.hour;
    const ends = s.stage !== "rem" || i === shown.length - 1;
    if (runStart !== null && ends) {
      parts.push(
        create("line", {
          class: "alcohol-rem-bar",
          x1: x(runStart),
          x2: x(s.hour),
          y1: stageRowY("rem"),
          y2: stageRowY("rem"),
        }),
      );
      runStart = null;
    }
  });

  // 각성 눈금. 기억하는 각성은 진하게, 짧은 각성은 옅게.
  result.arousals.forEach((a) => {
    const remembered = a.minutes >= effects.rememberMinutes;
    if (showRemembered && !remembered) return;
    parts.push(
      create("line", {
        class: `alcohol-arousal${remembered ? " is-remembered" : ""}`,
        x1: x(a.hour),
        x2: x(a.hour),
        y1: panelTop.hypnogram - 6,
        y2: panelTop.hypnogram + rowHeight,
      }),
    );
  });

  // ── C. 누적 REM ──
  const remBottom = panelTop.rem + chart.panels.rem;
  parts.push(
    create("text", { class: "alcohol-panel-title", x: chart.padding.left, y: panelTop.rem - 8 }, "C. 누적 REM 시간"),
  );
  const remY = (total) => remBottom - (total / remScale) * chart.panels.rem;
  const curveToPoints = (curve) => curve.map((p) => `${x(p.hour).toFixed(2)},${remY(p.total).toFixed(2)}`).join(" ");
  parts.push(create("polyline", { class: "alcohol-rem-baseline", points: curveToPoints(baseCurve) }));
  parts.push(create("polyline", { class: "alcohol-rem-line", points: curveToPoints(remCurve) }));
  // 두 곡선의 끝값이 가까우면 라벨이 겹치므로, 기준선 라벨은 패널 위쪽에 고정한다.
  parts.push(
    create(
      "text",
      { class: "alcohol-inline-label is-baseline", x: x(night.inBedHours) - 4, y: panelTop.rem + 12 },
      `술 없는 밤 ${formatMinutes(baseline.totals.rem)} (점선)`,
    ),
  );
  parts.push(
    create(
      "text",
      { class: "alcohol-inline-label", x: x(night.inBedHours) - 4, y: clamp(remY(result.totals.rem) + 16, panelTop.rem + 30, remBottom - 4) },
      `오늘 밤 ${formatMinutes(result.totals.rem)}`,
    ),
  );

  // 재생 위치
  parts.push(create("line", { class: "alcohol-playhead", x1: x(0), x2: x(0), y1: chart.padding.top, y2: chartHeight - chart.padding.bottom }));

  svg.replaceChildren(...parts);
}

function updatePlayhead() {
  const head = svg.querySelector(".alcohol-playhead");
  if (head !== null) {
    head.setAttribute("x1", x(playTime));
    head.setAttribute("x2", x(playTime));
  }

  const index = Math.min(result.samples.length - 1, Math.max(0, Math.round(playTime / step)));
  const sample = result.samples[index];
  let remSoFar = 0;
  for (let i = 0; i <= index; i += 1) if (result.samples[i].stage === "rem") remSoFar += step;

  const wokeSoFar = result.arousals.filter((a) => a.hour <= playTime);
  const rememberedSoFar = wokeSoFar.filter((a) => a.minutes >= effects.rememberMinutes);

  readouts.clock.textContent = clockLabel(playTime);
  readouts.bac.textContent = `${sample.bac.toFixed(3)}%`;
  readouts.stage.textContent = stageLabels[sample.stage];
  readouts.rem.textContent = formatMinutes(remSoFar);
  readouts.wake.textContent = `${wokeSoFar.length}회`;
  readouts.remember.textContent = `${rememberedSoFar.length}회`;
}

function updateSummary() {
  const remRatio = baseline.totals.rem > 0 ? result.totals.rem / baseline.totals.rem : 1;
  readouts.sol.textContent = formatMinutes(result.onsetHours);
  readouts.tst.textContent = formatHours(result.sleepHours);
  readouts.n3.textContent = formatMinutes(result.totals.n3);
  readouts.remTotal.textContent = `${formatMinutes(result.totals.rem)} · 기준의 ${Math.round(remRatio * 100)}%`;
  readouts.remBar.style.width = `${clamp(remRatio, 0, 1) * 100}%`;

  const woke = result.arousals.length;
  const remembered = result.remembered.length;
  if (result.settings.drinks === 0) {
    readouts.verdict.textContent = `술이 없는 밤입니다. ${woke}번 깼고 그중 ${remembered}번이 기억에 남습니다.`;
  } else {
    readouts.verdict.textContent =
      `${woke}번 깼는데 아침에 기억나는 것은 ${remembered}번뿐입니다. ` +
      `REM은 기준보다 ${formatMinutes(Math.max(0, baseline.totals.rem - result.totals.rem))} 짧습니다.`;
  }

  const solText = result.onsetHours < night.baseOnsetHours - 0.01 ? "더 빨리 곯아떨어지지만" : "잠들기까지는 비슷하지만";
  readouts.status.textContent =
    result.settings.drinks === 0
      ? "지금은 술을 마시지 않은 밤입니다. 잔을 올려 비교해보세요."
      : `${solText}, 밤 후반에 각성이 ${result.arousals.filter((a) => a.hour > night.inBedHours / 2).length}번 몰려 있습니다.`;
}

function rebuild() {
  const settings = settingsFromControls();
  result = buildNight(settings);
  baseline = buildNight({ drinks: 0, ahead: 0 });
  renderChart();
  updatePlayhead();
  updateSummary();
}

function syncControlLabels() {
  const settings = settingsFromControls();
  readouts.drinks.textContent = settings.drinks === 0 ? "안 마심" : `${settings.drinks}잔`;
  readouts.ahead.textContent = settings.ahead === 0 ? "취침 직전" : `${formatHours(settings.ahead)} 전`;
  readouts.speed.textContent = `${Number(controls.speed.value).toFixed(1)}배`;
  readouts.remembered.textContent = controls.showRemembered.checked ? "켬" : "끔";
  readouts.eegPlay.textContent = controls.eegPlay.checked ? "켬" : "끔";
}

// ── 기억 실험 그림 ────────────────────────────────────────
// Smith & Smith (2003)을 워커가 책에서 소개한 서술을 그대로 옮긴 값이다.
const memoryGroups = [
  { label: "대조군", detail: "6일 내내 푹 잠", retained: 100, note: "학습 직후보다 오히려 향상" },
  { label: "학습 당일 밤 음주", detail: "배운 그날 밤에 한잔", retained: 48, note: "50% 이상 망각" },
  { label: "학습 사흘째 밤 음주", detail: "이틀은 푹 자고 셋째 날 밤에 한잔", retained: 60, note: "40% 망각" },
];

function renderMemoryChart() {
  const width = 900;
  const height = 232;
  const left = 236;
  const right = 96;
  const barWidth = width - left - right;
  memorySvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const parts = [];
  parts.push(create("text", { class: "alcohol-panel-title", x: left, y: 22 }, "7일째 시험에서 남아 있던 학습 내용"));

  memoryGroups.forEach((group, index) => {
    const y = 48 + index * 58;
    parts.push(create("text", { class: "memory-group", x: left - 14, y: y + 15 }, group.label));
    parts.push(create("text", { class: "memory-detail", x: left - 14, y: y + 32 }, group.detail));
    parts.push(create("rect", { class: "memory-track", x: left, y, width: barWidth, height: 26, rx: 4 }));
    parts.push(
      create("rect", {
        class: `memory-bar${index === 0 ? " is-control" : ""}`,
        x: left,
        y,
        width: (barWidth * group.retained) / 100,
        height: 26,
        rx: 4,
      }),
    );
    parts.push(
      create("text", { class: "memory-value", x: left + (barWidth * group.retained) / 100 + 10, y: y + 18 }, `${group.retained}%`),
    );
    parts.push(create("text", { class: "memory-note", x: left + 10, y: y + 18 }, group.note));
  });

  parts.push(
    create(
      "text",
      { class: "memory-caption", x: left, y: height - 12 },
      "이틀 밤을 푹 자고 나서 마신 술도 그 사흘 전에 배운 것을 지웠다 — 기억이 정착하는 데는 여러 밤이 필요하다.",
    ),
  );
  memorySvg.replaceChildren(...parts);
}

// ── 재생 루프 ─────────────────────────────────────────────
function setPlaying(next) {
  playing = next;
  controls.playToggle.textContent = playing ? "일시정지" : "재생";
  if (playing) lastFrame = null;
}

function frame(timestamp) {
  if (lastFrame === null) lastFrame = timestamp;
  // 탭을 잠깐 벗어났다 돌아왔을 때 한 번에 건너뛰지 않도록 클램프한다.
  const dt = clamp((timestamp - lastFrame) / 1000, 0, 0.05);
  lastFrame = timestamp;

  if (controls.eegPlay.checked) drawEeg(timestamp / 1000);

  if (playing) {
    playTime += dt * Number(controls.speed.value) * 2.4;
    if (playTime >= night.inBedHours) {
      playTime = night.inBedHours;
      setPlaying(false);
    }
    updatePlayhead();
  }
  requestAnimationFrame(frame);
}

// ── 이벤트 ────────────────────────────────────────────────
[controls.drinks, controls.drinkAhead].forEach((input) =>
  input.addEventListener("input", () => {
    syncControlLabels();
    rebuild();
  }),
);

controls.speed.addEventListener("input", syncControlLabels);

controls.showRemembered.addEventListener("change", () => {
  syncControlLabels();
  renderChart();
  updatePlayhead();
});

controls.eegDose.addEventListener("input", () => {
  updateEegReadout();
  if (!controls.eegPlay.checked) drawEeg(performance.now() / 1000);
});

controls.eegPlay.addEventListener("change", syncControlLabels);

controls.playToggle.addEventListener("click", () => {
  if (playTime >= night.inBedHours) playTime = 0;
  setPlaying(!playing);
});

controls.restart.addEventListener("click", () => {
  playTime = 0;
  updatePlayhead();
  setPlaying(true);
});

// 그래프 위를 끌면 그 시각으로 이동한다.
function seekFrom(event) {
  const box = svg.getBoundingClientRect();
  const ratio = (event.clientX - box.left) / box.width;
  const hour = ratio * chart.width;
  const hours = ((hour - chart.padding.left) / plotWidth) * (night.preHours + night.inBedHours) - night.preHours;
  playTime = clamp(hours, 0, night.inBedHours);
  updatePlayhead();
}

svg.addEventListener("pointerdown", (event) => {
  svg.setPointerCapture(event.pointerId);
  setPlaying(false);
  seekFrom(event);
});

svg.addEventListener("pointermove", (event) => {
  if (svg.hasPointerCapture(event.pointerId)) seekFrom(event);
});

svg.addEventListener("pointerup", (event) => svg.releasePointerCapture(event.pointerId));

// ── 시작 ──────────────────────────────────────────────────
syncControlLabels();
updateEegReadout();
renderMemoryChart();
rebuild();
drawEeg(0);
requestAnimationFrame(frame);
