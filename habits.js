// 부록 "건강한 수면을 위한 열두 가지 비결"을 하루 일정으로 옮긴 장면.
//
// 열두 개를 체크박스로 켜고 끄게 만들 수도 있었지만, 그러면 목록을 옮겨 적은 것에 지나지 않는다.
// 그래서 입력은 "오늘 하루를 어떻게 보냈는가"로 두고, 열두 항목의 지킴/어김은 결과로 따라 나오게 했다.
// 체크리스트는 입력이 아니라 출력이다.

// ── 시간축 ────────────────────────────────────────────────
// 기상 시각을 오른쪽 끝에 못박고 거기서 24시간을 거슬러 올라간다.
// 이렇게 잡아야 기상 시각을 어떻게 바꿔도 "아침 햇빛 → 하루 → 취침 → 기상"이
// 한 화면 안에서 순서대로 이어진다. 자정을 넘는 시각은 24, 25… 로 계속 센다.
const dayLength = 24;

// ── 기본 하루 ─────────────────────────────────────────────
// 열두 가지를 대체로 어긴 하루에서 시작한다. 하나씩 고쳐가며 밤이 어떻게 달라지는지 보는 장면이라,
// 처음부터 좋은 하루면 만질 이유가 없어진다.
const defaults = {
  bedtime: 24,
  wake: 31,
  shift: 2,
  caffeine: "15",
  nicotine: false,
  exercise: "none",
  drinks: 2,
  meal: "heavy",
  nap: "none",
  meds: false,
  windDown: false,
  bath: false,
  dark: false,
  devices: false,
  sunlight: false,
  ifAwake: "stay",
};

// 열두 항목을 모두 지킨 하루. "다 지키기" 버튼이 이 값을 그대로 꽂는다.
// 아래 referenceNight의 기준 밤도 이 하루로 계산한다.
const ideal = {
  bedtime: 23,
  wake: 31,
  shift: 0,
  caffeine: "12",
  nicotine: false,
  exercise: "afternoon",
  drinks: 0,
  meal: "light",
  nap: "none",
  meds: false,
  windDown: true,
  bath: true,
  dark: true,
  devices: true,
  sunlight: true,
  ifAwake: "getup",
};

// ── 선택지 ────────────────────────────────────────────────
// hour가 null이면 그 날 그 일이 없었다는 뜻이다.
const exercises = {
  none: { label: "안 함", hour: null },
  morning: { label: "아침 7시 반", hour: 7.5 },
  afternoon: { label: "오후 3시", hour: 15 },
  evening: { label: "저녁 7시", hour: 19 },
  late: { label: "취침 한 시간 전", hour: null }, // 취침 시각에 붙어 다녀서 아래에서 따로 계산한다
};

const naps = {
  none: { label: "안 잠", hour: null },
  early: { label: "오후 1시 반 · 20분", hour: 13.5 },
  late: { label: "오후 4시 반 · 40분", hour: 16.5 },
};

const meals = { none: { label: "안 먹음" }, light: { label: "가벼운 간식" }, heavy: { label: "든든한 한 끼" } };

// ── 카페인 ────────────────────────────────────────────────
// 반감기 6시간. 책은 카페인 효과가 "완전히 사라지는 데 여덟 시간까지" 걸린다고 하는데,
// 반감기가 6시간이면 여덟 시간 뒤에도 40%가 남아 있다. 그 남은 몫이 아래 잠복기를 늘린다.
const caffeineHalfLife = 6;

// 운동이 끝나고 취침까지 이만큼은 비어 있어야 "너무 늦지 않게" 한 것으로 본다 (책은 두세 시간).
const exerciseGap = 2.5;

// ── 잠복기 (분) ───────────────────────────────────────────
// base에서 시작해 아래 항목을 더하고 뺀다. 전부 체감을 위해 정한 값이지 측정값이 아니다.
// 열두 가지를 다 지킨 밤이 10분, 다 어긴 밤이 두 시간 가까이 나오도록 맞췄다.
const latency = {
  base: 26,
  caffeine: 44, // 취침 시각의 잔류량 1.0당
  nicotine: 7,
  noExercise: 4,
  lateExercise: 16,
  exerciseDone: -3,
  lateNap: 18,
  earlyNap: 2,
  heavyMeal: 7,
  meds: 8,
  brightWarmRoom: 6,
  devices: 7, // 화면, 그리고 자꾸 쳐다보는 시계
  noSunlight: 5,
  perShiftHour: 5,
  bath: -7,
  windDown: -6,
  // 술은 잠복기를 줄인다. 이 항목만 부호가 반대인데, 그게 네 번째 비결의 함정이다 —
  // 빨리 잠드는 대신 아래 remShift와 arousal에서 몇 배로 되갚는다.
  firstDrink: -10,
  nextDrink: -5,
  drinkFloor: -24,
  anxious: 6, // 20분을 넘겨 뒤척일 때만 갈린다
};

// ── 밤중 각성 (횟수) ──────────────────────────────────────
const arousal = {
  base: 0.6,
  perDrink: 0.7,
  heavyMeal: 0.5,
  lightMeal: 0.15,
  nicotine: 0.8, // 금단 증상으로 새벽에 깬다
  caffeine: 0.7,
  brightWarmRoom: 0.5,
  devices: 0.3,
  meds: 0.6,
  cap: 6,
};

// 한 번 깼을 때 다시 잠들기까지. 누워서 걱정하면 길어진다 — 열두 번째 비결이 여기서 갈린다.
const arousalLength = { stay: 0.25, getup: 0.14 };

// ── 수면 단계 배분 ────────────────────────────────────────
// deep/rem에 곱하는 배율. 1.0이 아무 방해도 없는 밤이다.
const deepShift = { caffeine: -0.3, perDrink: -0.06, exercise: 0.1, noExercise: -0.06, brightWarmRoom: -0.1 };
const remShift = { perDrink: -0.2, meds: -0.1, nicotine: -0.08 };

// 한 주기 안의 배분. 깊은 잠은 초저녁 주기에 몰리고, 렘은 뒤로 갈수록 길어진다.
// 그래서 늦게 자거나 일찍 깨면 깊은 잠이 아니라 렘이 먼저 잘려나간다.
const cycle = { length: 1.5, deepPeak: 0.42, deepDecay: 0.55, remPeak: 0.3, remRise: 0.6 };

// ── 점수 배점 ─────────────────────────────────────────────
// 양(40) + 깊은 잠(20) + 렘(20) + 연속성(10) + 규칙성(10).
const scoring = { amount: 40, deep: 20, rem: 20, continuity: 10, regularity: 10, targetSleep: 8, wakeCap: 4, shiftCap: 2 };

// ── 도구 ──────────────────────────────────────────────────
function clockLabel(hour) {
  const whole = Math.floor(hour + 1e-6);
  const minutes = Math.round((hour - whole) * 60);
  const h = ((whole % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function minutesLabel(value) {
  return `${Math.round(value)}분`;
}

// ── 상태 읽기 ─────────────────────────────────────────────
const controls = {
  bedtime: document.querySelector("#bedtime"),
  wake: document.querySelector("#wake"),
  shift: document.querySelector("#shift"),
  caffeine: document.querySelector("#caffeine"),
  nicotine: document.querySelector("#nicotine"),
  exercise: document.querySelector("#exercise"),
  drinks: document.querySelector("#drinks"),
  meal: document.querySelector("#meal"),
  nap: document.querySelector("#nap"),
  meds: document.querySelector("#meds"),
  windDown: document.querySelector("#windDown"),
  bath: document.querySelector("#bath"),
  dark: document.querySelector("#dark"),
  devices: document.querySelector("#devices"),
  sunlight: document.querySelector("#sunlight"),
  ifAwake: document.querySelector("#ifAwake"),
};

const numeric = new Set(["bedtime", "wake", "shift", "drinks"]);

function readState() {
  const state = {};
  Object.entries(controls).forEach(([key, node]) => {
    if (node.type === "checkbox") state[key] = node.checked;
    else if (numeric.has(key)) state[key] = Number(node.value);
    else state[key] = node.value;
  });
  // 취침이 기상을 넘어서면 밤이 뒤집힌다. 슬라이더 두 개가 각각 움직이므로 여기서 막는다.
  state.bedtime = Math.min(state.bedtime, state.wake - 2);
  return state;
}

function writeState(state) {
  Object.entries(controls).forEach(([key, node]) => {
    if (node.type === "checkbox") node.checked = state[key];
    else node.value = String(state[key]);
  });
}

// ── 모델 ──────────────────────────────────────────────────
function context(state) {
  const lastCup = state.caffeine === "none" ? null : Number(state.caffeine);
  const exerciseAt = state.exercise === "late" ? state.bedtime - 1 : exercises[state.exercise].hour;
  return {
    lastCup,
    exerciseAt,
    napAt: naps[state.nap].hour,
    // 취침 시각에 남아 있는 카페인. 마신 적이 없으면 0이다.
    residue: lastCup === null ? 0 : Math.pow(0.5, (state.bedtime - lastCup) / caffeineHalfLife),
  };
}

function sleepLatency(state, ctx) {
  let minutes = latency.base;
  minutes += latency.caffeine * ctx.residue;
  if (state.nicotine) minutes += latency.nicotine;

  if (ctx.exerciseAt === null) minutes += latency.noExercise;
  else if (state.bedtime - ctx.exerciseAt < exerciseGap) minutes += latency.lateExercise;
  else minutes += latency.exerciseDone;

  if (state.nap === "late") minutes += latency.lateNap;
  if (state.nap === "early") minutes += latency.earlyNap;
  if (state.meal === "heavy") minutes += latency.heavyMeal;
  if (state.meds) minutes += latency.meds;
  if (!state.dark) minutes += latency.brightWarmRoom;
  if (!state.devices) minutes += latency.devices;
  if (!state.sunlight) minutes += latency.noSunlight;
  minutes += latency.perShiftHour * state.shift;
  if (state.bath) minutes += latency.bath;
  if (state.windDown) minutes += latency.windDown;
  if (state.drinks > 0) {
    minutes += Math.max(latency.drinkFloor, latency.firstDrink + (state.drinks - 1) * latency.nextDrink);
  }

  // 열두 번째 비결은 "스무 밤 넘게 잠이 안 올 때" 이야기다.
  // 그 전에 잠드는 밤에는 누워 있든 일어나든 아무 일도 일어나지 않아야 한다.
  if (minutes > 20) minutes += state.ifAwake === "stay" ? latency.anxious : -latency.anxious * 0.5;

  return clamp(minutes, 5, 150);
}

function arousalCount(state, ctx) {
  let count = arousal.base;
  count += arousal.perDrink * state.drinks;
  if (state.meal === "heavy") count += arousal.heavyMeal;
  if (state.meal === "light") count += arousal.lightMeal;
  if (state.nicotine) count += arousal.nicotine;
  count += arousal.caffeine * ctx.residue;
  if (!state.dark) count += arousal.brightWarmRoom;
  if (!state.devices) count += arousal.devices;
  if (state.meds) count += arousal.meds;
  return clamp(count, 0, arousal.cap);
}

// 각성을 밤의 어느 지점에 끼울지 정한다. 주기 사이사이에 고르게 벌려 놓는다.
function arousalSlots(count, cycles) {
  const slots = new Set();
  for (let k = 0; k < count; k += 1) {
    let index = clamp(Math.round(((k + 1) * cycles) / (count + 1)), 1, 11);
    while (slots.has(index) && index < 11) index += 1;
    slots.add(index);
  }
  return slots;
}

// 밤을 90분 주기로 쌓아 올린다. 잘려나가는 단계를 눈으로 보려면
// 총량을 먼저 정하고 나누는 게 아니라, 이렇게 쌓다가 기상 시각에서 자르는 편이 정직하다.
function buildNight(p) {
  const segments = [];
  const onset = Math.min(p.bedtime + p.latency, p.wake);
  if (onset > p.bedtime) segments.push({ stage: "settle", start: p.bedtime, end: onset });

  let t = onset;
  const cycles = Math.max(1, Math.ceil((p.wake - onset) / cycle.length));
  const slots = arousalSlots(Math.round(p.arousals), cycles);

  for (let i = 0; t < p.wake - 0.01 && i < 12; i += 1) {
    if (slots.has(i)) {
      const end = Math.min(t + p.arousalLength, p.wake);
      segments.push({ stage: "wake", start: t, end });
      t = end;
      if (t >= p.wake - 0.01) break;
    }

    const deep = clamp(cycle.deepPeak * Math.exp(-i * cycle.deepDecay) * p.deepMul, 0, 0.55);
    const rem = clamp(cycle.remPeak * (1 - Math.exp(-(i + 0.6) * cycle.remRise)) * p.remMul, 0, 0.55);
    const light = Math.max(0.15, 1 - deep - rem);
    const sum = deep + rem + light;

    // N2 → N3 → N2 → 렘 순서. 얕은 잠은 앞뒤로 나눠 붙인다.
    const plan = [
      ["light", (light / sum) * 0.45],
      ["deep", deep / sum],
      ["light", (light / sum) * 0.55],
      ["rem", rem / sum],
    ];
    for (const [stage, share] of plan) {
      if (t >= p.wake - 0.004) break;
      const end = Math.min(t + share * cycle.length, p.wake);
      if (end - t > 0.004) segments.push({ stage, start: t, end });
      t = end;
    }
  }
  if (p.wake - t > 0.01) segments.push({ stage: "light", start: t, end: p.wake });
  return segments;
}

function totalsOf(segments) {
  const totals = { settle: 0, wake: 0, rem: 0, light: 0, deep: 0 };
  segments.forEach((s) => {
    totals[s.stage] += s.end - s.start;
  });
  totals.asleep = totals.rem + totals.light + totals.deep;
  totals.arousals = segments.filter((s) => s.stage === "wake").length;
  return totals;
}

function runModel(state) {
  const ctx = context(state);
  const minutes = sleepLatency(state, ctx);
  const deepMul = clamp(
    1 +
      deepShift.caffeine * ctx.residue +
      deepShift.perDrink * state.drinks +
      (ctx.exerciseAt === null ? deepShift.noExercise : deepShift.exercise) +
      (state.dark ? 0 : deepShift.brightWarmRoom),
    0.35,
    1.3,
  );
  const remMul = clamp(
    1 + remShift.perDrink * state.drinks + (state.meds ? remShift.meds : 0) + (state.nicotine ? remShift.nicotine : 0),
    0.3,
    1.2,
  );

  const segments = buildNight({
    bedtime: state.bedtime,
    wake: state.wake,
    latency: minutes / 60,
    arousals: arousalCount(state, ctx),
    arousalLength: arousalLength[state.ifAwake],
    deepMul,
    remMul,
  });

  return { state, ctx, minutes, segments, totals: totalsOf(segments) };
}

// 열두 가지를 다 지킨 밤. 게이지와 점수가 기대는 기준선이라 한 번만 계산해 둔다.
const reference = runModel(ideal);

function scoreOf(run) {
  const t = run.totals;
  const parts = [
    scoring.amount * clamp(t.asleep / scoring.targetSleep, 0, 1),
    scoring.deep * clamp(t.deep / reference.totals.deep, 0, 1),
    scoring.rem * clamp(t.rem / reference.totals.rem, 0, 1),
    scoring.continuity * clamp(1 - t.arousals / scoring.wakeCap, 0, 1),
    scoring.regularity * clamp(1 - run.state.shift / scoring.shiftCap, 0, 1),
  ];
  return Math.round(parts.reduce((a, b) => a + b, 0));
}

// ── 열두 가지 비결 채점 ───────────────────────────────────
// 각 항목은 지금 하루에서 지켰는지와, 왜 그렇게 봤는지 한 줄을 돌려준다.
function judge(state, ctx) {
  const bed = clockLabel(state.bedtime);
  const residuePercent = Math.round(ctx.residue * 100);

  return [
    {
      kept: state.shift <= 0.5,
      note:
        state.shift <= 0.5
          ? `주중이든 주말이든 ${bed}쯤 눕습니다. 열두 가지 중 하나만 남긴다면 이것입니다.`
          : `주말에 ${formatHours(state.shift)} 늦게 눕습니다. 밀린 잠은 그렇게 다 갚아지지 않고, 월요일 아침만 더 힘들어집니다.`,
    },
    {
      kept: ctx.exerciseAt !== null && state.bedtime - ctx.exerciseAt >= exerciseGap,
      note:
        ctx.exerciseAt === null
          ? "운동을 하지 않았습니다. 낮에 쌓아둔 것이 없으면 밤에 내려갈 것도 적습니다."
          : state.bedtime - ctx.exerciseAt < exerciseGap
            ? `취침 ${formatHours(state.bedtime - ctx.exerciseAt)} 전에 운동했습니다. 올라간 체온이 아직 안 내려왔습니다.`
            : `${clockLabel(ctx.exerciseAt)}에 끝냈습니다. 취침까지 ${formatHours(state.bedtime - ctx.exerciseAt)} 남습니다.`,
    },
    {
      kept: (ctx.lastCup === null || state.bedtime - ctx.lastCup >= 8) && !state.nicotine,
      note: [
        ctx.lastCup === null
          ? "카페인은 마시지 않았습니다."
          : `마지막 잔이 ${clockLabel(ctx.lastCup)}입니다. 누울 때까지 ${residuePercent}%가 남아 있습니다.`,
        state.nicotine ? "니코틴도 자극제입니다. 잠이 얕아지고 새벽에 금단으로 깹니다." : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      kept: state.drinks === 0,
      note:
        state.drinks === 0
          ? "술 없이 눕습니다."
          : `${state.drinks}잔 마셨습니다. 잠들기는 빨라지지만 렘수면이 눌리고, 알코올이 분해되는 새벽에 깨어납니다.`,
    },
    {
      kept: state.meal !== "heavy",
      note:
        state.meal === "heavy"
          ? "자기 전에 든든히 먹었습니다. 소화 불량과 야간 소변이 밤을 조각냅니다."
          : state.meal === "light"
            ? "가벼운 간식 정도는 괜찮습니다."
            : "밤에 따로 먹지 않았습니다.",
    },
    {
      kept: !state.meds,
      note: state.meds
        ? "잠을 방해할 수 있는 약을 밤에 먹었습니다. 복용 시간을 낮이나 이른 저녁으로 옮길 수 있는지 의사·약사에게 물어볼 일입니다."
        : "밤에 먹는 약이 없습니다.",
    },
    {
      kept: state.nap !== "late",
      note:
        state.nap === "late"
          ? `${clockLabel(naps.late.hour)}에 낮잠을 잤습니다. 밤에 쓸 수면압력을 오후에 당겨 썼습니다.`
          : state.nap === "early"
            ? `${clockLabel(naps.early.hour)}, 오후 3시 전입니다. 이 시간이면 밤을 건드리지 않습니다.`
            : "낮잠은 자지 않았습니다.",
    },
    {
      kept: state.windDown,
      note: state.windDown
        ? "눕기 전 30분은 책이나 음악에 씁니다."
        : "일정이 취침 시각까지 꽉 차 있습니다. 긴장을 풀 시간이 없습니다.",
    },
    {
      kept: state.bath,
      note: state.bath
        ? "뜨거운 물에 몸을 담갔습니다. 욕조에서 나온 뒤 체온이 떨어지면서 졸음이 옵니다."
        : "자기 전에 씻지 않았습니다.",
    },
    {
      kept: state.dark && state.devices,
      note: [
        state.dark ? "" : "침실이 밝고 따뜻합니다.",
        state.devices ? "" : "머리맡에 화면이 있고, 시계 문자판이 보입니다.",
        state.dark && state.devices ? "어둡고 서늘하고, 화면도 시계도 눈에 안 들어옵니다." : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      kept: state.sunlight,
      note: state.sunlight
        ? `${clockLabel(state.wake - dayLength + 0.5)}쯤 30분 동안 바깥 빛을 쬡니다. 오늘 밤 시간표를 여기서 맞춥니다.`
        : "실외에서 자연광을 받은 시간이 없습니다. 하루 리듬을 맞출 기준점이 없습니다.",
    },
    {
      kept: state.ifAwake === "getup",
      note:
        state.ifAwake === "getup"
          ? "20분 넘게 잠이 안 오면 일어나서 졸음이 올 때까지 다른 것을 합니다."
          : "잠이 안 와도 계속 누워 있습니다. 못 잘지도 모른다는 걱정이 잠을 더 밀어냅니다.",
    },
  ];
}

// ── 그리기: 하루 띠 ───────────────────────────────────────
const dayLayout = {
  wide: { width: 900, padding: { top: 16, right: 22, bottom: 26, left: 58 } },
  narrow: { width: 470, padding: { top: 14, right: 14, bottom: 24, left: 46 } },
};

const daySvg = document.querySelector("#habitDay");
const nightSvg = document.querySelector("#habitNight");

function dayGeometry() {
  const narrow = daySvg.clientWidth > 0 && daySvg.clientWidth < 640;
  const base = narrow ? dayLayout.narrow : dayLayout.wide;
  const pad = base.padding;
  const caffeineTop = pad.top + 16;
  const caffeineHeight = 44;
  const laneTop = caffeineTop + caffeineHeight + 14;
  const laneHeight = 72; // 라벨 네 줄
  const weekTop = laneTop + laneHeight;
  const weekHeight = 30;
  const weekendTop = weekTop + weekHeight + 16;
  const weekendHeight = 22;
  const axisY = weekendTop + weekendHeight + 16;
  return { ...base, pad, caffeineTop, caffeineHeight, laneTop, laneHeight, weekTop, weekHeight, weekendTop, weekendHeight, axisY, height: axisY + 12 };
}

function dayEvents(state, ctx, axisStart) {
  const list = [];
  if (state.sunlight) list.push({ hour: axisStart + 0.5, label: "아침 햇빛", good: true });
  if (ctx.lastCup !== null) list.push({ hour: ctx.lastCup, label: "마지막 커피", good: state.bedtime - ctx.lastCup >= 8 });
  if (ctx.exerciseAt !== null) list.push({ hour: ctx.exerciseAt, label: "운동", good: state.bedtime - ctx.exerciseAt >= exerciseGap });
  if (ctx.napAt !== null) list.push({ hour: ctx.napAt, label: "낮잠", good: state.nap === "early" });
  if (state.nicotine) list.push({ hour: state.bedtime - 2.5, label: "담배", good: false });
  if (state.meal !== "none") list.push({ hour: state.bedtime - 2, label: state.meal === "heavy" ? "야식" : "간식", good: state.meal !== "heavy" });
  if (state.bath) list.push({ hour: state.bedtime - 1.25, label: "뜨거운 목욕", good: true });
  if (state.drinks > 0) list.push({ hour: state.bedtime - 1, label: `술 ${state.drinks}잔`, good: false });
  if (state.meds) list.push({ hour: state.bedtime - 0.75, label: "밤에 먹는 약", good: false });
  if (state.windDown) list.push({ hour: state.bedtime - 0.5, label: "이완 30분", good: true });
  return list.filter((e) => e.hour >= axisStart).sort((a, b) => a.hour - b.hour);
}

// 취침 앞 두어 시간에 일이 몰린다. 최악의 경우 두 시간 안에 여덟 개가 들어오는데,
// 그 폭이 70픽셀도 안 돼서 라벨을 제자리에 두면 무조건 겹친다.
// 네 줄로 나눠 얹고, 그래도 모자라면 라벨만 옆으로 밀어낸 뒤 점까지 선을 그어 잇는다.
const laneGap = 4;

function placeLabels(events, x, laneCount, left, right) {
  const lanes = Array.from({ length: laneCount }, () => []);
  const edges = new Array(laneCount).fill(-Infinity);

  events.forEach((event) => {
    // 한글 한 글자를 9.4픽셀로 넉넉히 잡는다. 실제보다 크게 잡아야 안 겹친다.
    const half = (event.label.length * 9.4) / 2 + 5;
    const anchor = x(event.hour);
    let lane = edges.findIndex((edge) => edge < anchor - half);
    if (lane === -1) lane = edges.indexOf(Math.min(...edges));
    edges[lane] = anchor + half;
    lanes[lane].push({ ...event, lane, half, anchor, textX: anchor });
  });

  lanes.forEach((row) => {
    // 왼쪽부터 차례로 밀어낸다
    let cursor = left;
    row.forEach((item) => {
      item.textX = Math.max(item.anchor, cursor + item.half);
      cursor = item.textX + item.half + laneGap;
    });
    // 오른쪽 끝을 넘겼으면 뒤에서부터 되민다
    let limit = right;
    for (let i = row.length - 1; i >= 0; i -= 1) {
      row[i].textX = Math.min(row[i].textX, limit - row[i].half);
      limit = row[i].textX - row[i].half - laneGap;
    }
  });

  return lanes.flat();
}

function renderDay(run) {
  const g = dayGeometry();
  const state = run.state;
  const axisStart = state.wake - dayLength;
  const axisEnd = state.wake;
  const x = (hour) => g.pad.left + ((hour - axisStart) / dayLength) * (g.width - g.pad.left - g.pad.right);
  const right = g.width - g.pad.right;
  const parts = [];

  daySvg.setAttribute("viewBox", `0 0 ${g.width} ${g.height}`);

  // ── 카페인 잔류 ──
  parts.push(create("text", { class: "habit-panel-title", x: g.pad.left, y: g.pad.top + 8 }, "몸에 남아 있는 카페인"));
  parts.push(
    create("rect", { class: "habit-caffeine-bed", x: g.pad.left, y: g.caffeineTop, width: right - g.pad.left, height: g.caffeineHeight }),
  );
  if (run.ctx.lastCup !== null) {
    const yFor = (value) => g.caffeineTop + g.caffeineHeight - value * g.caffeineHeight;
    const points = [];
    // 기상 시각을 늦게 잡으면 축의 왼쪽 끝이 커피 시각보다 뒤로 온다. 그때는 축에서 시작해
    // 이미 절반쯤 빠진 값부터 그린다. 안 자르면 곡선이 눈금 밖으로 삐져나간다.
    const curveStart = Math.max(run.ctx.lastCup, axisStart);
    for (let hour = curveStart; hour <= axisEnd + 0.001; hour += 0.25) {
      points.push(`${x(hour).toFixed(1)} ${yFor(Math.pow(0.5, (hour - run.ctx.lastCup) / caffeineHalfLife)).toFixed(1)}`);
    }
    const startX = x(curveStart).toFixed(1);
    parts.push(
      create("path", {
        class: "habit-caffeine-fill",
        d: `M ${startX} ${g.caffeineTop + g.caffeineHeight} L ${points.join(" L ")} L ${x(axisEnd).toFixed(1)} ${g.caffeineTop + g.caffeineHeight} Z`,
      }),
    );
    parts.push(create("path", { class: "habit-caffeine-line", d: `M ${points.join(" L ")}` }));
    // 라벨을 패널 위쪽에 고정하면 곡선과 멀어져서 무엇의 35%인지 안 읽힌다. 곡선에 붙인다.
    const bedY = yFor(run.ctx.residue);
    parts.push(create("circle", { class: "habit-caffeine-dot", cx: x(state.bedtime), cy: bedY, r: 3.5 }));
    parts.push(
      create("text", { class: "habit-caffeine-note", x: x(state.bedtime) + 8, y: bedY - 6 }, `취침 시 ${Math.round(run.ctx.residue * 100)}%`),
    );
  } else {
    parts.push(create("text", { class: "habit-caffeine-note", x: g.pad.left + 8, y: g.caffeineTop + 26 }, "오늘은 마시지 않았습니다"));
  }

  // ── 잠자리 띠 ──
  parts.push(create("rect", { class: "habit-band-awake", x: g.pad.left, y: g.weekTop, width: right - g.pad.left, height: g.weekHeight, rx: 5 }));
  // 취침 전 세 시간. 운동, 술, 야식, 목욕이 여기 들어오는지가 밤을 가른다.
  parts.push(
    create("rect", { class: "habit-band-window", x: x(state.bedtime - 3), y: g.weekTop, width: x(state.bedtime) - x(state.bedtime - 3), height: g.weekHeight }),
  );
  parts.push(
    create("rect", { class: "habit-band-sleep", x: x(state.bedtime), y: g.weekTop, width: right - x(state.bedtime), height: g.weekHeight, rx: 5 }),
  );
  parts.push(create("text", { class: "habit-row-label", x: g.pad.left - 10, y: g.weekTop + g.weekHeight / 2 + 4 }, "주중"));
  parts.push(
    create("text", { class: "habit-band-text", x: x(state.bedtime) + 8, y: g.weekTop + g.weekHeight / 2 + 4 }, `${clockLabel(state.bedtime)} 취침`),
  );
  parts.push(create("text", { class: "habit-band-text is-end", x: right - 8, y: g.weekTop + g.weekHeight / 2 + 4 }, `${clockLabel(state.wake)} 기상`));

  // ── 주말 띠 ──
  parts.push(
    create("rect", { class: "habit-band-awake", x: g.pad.left, y: g.weekendTop, width: right - g.pad.left, height: g.weekendHeight, rx: 4 }),
  );
  const weekendBed = Math.min(state.bedtime + state.shift, axisEnd);
  parts.push(
    create("rect", { class: "habit-band-sleep is-weekend", x: x(weekendBed), y: g.weekendTop, width: right - x(weekendBed), height: g.weekendHeight, rx: 4 }),
  );
  parts.push(create("text", { class: "habit-row-label", x: g.pad.left - 10, y: g.weekendTop + g.weekendHeight / 2 + 4 }, "주말"));
  if (state.shift > 0) {
    const mid = (x(state.bedtime) + x(weekendBed)) / 2;
    parts.push(
      create("line", { class: "habit-shift-arrow", x1: x(state.bedtime), y1: g.weekendTop + g.weekendHeight / 2, x2: x(weekendBed), y2: g.weekendTop + g.weekendHeight / 2 }),
    );
    parts.push(create("text", { class: "habit-shift-label", x: mid, y: g.weekendTop - 4 }, `+${formatHours(state.shift)}`));
    // 주말은 기상도 같이 밀린다. 그 시각은 축 오른쪽 밖이라 화살표로만 알린다.
    parts.push(
      create("text", { class: "habit-band-text is-end", x: right - 8, y: g.weekendTop + g.weekendHeight / 2 + 4 }, `${clockLabel(state.wake + state.shift)} 기상 →`),
    );
  } else {
    parts.push(create("text", { class: "habit-shift-label is-flat", x: x(state.bedtime) + 8, y: g.weekendTop - 4 }, "주중과 같은 시각"));
  }

  // ── 사건 ──
  placeLabels(dayEvents(state, run.ctx, axisStart), x, 4, g.pad.left, right).forEach((event) => {
    const laneY = g.laneTop + event.lane * 16 + 10;
    const klass = event.good ? "is-good" : "is-bad";
    parts.push(create("line", { class: `habit-event-stem ${klass}`, x1: event.textX, y1: laneY + 4, x2: event.anchor, y2: g.weekTop }));
    parts.push(create("circle", { class: `habit-event-dot ${klass}`, cx: event.anchor, cy: g.weekTop, r: 4 }));
    parts.push(create("text", { class: `habit-event-label ${klass}`, x: event.textX, y: laneY }, event.label));
  });

  // ── 눈금 ──
  // 라벨 구역까지 선을 그으면 표처럼 보여서 사건이 안 읽힌다. 위아래로 끊어 긋는다.
  for (let hour = Math.ceil(axisStart); hour <= axisEnd; hour += 3) {
    parts.push(create("line", { class: "habit-grid", x1: x(hour), y1: g.caffeineTop, x2: x(hour), y2: g.caffeineTop + g.caffeineHeight }));
    parts.push(create("line", { class: "habit-grid", x1: x(hour), y1: g.weekTop, x2: x(hour), y2: g.weekendTop + g.weekendHeight }));
    parts.push(create("text", { class: "habit-axis-tick", x: x(hour), y: g.axisY }, clockLabel(hour)));
  }

  daySvg.replaceChildren(...parts);
}

// ── 그리기: 밤 구조 ───────────────────────────────────────
const nightLayout = {
  wide: { width: 760, height: 380, padding: { top: 26, right: 18, bottom: 34, left: 74 } },
  narrow: { width: 460, height: 340, padding: { top: 24, right: 12, bottom: 30, left: 62 } },
};

const stageRows = [
  { key: "wake", label: "각성", row: 0 },
  { key: "rem", label: "렘수면", row: 1 },
  { key: "light", label: "얕은 잠", row: 2 },
  { key: "deep", label: "깊은 잠", row: 3 },
];

// settle(뒤척임)은 각성 행에 같이 그린다. 눈을 감고 있을 뿐 자고 있지는 않다.
const rowOf = { settle: 0, wake: 0, rem: 1, light: 2, deep: 3 };

function renderNight(run) {
  const narrow = nightSvg.clientWidth > 0 && nightSvg.clientWidth < 560;
  const g = narrow ? nightLayout.narrow : nightLayout.wide;
  const pad = g.padding;
  const state = run.state;
  const rowHeight = (g.height - pad.top - pad.bottom) / stageRows.length;
  const x = (hour) => pad.left + ((hour - state.bedtime) / (state.wake - state.bedtime)) * (g.width - pad.left - pad.right);
  const parts = [];

  nightSvg.setAttribute("viewBox", `0 0 ${g.width} ${g.height}`);
  parts.push(create("text", { class: "habit-panel-title", x: pad.left, y: pad.top - 10 }, "오늘 밤의 구조"));

  stageRows.forEach((row) => {
    const y = pad.top + row.row * rowHeight;
    parts.push(create("rect", { class: `habit-stage-row row-${row.key}`, x: pad.left, y, width: g.width - pad.left - pad.right, height: rowHeight }));
    parts.push(create("text", { class: "habit-row-label", x: pad.left - 10, y: y + rowHeight / 2 + 4 }, row.label));
  });

  for (let hour = Math.ceil(state.bedtime); hour <= state.wake; hour += 1) {
    parts.push(create("line", { class: "habit-grid", x1: x(hour), y1: pad.top, x2: x(hour), y2: pad.top + rowHeight * stageRows.length }));
    if (hour % 2 === 0) parts.push(create("text", { class: "habit-axis-tick", x: x(hour), y: g.height - pad.bottom + 20 }, clockLabel(hour)));
  }

  // 단계 막대. 잘려나간 렘이 눈에 띄어야 하므로 렘은 굵게 그린다.
  const barHeight = 14;
  run.segments.forEach((segment) => {
    const y = pad.top + rowOf[segment.stage] * rowHeight + rowHeight / 2 - barHeight / 2;
    parts.push(
      create("rect", {
        class: `habit-stage-bar is-${segment.stage}`,
        x: x(segment.start),
        y,
        width: Math.max(1.2, x(segment.end) - x(segment.start)),
        height: barHeight,
        rx: 3,
      }),
    );
  });

  // 계단선. 막대만으로는 밤이 이어져 있다는 게 안 보인다.
  const steps = run.segments.map((segment) => {
    const y = pad.top + rowOf[segment.stage] * rowHeight + rowHeight / 2;
    return `L ${x(segment.start).toFixed(1)} ${y} L ${x(segment.end).toFixed(1)} ${y}`;
  });
  if (steps.length > 0) parts.push(create("path", { class: "habit-hypnogram-line", d: `M ${x(state.bedtime).toFixed(1)} ${pad.top + rowHeight / 2} ${steps.join(" ")}` }));

  const onset = state.bedtime + run.minutes / 60;
  parts.push(create("line", { class: "habit-onset-line", x1: x(onset), y1: pad.top, x2: x(onset), y2: pad.top + rowHeight * stageRows.length }));
  parts.push(create("text", { class: "habit-onset-label", x: x(onset) + 6, y: pad.top + 12 }, `${minutesLabel(run.minutes)} 만에 잠듦`));

  nightSvg.replaceChildren(...parts);
}

// ── 그리기: 읽는 값 ───────────────────────────────────────
const readout = {
  score: document.querySelector("#scoreValue"),
  scoreBar: document.querySelector("#scoreBar"),
  kept: document.querySelector("#keptValue"),
  latency: document.querySelector("#latencyValue"),
  asleep: document.querySelector("#asleepValue"),
  arousals: document.querySelector("#arousalValue"),
  jetlag: document.querySelector("#jetlagValue"),
  deep: document.querySelector("#deepValue"),
  deepBar: document.querySelector("#deepBar"),
  rem: document.querySelector("#remValue"),
  remBar: document.querySelector("#remBar"),
  summary: document.querySelector("#statusValue"),
};

function renderPanel(run, verdicts) {
  const t = run.totals;
  const keptCount = verdicts.filter((v) => v.kept).length;
  const score = scoreOf(run);

  readout.score.textContent = String(score);
  readout.scoreBar.style.width = `${score}%`;
  readout.kept.textContent = `${keptCount} / 12`;
  readout.latency.textContent = minutesLabel(run.minutes);
  readout.asleep.textContent = formatHours(t.asleep);
  readout.arousals.textContent = t.arousals === 0 ? "없음" : `${t.arousals}번 · ${minutesLabel(t.wake * 60)}`;
  readout.jetlag.textContent = run.state.shift === 0 ? "없음" : formatHours(run.state.shift);

  readout.deep.textContent = formatHours(t.deep);
  readout.deepBar.style.width = `${clamp((t.deep / reference.totals.deep) * 100, 0, 100)}%`;
  readout.rem.textContent = formatHours(t.rem);
  readout.remBar.style.width = `${clamp((t.rem / reference.totals.rem) * 100, 0, 100)}%`;

  readout.summary.textContent = `${keptCount}개를 지켰습니다. 잠들기까지 ${minutesLabel(run.minutes)}, 실제로 잔 시간 ${formatHours(t.asleep)}.`;
}

function renderTips(verdicts) {
  verdicts.forEach((verdict, index) => {
    const card = document.querySelector(`#tip${index + 1}`);
    if (card === null) return;
    card.dataset.kept = verdict.kept ? "yes" : "no";
    card.querySelector(".tip-state").textContent = verdict.kept ? "지킴" : "어김";
    card.querySelector(".tip-note").textContent = verdict.note;
  });
}

// ── 조절판 라벨 ───────────────────────────────────────────
const valueLabels = {
  bedtime: (state) => clockLabel(state.bedtime),
  wake: (state) => clockLabel(state.wake),
  shift: (state) => (state.shift === 0 ? "없음" : `+${formatHours(state.shift)}`),
  drinks: (state) => (state.drinks === 0 ? "안 마심" : `${state.drinks}잔`),
};

function renderLabels(state) {
  Object.entries(valueLabels).forEach(([key, format]) => {
    const node = document.querySelector(`#${key}Value`);
    if (node !== null) node.textContent = format(state);
  });
}

// ── 갱신 ──────────────────────────────────────────────────
function update() {
  const state = readState();
  // 취침이 기상보다 두 시간 이상 앞서도록 잘린 값을 슬라이더에도 되돌려 놓는다.
  if (Number(controls.bedtime.value) !== state.bedtime) controls.bedtime.value = String(state.bedtime);

  const run = runModel(state);
  const verdicts = judge(state, run.ctx);

  renderLabels(state);
  renderDay(run);
  renderNight(run);
  renderPanel(run, verdicts);
  renderTips(verdicts);
}

// SVG의 clientWidth는 창이 막 바뀐 직후에는 옛 값을 돌려준다(resize 이벤트가 레이아웃보다 먼저 온다).
// 그 값으로 배치를 고르면 좁은 화면에 넓은 배치가 그대로 남아 글자가 뭉개진다.
// ResizeObserver는 레이아웃이 끝난 뒤에 오고, 첫 관찰 때 한 번 바로 불러주므로 초기 렌더도 여기서 바로잡힌다.
const observedWidths = new Map();
const frameObserver = new ResizeObserver((entries) => {
  let changed = false;
  entries.forEach((entry) => {
    const width = Math.round(entry.contentRect.width);
    // 높이는 그림 때문에 계속 바뀐다. 폭만 봐야 다시 그리기가 무한히 돌지 않는다.
    if (observedWidths.get(entry.target) !== width) {
      observedWidths.set(entry.target, width);
      changed = true;
    }
  });
  if (changed) update();
});

Object.values(controls).forEach((node) => node.addEventListener("input", update));
document.querySelector("#applyIdeal").addEventListener("click", () => {
  writeState(ideal);
  update();
});
document.querySelector("#reset").addEventListener("click", () => {
  writeState(defaults);
  update();
});

writeState(defaults);
update();
[daySvg.parentElement, nightSvg.parentElement].forEach((frame) => frameObserver.observe(frame));
