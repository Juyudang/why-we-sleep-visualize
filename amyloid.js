// ── 모델 상수 ─────────────────────────────────────────────
// sleep_amyloid_visualization_model.md 6절의 상대 계수를 그대로 옮겼다.
// Wake 생성률을 1.00으로 정규화한 값이며, 사람에게서 측정된 제거율이 아니다.
const production = { wake: 1.0, n1: 0.8, n2: 0.6, n3: 0.4, rem: 0.75 };
const clearance = { wake: 0.5, n1: 0.65, n2: 0.85, n3: 1.0, rem: 0.7 };

// dA/dt = P_s - k_s·A 를 쓴다(문서 10절). 단순 P - C와 달리 단계마다
// 평형값 P/k가 생겨 아래로 발산하지 않고, "밤 초반 급감 → 후반 둔화" 모양이
// 클램프 없이 저절로 나온다. 평형: 각성 2.00 / N1 1.23 / N2 0.71 / N3 0.40 / REM 1.07.
//
// 표의 계수를 그대로 쓰면 N3 시정수가 1시간이라 4시간을 자나 8시간을 자나
// 아침 값이 같아진다. P와 k에 같은 수를 곱하면 평형 P/k는 그대로 두고 반응 속도만
// 늦출 수 있다. 너무 낮추면 모든 단계가 굼떠져서 수면시간만 중요해지고 단계 구성이
// 묻히므로, 수면시간과 수면 안정도가 둘 다 결과를 바꾸는 지점으로 잡았다.
const responseScale = 0.2;

// 응집·침착(플라크) 층. 용해성 Aβ가 이 농도 위에 머문 시간에 비례해 쌓이고
// 절대 줄지 않는다. 하룻밤으로는 거의 움직이지 않고 며칠 반복해야 눈에 보이는
// 속도로 맞췄다 — 문서 3절이 경계하는 "하룻밤에 플라크가 사라진다"는 오해를 막는 장치다.
const aggregation = { threshold: 1.35, rate: 0.006 };

// 수면 구조. 밤 초반 사이클에 N3가 몰리고 뒤로 갈수록 REM이 길어지도록
// 사이클 번호에 따라 비중을 옮긴다.
const night = {
  cycleHours: 1.5,
  onsetHours: 0.12,
  n3Start: 0.44,
  n3Drop: 0.15,
  remStart: 0.07,
  remGrow: 0.09,
  remMax: 0.36,
};

// 수면 안정도 프리셋. 단계가 오를수록 N3 비중이 깎이고 짧은 각성이 잦아진다.
// 총 수면시간을 그대로 두고 이 값만 올리면 "오래 자도 깊은 잠이 없으면
// Aβ가 잘 안 빠진다"가 그대로 보인다 (Ju et al., Brain 2017).
// n3Scale은 깊은 잠이 남는 비율, n2ToN1은 안정된 N2마저 얕은 잠으로 밀리는 비율이다.
// 교란된 수면은 N3만 사라지는 것이 아니라 밤 전체가 얕아지므로 두 축을 함께 움직인다.
const disruptions = [
  { label: "정상", n3Scale: 1.0, n2ToN1: 0.0, arousals: 0, arousalHours: 0 },
  { label: "교란 1단계", n3Scale: 0.62, n2ToN1: 0.2, arousals: 1, arousalHours: 0.07 },
  { label: "교란 2단계", n3Scale: 0.32, n2ToN1: 0.45, arousals: 2, arousalHours: 0.1 },
  { label: "교란 3단계", n3Scale: 0.08, n2ToN1: 0.7, arousals: 3.2, arousalHours: 0.14 },
];

// 하루의 시작을 오전 7시로 잡는다(app.js와 같은 기준).
const dayStartClock = 7;
const bedtimeClock = 23;
const dt = 0.02;
const initialAmyloid = 0.95;
const baseSpeed = { single: 2.6, repeat: 14 };

const stageLabels = {
  wake: "각성",
  n1: "N1 · 얕은 잠",
  n2: "N2",
  n3: "N3 · 깊은 잠",
  rem: "REM",
};

// ── 차트 배치 ─────────────────────────────────────────────
const width = 900;
const padding = { top: 22, right: 18, bottom: 42, left: 62 };
const panelGap = 26;
const panelSizes = { hypnogram: 104, rates: 120, level: 140, plaque: 44 };
const plotWidth = width - padding.left - padding.right;
const height =
  padding.top +
  panelSizes.hypnogram +
  panelSizes.rates +
  panelSizes.level +
  panelSizes.plaque +
  panelGap * 3 +
  padding.bottom;

const panelTop = {
  hypnogram: padding.top,
  rates: padding.top + panelSizes.hypnogram + panelGap,
  level: padding.top + panelSizes.hypnogram + panelSizes.rates + panelGap * 2,
  plaque:
    padding.top + panelSizes.hypnogram + panelSizes.rates + panelSizes.level + panelGap * 3,
};

const hypnogramRows = ["wake", "rem", "n1", "n2", "n3"];

// ── DOM ───────────────────────────────────────────────────
const svg = document.querySelector("#amyloidChart");
const canvas = document.querySelector("#brainCanvas");
const ctx = canvas.getContext("2d");

const controls = {
  sleepHours: document.querySelector("#sleepHours"),
  disruption: document.querySelector("#disruption"),
  speed: document.querySelector("#speed"),
  repeatDays: document.querySelector("#repeatDays"),
  playToggle: document.querySelector("#playToggle"),
  restart: document.querySelector("#restart"),
};

const readouts = {
  sleepHours: document.querySelector("#sleepHoursValue"),
  disruption: document.querySelector("#disruptionValue"),
  speed: document.querySelector("#speedValue"),
  repeat: document.querySelector("#repeatValue"),
  status: document.querySelector("#statusValue"),
  clock: document.querySelector("#clockValue"),
  stage: document.querySelector("#stageValue"),
  amyloid: document.querySelector("#amyloidValue"),
  plaque: document.querySelector("#plaqueValue"),
  deepSleep: document.querySelector("#deepSleepValue"),
};

const state = {
  simulation: null,
  playing: false,
  simHour: 0,
  sweepPhase: 0,
  lastFrame: null,
  scrubbing: false,
};

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

// ── 수면 구조 만들기 ───────────────────────────────────────
// 잠든 시각부터 90분 사이클을 반복하며 N2 → N3 → N2 → REM 순으로 배치하고,
// 교란 단계에 따라 사이 사이에 짧은 각성을 흩뿌린다. 기상 시각을 넘으면 잘라낸다.
function buildSleepSegments(start, duration, disruption, random) {
  const segments = [];
  const end = start + duration;
  let cursor = start;

  const push = (stage, length) => {
    if (cursor >= end || length <= 0) return;
    segments.push({ stage, start: cursor, end: Math.min(end, cursor + length) });
    cursor += length;
  };

  // 사이클 한 칸이 끝날 때마다 확률적으로 잠이 얕아지거나 잠깐 깬다.
  const maybeArousal = () => {
    if (disruption.arousals <= 0) return;
    if (random() >= disruption.arousals / 4) return;
    push(random() < 0.6 ? "wake" : "n1", disruption.arousalHours * (0.6 + random() * 0.9));
  };

  push("n1", night.onsetHours);
  for (let index = 0; cursor < end; index += 1) {
    const n3Full = Math.max(0, night.n3Start - night.n3Drop * index);
    const n3Share = n3Full * disruption.n3Scale;
    const remShare = Math.min(night.remMax, night.remStart + night.remGrow * index);
    const n2Full = Math.max(0.12, 1 - n3Full - remShare);
    const n2Share = n2Full * (1 - disruption.n2ToN1);
    // 깎여나간 깊은 잠과 밀려난 N2가 모두 얕은 잠으로 간다.
    const n1Share = (n3Full - n3Share) * 0.75 + n2Full * disruption.n2ToN1;

    push("n2", night.cycleHours * n2Share * 0.55);
    push("n1", night.cycleHours * n1Share * 0.5);
    maybeArousal();
    push("n3", night.cycleHours * n3Share);
    push("n1", night.cycleHours * n1Share * 0.5);
    maybeArousal();
    push("n2", night.cycleHours * n2Share * 0.45);
    maybeArousal();
    push("rem", night.cycleHours * remShare);
    maybeArousal();
  }

  return segments;
}

// 수면 구간 사이를 각성으로 메워서 그래프가 끊기지 않는 계단이 되게 한다.
function buildTimeline(settings, totalHours) {
  const disruption = disruptions[settings.disruption];
  const sleeps = [];
  const sleepWindows = [];

  for (let day = 0; day < settings.days; day += 1) {
    const start = day * 24 + (bedtimeClock - dayStartClock);
    // 밤마다 다른 난수를 쓰되 설정이 같으면 항상 같은 밤이 나오게 씨앗을 고정한다.
    const random = makeRandom(9301 + settings.disruption * 733 + day * 37);
    sleeps.push(...buildSleepSegments(start, settings.sleepHours, disruption, random));
    sleepWindows.push({ start, end: start + settings.sleepHours });
  }

  const timeline = [];
  let cursor = 0;
  sleeps.forEach((segment) => {
    if (segment.start > cursor) timeline.push({ stage: "wake", start: cursor, end: segment.start });
    timeline.push(segment);
    cursor = segment.end;
  });
  if (cursor < totalHours) timeline.push({ stage: "wake", start: cursor, end: totalHours });

  return { timeline, sleepWindows };
}

function readSettings() {
  return {
    sleepHours: Number(controls.sleepHours.value),
    disruption: Number(controls.disruption.value),
    speed: Number(controls.speed.value),
    days: controls.repeatDays.checked ? 7 : 1,
  };
}

function simulate(settings) {
  const lastSleepEnd = (settings.days - 1) * 24 + (bedtimeClock - dayStartClock) + settings.sleepHours;
  const totalHours = Math.max(settings.days * 24, Math.ceil(lastSleepEnd + 2));
  const { timeline, sleepWindows } = buildTimeline(settings, totalHours);

  const points = [];
  let amyloid = initialAmyloid;
  let plaque = 0;
  let deepSleep = 0;
  let index = 0;

  for (let hour = 0; hour <= totalHours + 1e-9; hour += dt) {
    while (index < timeline.length - 1 && hour >= timeline[index].end) index += 1;
    const stage = timeline[index].stage;

    const rate = production[stage];
    const removal = clearance[stage] * amyloid;
    amyloid = Math.max(0, amyloid + (rate - removal) * responseScale * dt);
    if (amyloid > aggregation.threshold) {
      plaque += (amyloid - aggregation.threshold) * aggregation.rate * dt;
    }
    if (stage === "n3") deepSleep += dt;

    points.push({ hour, stage, production: rate, removal, amyloid, plaque, deepSleep });
  }

  return { points, timeline, sleepWindows, totalHours, settings };
}

// ── 좌표 ──────────────────────────────────────────────────
function xFor(hour) {
  return padding.left + (hour / state.simulation.totalHours) * plotWidth;
}

function yIn(panel, value, max, min = 0) {
  const normalized = (value - min) / (max - min);
  return panelTop[panel] + (1 - clamp(normalized, 0, 1)) * panelSizes[panel];
}

function formatClock(hour) {
  const clock = (dayStartClock + hour) % 24;
  const whole = Math.floor(clock);
  const minutes = Math.floor((clock - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// ── 차트 ──────────────────────────────────────────────────
function pathFrom(points, key, panel, max, step) {
  const commands = [];
  for (let i = 0; i < points.length; i += step) {
    const point = points[i];
    commands.push(
      `${commands.length === 0 ? "M" : "L"} ${xFor(point.hour).toFixed(2)} ${yIn(panel, point[key], max).toFixed(2)}`,
    );
  }
  const last = points[points.length - 1];
  commands.push(`L ${xFor(last.hour).toFixed(2)} ${yIn(panel, last[key], max).toFixed(2)}`);
  return commands.join(" ");
}

// 생성이 이기는 구간과 제거가 이기는 구간을 따로 칠하려고 부호가 바뀔 때마다 끊는다.
function signedRuns(points) {
  const runs = [];
  let current = null;
  points.forEach((point) => {
    const sign = point.removal >= point.production ? "clear" : "build";
    if (current === null || current.sign !== sign) {
      if (current !== null) current.points.push(point);
      current = { sign, points: [point] };
      runs.push(current);
    } else {
      current.points.push(point);
    }
  });
  return runs.filter((run) => run.points.length > 1);
}

function bandPath(run, max) {
  const forward = run.points.map(
    (point) => `${xFor(point.hour).toFixed(2)} ${yIn("rates", point.production, max).toFixed(2)}`,
  );
  const backward = run.points
    .slice()
    .reverse()
    .map((point) => `${xFor(point.hour).toFixed(2)} ${yIn("rates", point.removal, max).toFixed(2)}`);
  return `M ${forward.join(" L ")} L ${backward.join(" L ")} Z`;
}

function levelMaxOf(points) {
  return Math.max(2.2, ...points.map((point) => point.amyloid)) * 1.08;
}

function renderChart() {
  const { points, timeline, sleepWindows, totalHours, settings } = state.simulation;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const step = Math.max(1, Math.round(points.length / 1200));
  const rateMax = Math.max(1.1, ...points.map((point) => Math.max(point.production, point.removal))) * 1.08;
  const plaqueMax = Math.max(0.04, points[points.length - 1].plaque * 1.25);

  const top = padding.top;
  const bottom = height - padding.bottom;

  // 수면 구간을 네 패널 전체에 걸쳐 어둡게 깔아 시간 대응을 읽기 쉽게 한다.
  sleepWindows.forEach((window) => {
    svg.appendChild(
      create("rect", {
        x: xFor(window.start),
        y: top,
        width: Math.max(1, xFor(window.end) - xFor(window.start)),
        height: bottom - top,
        class: "amyloid-sleep-band",
      }),
    );
  });

  const tickStep = settings.days > 1 ? 24 : 3;
  for (let hour = 0; hour <= totalHours + 1e-6; hour += tickStep) {
    svg.appendChild(
      create("line", { x1: xFor(hour), y1: top, x2: xFor(hour), y2: bottom, class: "amyloid-grid" }),
    );
    const label = settings.days > 1 ? `${Math.round(hour / 24) + 1}일차` : formatClock(hour);
    svg.appendChild(create("text", { x: xFor(hour), y: bottom + 24, class: "amyloid-axis-tick" }, label));
  }

  renderHypnogram(timeline);
  renderRates(points, step, rateMax);
  renderLevel(points, step, levelMaxOf(points));
  renderPlaque(points, step, plaqueMax);

  svg.appendChild(
    create("line", { id: "playhead", x1: xFor(0), y1: top, x2: xFor(0), y2: bottom, class: "amyloid-playhead" }),
  );
  svg.appendChild(create("circle", { id: "playheadDot", r: 4.5, class: "amyloid-playhead-dot" }));
}

function panelTitle(panel, text) {
  svg.appendChild(create("text", { x: padding.left, y: panelTop[panel] - 8, class: "amyloid-panel-title" }, text));
}

function renderHypnogram(timeline) {
  panelTitle("hypnogram", "A. 수면 단계");
  const rowHeight = panelSizes.hypnogram / hypnogramRows.length;
  const rowY = (stage) => panelTop.hypnogram + (hypnogramRows.indexOf(stage) + 0.5) * rowHeight;

  hypnogramRows.forEach((stage, index) => {
    svg.appendChild(
      create("rect", {
        x: padding.left,
        y: panelTop.hypnogram + index * rowHeight,
        width: plotWidth,
        height: rowHeight,
        class: `amyloid-stage-row row-${stage}`,
      }),
    );
    svg.appendChild(
      create(
        "text",
        { x: padding.left - 10, y: rowY(stage) + 4, class: "amyloid-row-label" },
        stage === "wake" ? "각성" : stage.toUpperCase(),
      ),
    );
  });

  const commands = [];
  timeline.forEach((segment, index) => {
    const y = rowY(segment.stage);
    commands.push(`${index === 0 ? "M" : "L"} ${xFor(segment.start).toFixed(2)} ${y.toFixed(2)}`);
    commands.push(`L ${xFor(segment.end).toFixed(2)} ${y.toFixed(2)}`);
  });
  svg.appendChild(create("path", { d: commands.join(" "), class: "amyloid-hypnogram-line" }));

  // N3와 REM은 굵은 막대로 따로 강조한다. 교란 단계를 올리면 N3 막대가 사라지는 것이 핵심이다.
  timeline
    .filter((segment) => segment.stage === "rem" || segment.stage === "n3")
    .forEach((segment) => {
      svg.appendChild(
        create("line", {
          x1: xFor(segment.start),
          y1: rowY(segment.stage),
          x2: xFor(segment.end),
          y2: rowY(segment.stage),
          class: segment.stage === "rem" ? "amyloid-rem-bar" : "amyloid-n3-bar",
        }),
      );
    });
}

function renderRates(points, step, max) {
  panelTitle("rates", "B. 생성 vs 제거 (상대 속도)");
  signedRuns(points.filter((_, index) => index % step === 0)).forEach((run) => {
    svg.appendChild(create("path", { d: bandPath(run, max), class: `amyloid-band band-${run.sign}` }));
  });
  svg.appendChild(create("path", { d: pathFrom(points, "production", "rates", max, step), class: "amyloid-production" }));
  svg.appendChild(create("path", { d: pathFrom(points, "removal", "rates", max, step), class: "amyloid-clearance" }));
}

function renderLevel(points, step, max) {
  panelTitle("level", "C. 용해성 Aβ 농도");
  svg.appendChild(
    create("line", {
      x1: padding.left,
      y1: yIn("level", aggregation.threshold, max),
      x2: padding.left + plotWidth,
      y2: yIn("level", aggregation.threshold, max),
      class: "amyloid-threshold",
    }),
  );
  svg.appendChild(
    create(
      "text",
      {
        x: padding.left + plotWidth,
        y: yIn("level", aggregation.threshold, max) - 6,
        class: "amyloid-threshold-label",
      },
      "이 위에 머무는 시간만큼 응집이 진행된다",
    ),
  );

  const line = pathFrom(points, "amyloid", "level", max, step);
  const base = panelTop.level + panelSizes.level;
  svg.appendChild(
    create("path", {
      d: `${line} L ${xFor(points[points.length - 1].hour).toFixed(2)} ${base} L ${padding.left} ${base} Z`,
      class: "amyloid-level-fill",
    }),
  );
  svg.appendChild(create("path", { d: line, class: "amyloid-level-line" }));
}

function renderPlaque(points, step, max) {
  panelTitle("plaque", "D. 응집·침착 누적 (줄어들지 않는다)");
  const line = pathFrom(points, "plaque", "plaque", max, step);
  const base = panelTop.plaque + panelSizes.plaque;
  svg.appendChild(
    create("path", {
      d: `${line} L ${xFor(points[points.length - 1].hour).toFixed(2)} ${base} L ${padding.left} ${base} Z`,
      class: "amyloid-plaque-fill",
    }),
  );
  svg.appendChild(create("path", { d: line, class: "amyloid-plaque-line" }));
}

// ── 뇌 단면 (PET 영상 느낌) ────────────────────────────────
// 위에서 내려다본 축상면. 실제 PET 사진을 가져다 쓰지 않고,
// 겉질 띠 + 중심 회백질 + 저주파 잡음으로 밝기장을 만든 뒤 PET 컬러맵에 통과시킨다.
// 밝기장은 한 번만 계산해 두고, 매 프레임 Aβ 수치를 곱해 색만 다시 칠한다.
const slice = { width: 240, height: 300, cols: 120, rows: 150 };

// 앞(이마)이 위. 이마 쪽은 좁고 뒤통수 쪽이 넓은 실제 축상면 비율을 따른다.
const brainSlice = new Path2D(
  "M 120 14 C 154 14 182 40 192 82 C 204 126 210 196 186 248 C 172 278 148 292 120 292 " +
    "C 92 292 68 278 54 248 C 30 196 36 126 48 82 C 58 40 86 14 120 14 Z",
);
// 밝기장을 타원 좌표로 바꿀 때 쓰는 실제 뇌 중심과 반지름.
const sliceCenter = { x: 120, y: 153, rx: 92, ry: 142 };

// 검정 → 보라 → 파랑 → 초록 → 노랑 → 빨강 → 마젠타. PET 영상에서 흔히 쓰는 무지개 스케일.
const petStops = [
  [0.0, [5, 4, 15]],
  [0.14, [40, 16, 92]],
  [0.3, [58, 40, 156]],
  [0.44, [42, 92, 190]],
  [0.58, [30, 150, 92]],
  [0.7, [150, 190, 40]],
  [0.8, [226, 210, 40]],
  [0.89, [232, 120, 28]],
  [0.96, [214, 32, 44]],
  [1.0, [242, 110, 208]],
];

// 컬러맵을 256칸으로 미리 펴 둔다. 픽셀마다 보간하면 프레임당 1.8만 번이라 아깝다.
const petLut = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let index = 0;
    while (index < petStops.length - 2 && t > petStops[index + 1][0]) index += 1;
    const [t0, c0] = petStops[index];
    const [t1, c1] = petStops[index + 1];
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    lut[i * 3] = c0[0] + (c1[0] - c0[0]) * f;
    lut[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * f;
    lut[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * f;
  }
  return lut;
})();

const field = document.createElement("canvas");
field.width = slice.cols;
field.height = slice.rows;
const fieldCtx = field.getContext("2d");
const fieldImage = fieldCtx.createImageData(slice.cols, slice.rows);

const baseField = (() => {
  const random = makeRandom(19470628);

  // 성긴 격자에 난수를 깔고 부드럽게 보간해 저주파 얼룩을 만든다.
  const gw = 15;
  const gh = 19;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i += 1) grid[i] = random();
  const smooth = (t) => t * t * (3 - 2 * t);
  const noiseAt = (u, v) => {
    const gx = clamp(u * (gw - 1), 0, gw - 1.001);
    const gy = clamp(v * (gh - 1), 0, gh - 1.001);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const a = grid[y0 * gw + x0];
    const b = grid[y0 * gw + x0 + 1];
    const c = grid[(y0 + 1) * gw + x0];
    const d = grid[(y0 + 1) * gw + x0 + 1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };

  const values = new Float32Array(slice.cols * slice.rows);
  fieldCtx.setTransform(1, 0, 0, 1, 0, 0);
  const scaleX = slice.width / slice.cols;
  const scaleY = slice.height / slice.rows;

  for (let row = 0; row < slice.rows; row += 1) {
    for (let col = 0; col < slice.cols; col += 1) {
      const sx = (col + 0.5) * scaleX;
      const sy = (row + 0.5) * scaleY;
      if (!fieldCtx.isPointInPath(brainSlice, sx, sy)) continue;

      const nx = (sx - sliceCenter.x) / sliceCenter.rx;
      const ny = (sy - sliceCenter.y) / sliceCenter.ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      const blob = (cx, cy, r) => Math.exp(-(((nx - cx) ** 2 + (ny - cy) ** 2) / r));

      // 신호는 겉질 띠에 몰려 있다. 좁게 잡아야 바깥 고리가 눈에 보인다.
      const cortex = Math.exp(-((d - 0.78) ** 2) / 0.016);
      // 그 안쪽 백질은 어둡게 깔린다.
      const whiteMatter = 0.26 * Math.exp(-(d * d) / 0.45);
      // 기저핵·시상에 해당하는 중심 회백질. 참고 영상에서 가장 뜨거운 부분이다.
      const central = 0.78 * (blob(-0.27, -0.02, 0.05) + blob(0.27, -0.02, 0.05));

      const mottle = noiseAt(col / slice.cols, row / slice.rows);
      let value = cortex * (0.5 + 0.72 * mottle) + whiteMatter + central;

      // 대뇌를 좌우로 가르는 정중선. 앞뒤가 깊고 가운데는 얕다.
      const midline = Math.exp(-(nx * nx) / 0.0016) * (0.5 + 0.5 * Math.abs(ny));
      value *= 1 - clamp(midline, 0, 0.88);

      // 뇌실 두 개는 신호가 비어 있다.
      const ventricle = blob(-0.12, 0.16, 0.014) + blob(0.12, 0.16, 0.014);
      value *= 1 - clamp(ventricle * 0.8, 0, 0.85);

      // 가장자리를 살짝 흐려 단면 경계가 칼같이 끊기지 않게 한다.
      value *= clamp((1.03 - d) / 0.1, 0, 1);

      values[row * slice.cols + col] = clamp(value, 0, 1.25);
    }
  }
  return values;
})();

function drawBrain(point) {
  // 용해성 Aβ가 색을 올리고, 플라크는 내려가지 않는 바닥을 만든다.
  // 0.28을 깔아두는 것은 잘 쉰 뇌도 완전히 검지는 않고 파랑~초록에서 시작하게 하려는 것이다.
  // 플라크 정규화 상한을 넉넉히 잡아야 7일 교란에서 화면 전체가 마젠타로 포화되지 않는다.
  const level =
    0.28 + clamp(point.amyloid / 2.2, 0, 1) * 0.62 + clamp(point.plaque / 0.5, 0, 1) * 0.4;
  // 제거가 생성을 이기는 동안 뇌척수액이 훑고 지나가는 띠를 흘린다.
  const flow = clamp((point.removal - point.production) / 0.8, 0, 1);
  const sweepRow = state.sweepPhase * slice.rows;

  const data = fieldImage.data;
  for (let row = 0; row < slice.rows; row += 1) {
    let sweep = 1;
    if (flow > 0.02) {
      const distance = row - sweepRow;
      sweep = 1 - flow * 0.32 * Math.exp(-(distance * distance) / 90);
    }
    for (let col = 0; col < slice.cols; col += 1) {
      const index = row * slice.cols + col;
      const value = baseField[index];
      const offset = index * 4;
      if (value <= 0) {
        data[offset] = 5;
        data[offset + 1] = 4;
        data[offset + 2] = 15;
        data[offset + 3] = 255;
        continue;
      }
      const shade = Math.round(clamp(value * level * sweep, 0, 1) * 255);
      data[offset] = petLut[shade * 3];
      data[offset + 1] = petLut[shade * 3 + 1];
      data[offset + 2] = petLut[shade * 3 + 2];
      data[offset + 3] = 255;
    }
  }

  fieldCtx.putImageData(fieldImage, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(field, 0, 0, canvas.width, canvas.height);
}

// ── 재생 ──────────────────────────────────────────────────
function pointAt(hour) {
  const { points } = state.simulation;
  return points[clamp(Math.round(hour / dt), 0, points.length - 1)];
}

function updateReadouts() {
  const settings = state.simulation.settings;
  readouts.sleepHours.textContent = formatHours(settings.sleepHours);
  readouts.disruption.textContent = disruptions[settings.disruption].label;
  readouts.speed.textContent = `${settings.speed.toFixed(1)}배`;
  readouts.repeat.textContent = settings.days > 1 ? "7일" : "하룻밤";
}

function updateFrame() {
  const point = pointAt(state.simHour);
  const { totalHours, settings, points } = state.simulation;

  const playhead = svg.querySelector("#playhead");
  const dot = svg.querySelector("#playheadDot");
  if (playhead !== null) {
    playhead.setAttribute("x1", xFor(state.simHour));
    playhead.setAttribute("x2", xFor(state.simHour));
  }
  if (dot !== null) {
    dot.setAttribute("cx", xFor(state.simHour));
    dot.setAttribute("cy", yIn("level", point.amyloid, levelMaxOf(points)));
  }

  const dayLabel = settings.days > 1 ? `${Math.floor(state.simHour / 24) + 1}일차 ` : "";
  readouts.clock.textContent = `${dayLabel}${formatClock(state.simHour)}`;
  readouts.stage.textContent = stageLabels[point.stage];
  const direction = point.removal >= point.production ? "빠지는 중" : "쌓이는 중";
  readouts.amyloid.textContent = `${point.amyloid.toFixed(2)} · ${direction}`;
  readouts.plaque.textContent = (point.plaque * 100).toFixed(1);
  readouts.deepSleep.textContent = formatHours(point.deepSleep);

  const done = state.simHour >= totalHours - 1e-6;
  readouts.status.textContent = done
    ? "끝까지 재생했습니다. 처음부터를 눌러 다시 볼 수 있습니다."
    : state.playing
      ? ""
      : "일시정지 상태입니다.";

  drawBrain(point);
}

function frame(now) {
  if (state.lastFrame === null) state.lastFrame = now;
  const elapsed = clamp((now - state.lastFrame) / 1000, 0, 0.05);
  state.lastFrame = now;

  if (state.playing) {
    const settings = state.simulation.settings;
    const speed = (settings.days > 1 ? baseSpeed.repeat : baseSpeed.single) * settings.speed;
    state.simHour += elapsed * speed;
    state.sweepPhase = (state.sweepPhase + elapsed * 0.35) % 1;
    if (state.simHour >= state.simulation.totalHours) {
      state.simHour = state.simulation.totalHours;
      setPlaying(false);
    }
  }

  updateFrame();
  requestAnimationFrame(frame);
}

function setPlaying(next) {
  state.playing = next;
  controls.playToggle.textContent = next ? "일시정지" : "재생";
}

function rebuild({ keepTime = false } = {}) {
  const previous = state.simHour;
  state.simulation = simulate(readSettings());
  state.simHour = keepTime ? clamp(previous, 0, state.simulation.totalHours) : 0;
  updateReadouts();
  renderChart();
  updateFrame();
}

Object.values(controls).forEach((control) => {
  if (control.tagName !== "INPUT") return;
  control.addEventListener("input", () => {
    const wasPlaying = state.playing;
    rebuild({ keepTime: control === controls.speed });
    if (control === controls.speed && wasPlaying) setPlaying(true);
    else if (control !== controls.speed) setPlaying(false);
  });
});

// 차트 위를 끌면 그 시각으로 이동한다. 재생을 끝까지 기다리지 않고
// 원하는 지점의 뇌 상태를 바로 볼 수 있어야 한다.
function hourFromEvent(event) {
  const rect = svg.getBoundingClientRect();
  const svgX = ((event.clientX - rect.left) / rect.width) * width;
  return clamp(((svgX - padding.left) / plotWidth) * state.simulation.totalHours, 0, state.simulation.totalHours);
}

svg.addEventListener("pointerdown", (event) => {
  state.scrubbing = true;
  svg.setPointerCapture(event.pointerId);
  setPlaying(false);
  state.simHour = hourFromEvent(event);
  updateFrame();
});

svg.addEventListener("pointermove", (event) => {
  if (!state.scrubbing) return;
  state.simHour = hourFromEvent(event);
  updateFrame();
});

svg.addEventListener("pointerup", (event) => {
  state.scrubbing = false;
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
});

controls.playToggle.addEventListener("click", () => {
  if (state.simHour >= state.simulation.totalHours) state.simHour = 0;
  setPlaying(!state.playing);
});

controls.restart.addEventListener("click", () => {
  state.simHour = 0;
  setPlaying(true);
});

rebuild();
setPlaying(false);
requestAnimationFrame(frame);
