// ── 광원 상수 ─────────────────────────────────────────────
// lux       : 소파에 앉은 사람 "눈높이"에 닿는 조도(럭스). 기구 밝기가 아니라 거리까지 반영한 값이다.
//             천장 조명은 밝지만 3m 위에 있고 아이패드는 어둡지만 30cm 앞이라, 이 축에서 둘의 차이가 확 줄어든다.
// melanopic : 그 빛이 시교차상핵을 때리는 정도(멜라놉 비율). 청색이 강할수록 크다.
//             백열등 계열 2700K가 0.4대, 주광색 LED 6500K가 0.8대다.
// roomLux   : 방을 밝히는 몫. 화면은 눈만 때리고 방은 거의 못 밝히므로 lux와 따로 둔다.
//             이 값만 방 그림의 어둡기를 정하고, 멜라토닌 계산에는 들어가지 않는다.
const sources = {
  ceiling: { label: "천장 LED 조명", lux: 110, melanopic: 0.78, roomLux: 120 },
  lamp: { label: "노란 스탠드", lux: 46, melanopic: 0.42, roomLux: 52 },
  screen: { label: "아이패드", lux: 34, melanopic: 0.85, roomLux: 4 },
  window: { label: "창밖 가로등", lux: 13, melanopic: 0.72, roomLux: 14 },
  mood: { label: "무드등", lux: 6, melanopic: 0.18, roomLux: 8 },
};

// 야간 모드는 색온도만 낮춘다. 화면이 어두워지는 것이 아니라 청색이 빠지는 것이라
// melanopic만 크게 떨어지고 lux는 조금만 준다 — "야간 모드면 괜찮다"는 오해를 막는 지점이다.
const nightShift = { melanopic: 0.42, luxScale: 0.88 };

// 커튼 종류. blocks는 창밖 빛을 막아내는 비율이다.
// 커튼을 치는 것과 암막으로 바꾸는 것이 다른 일이라는 점이 여기서 드러난다.
const curtains = {
  sheer: { label: "일반 커튼", blocks: 0.62 },
  blackout: { label: "암막 커튼", blocks: 1 },
};

// 억제 곡선. suppression = max · dose^n / (dose^n + half^n)
// half를 60으로 잡으면 아이패드 단독 2시간이 약 25% 억제로 나와 책이 인용한 23%와 맞는다.
// 거실 조명을 다 켠 상태(약 140)는 66% 억제까지 올라간다.
const response = { half: 60, exponent: 1.2, max: 0.9 };

// 노출 시간은 제곱근으로 들어간다. 두 배 오래 봐도 두 배 억제되지는 않는다.
// 기준점 2시간은 책이 인용한 실험의 노출 길이다.
const referenceExposure = 2;

// 5일 연속 반복. 억제가 조금 더 깊어지고 분비 시작이 더 밀린다.
// residualMinutes는 아이패드를 그만 쓴 뒤에도 며칠 남는 지연이다.
const hangover = { supGain: 1.12, extraDelayHours: 0.4, residualMinutes: 90 };

// 밤 곡선. 20시부터 다음 날 5시까지를 20~29로 센다.
const night = {
  start: 20,
  end: 29,
  bedtime: 23,
  onset: 21.4,
  riseWidth: 0.55,
  fallHour: 27.6,
  fallWidth: 0.7,
};

// 억제율에서 나머지 지표로 가는 환산. 모두 선형이고, 완전한 어둠이 기준점이다.
const outcome = {
  maxDelayHours: 2.6,
  baseLatency: 14,
  latencyGain: 52,
  baseChance: 0.94,
  chanceExponent: 0.85,
  maxRemLoss: 24,
};

// 방 그림이 얼마나 어두워지는지. 지수를 1보다 작게 둬야 마지막 한 등을 껐을 때
// 비로소 깜깜해진다 — 사람 눈의 밝기 감각도 그렇게 생겼다.
const room = { fullLux: 200, exponent: 0.45, maxShade: 0.9 };

// 종이책을 읽으려면 최소한 이 정도는 밝아야 한다는 기준. 상태 문구에만 쓴다.
// 무드등 하나(roomLux 8)는 읽을 수 있는 쪽에 둔다 — 그 아래를 권하는 문구와 어긋나면 안 된다.
const readingLux = 7;

// ── 차트 배치 ─────────────────────────────────────────────
// 글자 크기는 viewBox 단위라 폭이 900인 채로 휴대폰에 들어가면 4px로 줄어 못 읽는다.
// 좁은 화면에서는 캔버스 자체를 작고 높게 잡아 확대 비율을 되돌린다.
const layout = {
  wide: { width: 900, height: 300, padding: { top: 26, right: 24, bottom: 42, left: 62 } },
  narrow: { width: 470, height: 360, padding: { top: 24, right: 16, bottom: 38, left: 46 } },
};
const narrowBreakpoint = 760;

let width;
let height;
let padding;
let plotWidth;
let plotHeight;

function isNarrow() {
  return window.innerWidth <= narrowBreakpoint;
}

function syncChartSize() {
  ({ width, height, padding } = isNarrow() ? layout.narrow : layout.wide);
  plotWidth = width - padding.left - padding.right;
  plotHeight = height - padding.top - padding.bottom;
}

// ── DOM ───────────────────────────────────────────────────
const scene = document.querySelector("#roomScene");
const shade = document.querySelector("#roomShade");
const svg = document.querySelector("#melatoninChart");

const controls = {
  exposure: document.querySelector("#exposure"),
  brightness: document.querySelector("#brightness"),
  nightShift: document.querySelector("#nightShift"),
  blackout: document.querySelector("#blackout"),
  repeatNights: document.querySelector("#repeatNights"),
  allOff: document.querySelector("#allOff"),
  reset: document.querySelector("#reset"),
};

const readouts = {
  exposure: document.querySelector("#exposureValue"),
  brightness: document.querySelector("#brightnessValue"),
  nightShift: document.querySelector("#nightShiftValue"),
  blackout: document.querySelector("#blackoutValue"),
  repeat: document.querySelector("#repeatValue"),
  status: document.querySelector("#statusValue"),
  melatonin: document.querySelector("#melatoninValue"),
  melatoninBar: document.querySelector("#melatoninBar"),
  chance: document.querySelector("#chanceValue"),
  chanceBar: document.querySelector("#chanceBar"),
  medi: document.querySelector("#mediValue"),
  delay: document.querySelector("#delayValue"),
  latency: document.querySelector("#latencyValue"),
  rem: document.querySelector("#remValue"),
  screenPill: document.querySelector("#screenPillText"),
};

const sourceRows = new Map(
  [...document.querySelectorAll("#sourceList button[data-source]")].map((button) => [
    button.dataset.source,
    {
      button,
      state: button.querySelector(".source-state"),
      bar: button.querySelector(".source-bar i"),
      value: button.querySelector(".source-value"),
    },
  ]),
);

const hotspots = [...document.querySelectorAll(".light-hotspot")];

// screen만 boolean이 아니다. 아이패드를 끄는 것이 아니라 종이책으로 바꾸는 것이라
// 책이 비교한 두 조건("아이패드로 읽기" vs "종이책으로 읽기")이 그대로 남는다.
const defaults = { ceiling: true, lamp: true, mood: false, window: true, screen: "tablet" };
const state = { ...defaults };

// ── 모델 ──────────────────────────────────────────────────

// 버튼이 눌린 상태인지. 창문은 "커튼이 열려 있는지"를 뜻한다.
function isOn(key) {
  return key === "screen" ? state.screen === "tablet" : state[key];
}

// 그 광원이 실제로 내보내는 몫(0~1). 창문만 0과 1 사이에 설 수 있다.
// 일반 커튼은 쳐도 빛이 배어 들어오기 때문이다.
function levelOf(key) {
  if (key !== "window") return isOn(key) ? 1 : 0;
  if (state.window) return 1;
  return 1 - curtains[curtainKind()].blocks;
}

function curtainKind() {
  return controls.blackout.checked ? "blackout" : "sheer";
}

// 화면은 밝기 슬라이더와 야간 모드가 걸려 있어 다른 광원과 값이 다르게 나온다.
function specOf(key) {
  const spec = sources[key];
  if (key !== "screen") return spec;

  const brightness = Number(controls.brightness.value) / 100;
  const shifted = controls.nightShift.checked;
  return {
    ...spec,
    lux: spec.lux * brightness * (shifted ? nightShift.luxScale : 1),
    melanopic: shifted ? nightShift.melanopic : spec.melanopic,
  };
}

// 광원별 멜라놉 조도(눈에 닿는 청색광)와 방을 밝히는 몫.
function contributions() {
  return Object.keys(sources).map((key) => {
    const spec = specOf(key);
    const level = levelOf(key);
    return {
      key,
      label: spec.label,
      medi: spec.lux * spec.melanopic * level,
      roomLux: spec.roomLux * level,
      on: isOn(key),
    };
  });
}

// 모든 광원을 최대로 켰을 때의 청색광 총량. 막대 길이를 서로 비교하는 기준으로만 쓴다.
function maxMelanopic() {
  return Object.values(sources).reduce((sum, spec) => sum + spec.lux * spec.melanopic, 0);
}

function melatoninAt(hour, onset) {
  const rise = 1 / (1 + Math.exp(-(hour - onset) / night.riseWidth));
  const fall = 1 / (1 + Math.exp((hour - night.fallHour) / night.fallWidth));
  return rise * fall;
}

function evaluate() {
  const parts = contributions();
  const medi = parts.reduce((sum, part) => sum + part.medi, 0);
  const roomLux = parts.reduce((sum, part) => sum + part.roomLux, 0);

  const hours = Number(controls.exposure.value);
  const dose = medi * Math.sqrt(hours / referenceExposure);
  const raw = Math.pow(dose, response.exponent);
  let suppression = (response.max * raw) / (raw + Math.pow(response.half, response.exponent));

  let delayHours = suppression * outcome.maxDelayHours;
  if (controls.repeatNights.checked && suppression > 0) {
    suppression = Math.min(suppression * hangover.supGain, response.max);
    delayHours += hangover.extraDelayHours;
  }

  // 곡선은 "오른쪽으로 밀고 위에서 눌러" 만든다. 진폭은 취침 시각에서의 비율이
  // 위에서 구한 억제율과 정확히 맞도록 역산한다 — 숫자와 그림이 어긋나지 않게.
  const shifted = melatoninAt(night.bedtime - delayHours, night.onset);
  const amplitude = clamp(
    ((1 - suppression) * melatoninAt(night.bedtime, night.onset)) / shifted,
    0.35,
    1,
  );

  return {
    parts,
    medi,
    roomLux,
    hours,
    suppression,
    delayHours,
    amplitude,
    release: 1 - suppression,
    latency: outcome.baseLatency + suppression * outcome.latencyGain,
    chance: outcome.baseChance * Math.pow(1 - suppression, outcome.chanceExponent),
    remLoss: suppression * outcome.maxRemLoss,
  };
}

// ── 방 그림 ───────────────────────────────────────────────

function renderScene(result) {
  scene.dataset.ceiling = state.ceiling ? "on" : "off";
  scene.dataset.lamp = state.lamp ? "on" : "off";
  scene.dataset.mood = state.mood ? "on" : "off";
  scene.dataset.curtain = state.window ? "open" : "closed";
  scene.dataset.curtainKind = curtainKind();
  scene.dataset.screen = state.screen;
  scene.dataset.nightShift = controls.nightShift.checked ? "on" : "off";

  const lit = clamp(result.roomLux / room.fullLux, 0, 1);
  shade.setAttribute("opacity", ((1 - Math.pow(lit, room.exponent)) * room.maxShade).toFixed(3));

  hotspots.forEach((hotspot) => hotspot.setAttribute("aria-pressed", String(isOn(hotspot.dataset.source))));
  readouts.screenPill.textContent = state.screen === "tablet" ? "아이패드" : "종이책";
}

// ── 오른쪽 패널 ───────────────────────────────────────────

function stateLabel(key) {
  if (key === "screen") {
    if (state.screen === "book") return "종이책";
    return controls.nightShift.checked ? "야간 모드" : "보는 중";
  }
  if (key === "window") return state.window ? "커튼 열림" : curtains[curtainKind()].label;
  return state[key] ? "켜짐" : "꺼짐";
}

function renderPanel(result) {
  readouts.exposure.textContent = formatHours(result.hours);
  readouts.brightness.textContent =
    state.screen === "tablet" ? `${controls.brightness.value}%` : "종이책";
  readouts.nightShift.textContent = controls.nightShift.checked ? "켬" : "끔";
  readouts.blackout.textContent = curtains[curtainKind()].label;
  readouts.repeat.textContent = controls.repeatNights.checked ? "반복" : "하룻밤";

  readouts.melatonin.textContent = `${Math.round(result.release * 100)}%`;
  readouts.melatoninBar.style.width = `${result.release * 100}%`;
  readouts.chance.textContent = `${Math.round(result.chance * 100)}%`;
  readouts.chanceBar.style.width = `${result.chance * 100}%`;

  readouts.medi.textContent = `${Math.round(result.medi)} 멜라놉 럭스`;
  readouts.delay.textContent =
    result.delayHours < 0.02 ? "없음" : `${Math.round(result.delayHours * 60)}분 뒤로`;
  readouts.latency.textContent = `약 ${Math.round(result.latency)}분`;
  readouts.rem.textContent = result.remLoss < 0.5 ? "없음" : `약 ${Math.round(result.remLoss)}%`;

  const scale = maxMelanopic();
  result.parts.forEach((part) => {
    const row = sourceRows.get(part.key);
    row.button.setAttribute("aria-pressed", String(part.on));
    row.state.textContent = stateLabel(part.key);
    row.bar.style.width = `${(part.medi / scale) * 100}%`;
    row.value.textContent = part.medi < 0.5 ? "0" : Math.round(part.medi);
  });

  readouts.status.textContent = statusFor(result);
}

function windowShare(result) {
  return result.parts.find((part) => part.key === "window").medi;
}

function statusFor(result) {
  // 디지털 숙취는 매일 밤 빛을 봤을 때 남는 몫이라, 이미 어두운 방에서는 붙이지 않는다.
  const hangoverNote =
    controls.repeatNights.checked && result.medi >= 20
      ? ` 이대로 5일을 반복하면, 그만둔 뒤에도 며칠은 분비 시작이 약 ${hangover.residualMinutes}분 늦습니다.`
      : "";

  if (state.screen === "book" && result.roomLux < readingLux) {
    return "종이책을 읽기엔 너무 어둡습니다. 무드등 정도면 읽으면서도 멜라토닌을 거의 지킬 수 있습니다.";
  }
  // 거의 다 껐는데 창문이 아직 남아 있는 상태. 마지막 한 걸음을 짚어준다.
  if (!state.window && curtainKind() === "sheer" && windowShare(result) > 0 && result.medi < 20) {
    return "커튼은 쳤지만 일반 커튼이라 빛이 배어 들어옵니다. 암막 커튼으로 바꿔보세요.";
  }
  if (result.medi < 3) return "거의 완전한 어둠입니다. 멜라토닌이 제 시각에 그대로 나옵니다.";
  if (result.medi < 20) return "무드등 수준입니다. 방은 어둡지만 생활은 되는 구간입니다.";
  if (result.medi < 60) return `아직 몸이 낮이라고 읽습니다. 남은 광원 중 가장 푸른 것부터 꺼보세요.${hangoverNote}`;
  return `저녁 거실 그대로입니다. 시교차상핵은 지금을 한낮으로 알고 있습니다.${hangoverNote}`;
}

// ── 차트 ──────────────────────────────────────────────────

function xFor(hour) {
  return padding.left + ((hour - night.start) / (night.end - night.start)) * plotWidth;
}

function yFor(value) {
  return padding.top + (1 - value) * plotHeight;
}

// 0.05시간 간격이면 900px 폭에서 곡선이 충분히 매끄럽다.
function curvePath(valueAt) {
  const commands = [];
  for (let hour = night.start; hour <= night.end + 1e-9; hour += 0.05) {
    const x = xFor(hour).toFixed(2);
    const y = yFor(valueAt(hour)).toFixed(2);
    commands.push(`${commands.length === 0 ? "M" : "L"} ${x} ${y}`);
  }
  return commands.join(" ");
}

function renderChart(result) {
  syncChartSize();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const reference = (hour) => melatoninAt(hour, night.onset);
  const current = (hour) => result.amplitude * melatoninAt(hour - result.delayHours, night.onset);

  const exposureStart = Math.max(night.start, night.bedtime - result.hours);
  svg.appendChild(
    create("rect", {
      x: xFor(exposureStart),
      y: padding.top,
      width: xFor(night.bedtime) - xFor(exposureStart),
      height: plotHeight,
      class: "light-exposure-band",
    }),
  );
  svg.appendChild(
    create("rect", {
      x: xFor(night.bedtime),
      y: padding.top,
      width: xFor(night.end) - xFor(night.bedtime),
      height: plotHeight,
      class: "light-sleep-band",
    }),
  );

  for (let hour = night.start; hour <= night.end; hour += 1) {
    svg.appendChild(
      create("line", {
        x1: xFor(hour),
        y1: padding.top,
        x2: xFor(hour),
        y2: padding.top + plotHeight,
        class: "amyloid-grid",
      }),
    );
    svg.appendChild(
      create("text", { x: xFor(hour), y: padding.top + plotHeight + 20, class: "amyloid-axis-tick" }, `${hour % 24}시`),
    );
  }

  [0, 0.5, 1].forEach((value) => {
    svg.appendChild(
      create("line", {
        x1: padding.left,
        y1: yFor(value),
        x2: padding.left + plotWidth,
        y2: yFor(value),
        class: value === 0 ? "axis-line" : "amyloid-grid",
      }),
    );
    svg.appendChild(
      create("text", { x: padding.left - 10, y: yFor(value) + 4, class: "amyloid-row-label" }, `${value * 100}%`),
    );
  });

  svg.appendChild(create("text", { x: padding.left, y: 16, class: "amyloid-panel-title" }, "저녁 멜라토닌 (완전한 어둠의 최고치를 100%로)"));
  svg.appendChild(
    create("text", { x: xFor(exposureStart) + 8, y: padding.top + 16, class: "light-band-label" }, "빛 노출"),
  );
  svg.appendChild(
    create("text", { x: xFor(night.bedtime) + 8, y: padding.top + 16, class: "light-band-label" }, "취침 후"),
  );

  const line = curvePath(current);
  const base = padding.top + plotHeight;
  svg.appendChild(
    create("path", { d: `${line} L ${xFor(night.end).toFixed(2)} ${base} L ${padding.left} ${base} Z`, class: "light-current-fill" }),
  );
  svg.appendChild(create("path", { d: curvePath(reference), class: "light-reference-line" }));
  svg.appendChild(create("path", { d: line, class: "light-current-line" }));

  renderBedtimeGap(result, reference, current);
  renderDelayBracket(result);

  svg.appendChild(
    create("text", { x: xFor(night.end) - 4, y: yFor(reference(night.end)) - 10, class: "light-curve-label is-reference" }, "완전한 어둠"),
  );
  svg.appendChild(
    create("text", { x: xFor(night.end) - 4, y: yFor(current(night.end)) + 20, class: "light-curve-label" }, "지금 조명"),
  );
}

// 취침 시각에서 두 곡선이 벌어진 만큼이 곧 화면 위쪽의 "멜라토닌 분비율"이다.
function renderBedtimeGap(result, reference, current) {
  const x = xFor(night.bedtime);
  svg.appendChild(
    create("line", { x1: x, y1: padding.top, x2: x, y2: padding.top + plotHeight, class: "light-bedtime-line" }),
  );
  svg.appendChild(create("text", { x: x + 6, y: padding.top + plotHeight - 8, class: "light-bedtime-label" }, "취침 23시"));

  const top = yFor(reference(night.bedtime));
  const bottom = yFor(current(night.bedtime));
  if (bottom - top < 6) return;

  svg.appendChild(create("line", { x1: x, y1: top, x2: x, y2: bottom, class: "light-gap-line" }));
  svg.appendChild(create("circle", { cx: x, cy: top, r: 3.5, class: "light-gap-dot is-reference" }));
  svg.appendChild(create("circle", { cx: x, cy: bottom, r: 4, class: "light-gap-dot" }));
  // 간격 한가운데에 두면 좁은 화면에서 지연 눈금 글자와 겹친다. 아래쪽 점 바로 위에 붙인다.
  svg.appendChild(
    create("text", { x: x - 8, y: bottom - 7, class: "light-gap-label" }, `−${Math.round(result.suppression * 100)}%`),
  );
}

// 두 곡선이 각자 절반에 닿는 시각의 차이. 곡선을 옆으로 민 거리가 곧 분비 지연이다.
function renderDelayBracket(result) {
  if (result.delayHours < 0.1) return;

  const y = yFor(0.5) - 26;
  const from = xFor(night.onset);
  const to = xFor(night.onset + result.delayHours);
  svg.appendChild(create("path", { d: `M ${from} ${y - 5} L ${from} ${y} L ${to} ${y} L ${to} ${y - 5}`, class: "light-delay-bracket" }));
  svg.appendChild(
    create("text", { x: (from + to) / 2, y: y - 9, class: "light-delay-label" }, `분비 시작 ${Math.round(result.delayHours * 60)}분 지연`),
  );
}

// ── 조작 ──────────────────────────────────────────────────

function toggle(key) {
  if (key === "screen") state.screen = state.screen === "tablet" ? "book" : "tablet";
  else state[key] = !state[key];
  update();
}

function update() {
  const result = evaluate();
  renderScene(result);
  renderPanel(result);
  renderChart(result);
}

hotspots.forEach((hotspot) => {
  hotspot.addEventListener("click", () => toggle(hotspot.dataset.source));
  // SVG의 <g>는 버튼이 아니라서 스페이스·엔터가 저절로 먹지 않는다.
  hotspot.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle(hotspot.dataset.source);
  });
});

sourceRows.forEach((row, key) => row.button.addEventListener("click", () => toggle(key)));

[controls.exposure, controls.brightness, controls.nightShift, controls.blackout, controls.repeatNights].forEach(
  (input) => input.addEventListener("input", update),
);

// "완전한 어둠" 프리셋이므로 커튼도 암막으로 바꾼다. 일반 커튼만 남으면 0이 되지 않는다.
controls.allOff.addEventListener("click", () => {
  Object.assign(state, { ceiling: false, lamp: false, mood: false, window: false, screen: "book" });
  controls.blackout.checked = true;
  update();
});

// 차트 크기가 바뀌는 순간에만 다시 그린다. 리사이즈마다 그리면 헛일이다.
let wasNarrow = isNarrow();
window.addEventListener("resize", () => {
  if (isNarrow() === wasNarrow) return;
  wasNarrow = isNarrow();
  update();
});

controls.reset.addEventListener("click", () => {
  Object.assign(state, defaults);
  controls.exposure.value = "2";
  controls.brightness.value = "100";
  controls.nightShift.checked = false;
  controls.blackout.checked = false;
  controls.repeatNights.checked = false;
  update();
});

update();
