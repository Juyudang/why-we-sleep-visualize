// ── 시간축 ────────────────────────────────────────────────
// 22시(취침 1시간 전)에서 새벽 4시까지. 24를 넘는 시각은 25, 26… 으로 이어 센다.
const night = { start: 22, bedtime: 23, end: 28 };
const stepHours = 1 / 60;

// ── 하루주기 심부 온도 ────────────────────────────────────
// 저녁부터 새벽까지 내려가는 S자. peak−floor = 0.8도이고, 여기에 열 방출로 더 깎여
// 22시 대비 최대 1도쯤 떨어진다 — 책이 말하는 "1도"가 이 낙폭이다.
const circadian = { peak: 37.05, floor: 36.25, mid: 23.9, width: 1.05 };

// 22시의 심부 온도. 모든 낙폭은 이 값을 기준으로 잰다.
const startCore = 37.0;

// 심부 온도가 하루주기 곡선에서 벗어날 수 있는 폭.
// dip    : 열이 잘 빠질 때 곡선보다 더 내려갈 수 있는 몫 (잠들 무렵의 급강하)
// hot    : 열이 안 빠질 때 곡선 위에 떠 있는 몫 (더운 방에서 심부가 안 내려가는 몫)
// preDip : 눕기 전에 내려갈 수 있는 한계. 서서 움직이는 동안에는 몸이 체온을 붙잡으므로
//          목욕을 해도 이만큼까지만 떨어진다. 이 뚜껑이 없으면 목욕하고 한 시간 서 있는 것만으로
//          이미 다 식어 버려서, 누운 뒤의 변화가 안 보인다.
const drift = { dip: 0.45, hot: 0.42, reserveSpan: 1.6, preDip: 0.2 };

// 열수지. load(내보내야 할 열)보다 dump(내보내는 능력)가 크면 심부가 내려간다.
// coolRate는 그 차이 1당 시간당 몇 도인지. 이상적인 조건에서 약 1.8도/시가 나오도록 잡았다.
const coolRate = 3;
// 심부 온도가 시간당 움직일 수 있는 한계(도/시). 실제 몸도 이보다 빠르게는 안 변한다.
// 이 뚜껑이 없으면 아주 좋은 조건에서 몇 분 만에 다 식어 버려 곡선이 계단처럼 꺾인다.
const rateCap = { fall: 1.5, rise: 0.9 };
const needed = 0.42;
// 취침 전에는 서서 움직이므로 내보내야 할 열이 더 많다. 그래서 샤워를 해도 눕기 전까지는 잘 안 내려간다.
const wakeLoad = 1.9;

// ── 계절 ──────────────────────────────────────────────────
// outdoor : 바깥 기온. pull은 밤새 방 온도가 바깥쪽으로 끌려가는 비율이다.
//           겨울에 pull이 작은 것은 난방과 단열이 붙잡아 주기 때문이다.
const seasons = {
  spring: { label: "봄·가을", outdoor: 14, defaultRoom: 22, pull: 0.3 },
  summer: { label: "한여름", outdoor: 26, defaultRoom: 28, pull: 0.35 },
  winter: { label: "한겨울", outdoor: 0, defaultRoom: 20, pull: 0.14 },
};

// ── 냉방 ──────────────────────────────────────────────────
// airflow : 피부 위의 공기층을 벗겨내는 정도. 방 온도를 바꾸지 않고 사람만 식힌다.
// roomTau : 방 온도가 목표에 닿는 시간 상수(시간). 에어컨만 방 자체를 끌고 간다.
const cooling = {
  none: { label: "없음", airflow: 1, roomTau: 3.2 },
  fan: { label: "선풍기", airflow: 1.42, roomTau: 3.2 },
  ac: { label: "에어컨", airflow: 1.16, roomTau: 0.65 },
};

// ── 옷과 이불 ─────────────────────────────────────────────
// insul은 피부 바깥에 갇히는 공기층. 둘을 더한 값이 클수록 이불 속이 피부 온도에 가까워지고,
// 그러면 내보낼 곳이 없어진다.
const outfits = {
  bare: { label: "속옷 차림", insul: 0.06 },
  light: { label: "반팔 반바지", insul: 0.14 },
  pajama: { label: "긴팔 잠옷", insul: 0.24 },
  fleece: { label: "기모 수면잠옷", insul: 0.34 },
};

const beddings = {
  sheet: { label: "홑이불", insul: 0.16 },
  summer: { label: "여름 이불", insul: 0.3 },
  winter: { label: "겨울 이불", insul: 0.46 },
};

const maxInsul = 0.85;

// ── 샤워 ──────────────────────────────────────────────────
// boost : 말단 혈관이 열리는 몫 (피가 표면으로 올라온다)
// heat  : 몸에 들어온 열 자체. 씻은 직후에는 심부 온도가 오히려 잠깐 올라간다.
const showers = {
  none: { label: "안 함", boost: 0, heat: 0 },
  cool: { label: "미지근한 샤워", boost: 0.16, heat: 0.03 },
  warm: { label: "따뜻한 샤워", boost: 0.3, heat: 0.12 },
  bath: { label: "따뜻한 목욕", boost: 0.44, heat: 0.26 },
};

// 확장 곡선은 (1−e^−m/rise)·e^−m/fall 꼴이다. rise가 짧고 fall이 길어
// 씻고 25분쯤 뒤에 정점을 찍고 두 시간에 걸쳐 사그라든다.
// peak은 그 정점의 크기라, 이 값으로 나눠 boost가 곧 정점 높이가 되게 한다.
const showerCurve = { rise: 12, fall: 110, peak: 0.7, heatFall: 22 };

// ── 말단 혈관 확장 ────────────────────────────────────────
// 저녁이 깊어지면 저절로 열린다. 여기에 샤워가 얹히고, 방이 추우면 반대로 닫힌다.
const vaso = { base: 0.26, gain: 0.54, mid: 23.2, width: 0.72 };

// 추울 때의 수축. coldFull 이상에서는 영향이 없고, coldFloor까지 내려가면 min까지 닫힌다.
// warm 쪽은 더울 때 저절로 더 열리는 몫이다 (열을 내보내려는 시도이지만 내보낼 곳이 없다).
const gate = { coldFloor: 6, coldFull: 16, min: 0.18, warmStart: 24, warmSpan: 8, warmMax: 0.25 };

// ── 피부 온도 ─────────────────────────────────────────────
// 피부는 심부와 주변 공기 사이 어딘가에 선다. 혈관이 열릴수록 심부 쪽으로 끌려간다.
// neutral은 이불 속 공기가 수렴하는 온도 — 사람 피부 온도다.
const skinMix = { neutral: 34, distalBase: 0.2, distalGain: 0.55, proxBase: 0.56, proxGain: 0.18 };

// ── 열이 빠져나가는 세 경로 ───────────────────────────────
// distal : 손발. 혈관이 열려 있고 이불 밖으로 나와 있을 때 가장 크다.
// trunk  : 몸통. 이불이 두꺼울수록 막힌다.
// sweat  : 땀. 방이 더워지면 열리는 마지막 통로인데, 이건 열은 빼도 잠은 깨운다(discomfort 참고).
// refGap : 피부와 주변 공기의 온도차 몇 도를 "충분한 기울기 1"로 볼지.
const heatPaths = {
  refGap: 9,
  trunkBase: 0.45,
  distalW: 0.62,
  trunkW: 0.55,
  sweatW: 0.3,
  sweatStart: 26.5,
  sweatSpan: 6,
  coveredHands: 0.75,
  coveredAir: 0.45,
};

// ── 불쾌감 ────────────────────────────────────────────────
// 땀과 시린 발은 열수지와 별개로 잠을 막는다.
// dropPenalty는 "불쾌하면 같은 낙폭으로도 못 잠든다"는 몫이고,
// wakeGain은 자는 동안 쌓인 불쾌감이 각성 한 번으로 터지는 속도다.
const comfort = {
  sweatWeight: 0.8,
  coldStart: 17,
  coldSpan: 9,
  coldWeight: 0.9,
  airflowRelief: 0.9,
  dropPenalty: 0.35,
  wakeGain: 1.6,
};

// 잠드는 문턱. 밤 전체의 목표(−1도)와는 다른 값이라 차트에 둘 다 그린다.
const onsetDrop = 0.55;
const nightGoal = 1;

// 책이 말하는 이상적인 침실 온도.
const idealRoom = 18.3;

// 비교선으로 쓰는 이상적인 조건. 사용자 설정과 무관하게 한 번만 계산한다.
const idealSettings = {
  season: "spring",
  roomStart: idealRoom,
  cooling: "none",
  acSet: 24,
  outfit: "light",
  bedding: "summer",
  shower: "bath",
  showerBefore: 60,
  handsOut: true,
};

// ── 모델 ──────────────────────────────────────────────────

function circadianTarget(hour) {
  const span = circadian.peak - circadian.floor;
  return circadian.floor + span / (1 + Math.exp((hour - circadian.mid) / circadian.width));
}

function vasoBase(hour) {
  return vaso.base + vaso.gain / (1 + Math.exp(-(hour - vaso.mid) / vaso.width));
}

function showerHour(settings) {
  return night.bedtime - settings.showerBefore / 60;
}

function showerBoost(hour, settings) {
  const spec = showers[settings.shower];
  if (spec.boost === 0) return 0;
  const minutes = (hour - showerHour(settings)) * 60;
  if (minutes < 0) return 0;
  const shape = (1 - Math.exp(-minutes / showerCurve.rise)) * Math.exp(-minutes / showerCurve.fall);
  return (spec.boost * shape) / showerCurve.peak;
}

// 씻고 난 직후 몸에 남은 열. 목욕 직후 바로 누우면 심부가 오히려 잠깐 올라간다.
function showerHeat(hour, settings) {
  const spec = showers[settings.shower];
  if (spec.heat === 0) return 0;
  const minutes = (hour - showerHour(settings)) * 60;
  if (minutes < 0) return 0;
  return spec.heat * Math.exp(-minutes / showerCurve.heatFall);
}

function gradient(delta) {
  return clamp(delta / heatPaths.refGap, 0, 1.6);
}

// 냉방을 끄면 방은 밤새 바깥 기온 쪽으로 끌려간다. 에어컨만 방 자체를 설정 온도로 끌고 간다.
function roomTargetOf(settings) {
  const season = seasons[settings.season];
  if (settings.cooling === "ac") return settings.acSet;
  return settings.roomStart + (season.outdoor - settings.roomStart) * season.pull;
}

function simulate(settings) {
  const cool = cooling[settings.cooling];
  const wear = outfits[settings.outfit].insul;
  const covered = clamp(wear + beddings[settings.bedding].insul, 0, maxInsul);
  const roomTarget = roomTargetOf(settings);

  let room = settings.roomStart;
  let coreBase = startCore;
  let arousalDebt = 0;

  const samples = [];
  const wakeHours = [];
  let onsetHour = null;

  for (let hour = night.start; hour <= night.end + 1e-9; hour += stepHours) {
    const inBed = hour >= night.bedtime - 1e-9;
    // 눕기 전에는 이불이 없고 손발도 늘 나와 있다.
    const insul = inBed ? covered : wear;
    const handsOut = inBed ? settings.handsOut : true;

    const core = coreBase + showerHeat(hour, settings);
    const ambCovered = room + insul * (skinMix.neutral - room);
    const ambDistal = handsOut ? room : ambCovered;

    const cold = clamp((ambDistal - gate.coldFloor) / (gate.coldFull - gate.coldFloor), gate.min, 1);
    const warm = clamp((ambCovered - gate.warmStart) / gate.warmSpan, 0, gate.warmMax);
    const perfusion = clamp(vasoBase(hour) * cold + showerBoost(hour, settings) + warm, 0, 1);

    const distal = ambDistal + (core - ambDistal) * (skinMix.distalBase + skinMix.distalGain * perfusion);
    const prox = ambCovered + (core - ambCovered) * (skinMix.proxBase + skinMix.proxGain * perfusion);

    const airflow = 1 + (cool.airflow - 1) * (handsOut ? 1 : heatPaths.coveredAir);
    const distalPath =
      perfusion * gradient(distal - ambDistal) * airflow * (handsOut ? 1 : heatPaths.coveredHands);
    const trunkPath = heatPaths.trunkBase * gradient(prox - ambCovered) * (1 - insul * 0.5);
    const sweatRaw = clamp((ambCovered - heatPaths.sweatStart) / heatPaths.sweatSpan, 0, 1);
    const dump =
      heatPaths.distalW * distalPath + heatPaths.trunkW * trunkPath + heatPaths.sweatW * sweatRaw * airflow;

    const coldStress = handsOut ? clamp((comfort.coldStart - ambDistal) / comfort.coldSpan, 0, 1) : 0;
    // 바람이 지나가면 같은 땀이라도 덜 불쾌하다. 선풍기가 방을 못 식히면서도 잠을 돕는 이유다.
    const relief = clamp(1 - (airflow - 1) * comfort.airflowRelief, 0.3, 1);
    const discomfort = clamp(sweatRaw * comfort.sweatWeight * relief + coldStress * comfort.coldWeight, 0, 1.2);

    const drop = startCore - core;
    if (inBed && onsetHour === null && drop >= onsetDrop + discomfort * comfort.dropPenalty) {
      onsetHour = hour;
    }
    const asleep = onsetHour !== null && hour >= onsetHour;

    // 자는 동안 불쾌감이 쌓이다 한 번씩 각성으로 터진다.
    if (asleep) {
      arousalDebt += discomfort * comfort.wakeGain * stepHours;
      if (arousalDebt >= 1) {
        arousalDebt -= 1;
        wakeHours.push(hour);
      }
    }

    samples.push({ hour, core, room, distal, prox, perfusion, dump, discomfort, drop, asleep });

    // 심부 온도가 하루주기 곡선에서 얼마나 벗어날 수 있는지는 "지금 열을 얼마나 잘 내보내는가"가 정한다.
    // 여유가 있으면 곡선보다 더 내려가고(reserve), 모자라면 곡선 위에 떠 있는다(deficit).
    // 이 한 줄이 없으면 어떤 방에서 자든 곡선이 똑같이 겹쳐 버린다 — 몸의 체온 방어가 하는 일이다.
    const load = needed * (inBed ? 1 : wakeLoad);
    const reserve = clamp((dump - load) / (load * drift.reserveSpan), 0, 1);
    const deficit = clamp(1 - dump / load, 0, 1);
    const target = circadianTarget(hour);
    const rate = clamp(coolRate * (load - dump), -rateCap.fall, rateCap.rise);
    coreBase = clamp(
      coreBase + rate * stepHours,
      inBed ? target - drift.dip * reserve : startCore - drift.preDip,
      inBed ? target + drift.hot * deficit : startCore,
    );
    room += (roomTarget - room) * (stepHours / cool.roomTau);
  }

  const last = samples[samples.length - 1];
  const lowest = samples.reduce((min, s) => Math.min(min, s.core), startCore);

  return {
    samples,
    wakeHours,
    onsetHour,
    latency: onsetHour === null ? null : Math.round((onsetHour - night.bedtime) * 60),
    lowest,
    totalDrop: startCore - lowest,
    finalRoom: last.room,
    roomTarget,
  };
}

// ── 열화상 팔레트 ─────────────────────────────────────────
// 온도 → 색. 아래 정거장은 styles.css의 .thermal-scale 그라디언트와 같은 값이라,
// 한쪽만 고치면 눈금과 몸 색이 어긋난다. 고칠 때 둘 다 고칠 것.
const thermalStops = [
  [22, [22, 24, 66]],
  [26, [62, 40, 124]],
  [29.5, [150, 54, 122]],
  [32, [214, 92, 66]],
  [34, [244, 158, 52]],
  [35.8, [255, 210, 96]],
  [37.4, [255, 247, 206]],
];

function thermalColor(celsius) {
  const first = thermalStops[0];
  const last = thermalStops[thermalStops.length - 1];
  if (celsius <= first[0]) return `rgb(${first[1].join()})`;
  if (celsius >= last[0]) return `rgb(${last[1].join()})`;

  for (let i = 1; i < thermalStops.length; i += 1) {
    const [hiT, hiC] = thermalStops[i];
    if (celsius > hiT) continue;
    const [loT, loC] = thermalStops[i - 1];
    const t = (celsius - loT) / (hiT - loT);
    const mix = loC.map((c, k) => Math.round(c + (hiC[k] - c) * t));
    return `rgb(${mix.join()})`;
  }
  return `rgb(${last[1].join()})`;
}

// ── 차트 배치 ─────────────────────────────────────────────
// 글자 크기가 viewBox 단위라, 좁은 화면에서는 캔버스를 작고 높게 잡아 확대 비율을 되돌린다.
const layout = {
  wide: {
    width: 900,
    height: 430,
    padding: { top: 24, right: 22, bottom: 38, left: 58 },
    panels: { core: 196, skin: 132 },
    gap: 40,
  },
  narrow: {
    width: 470,
    height: 460,
    padding: { top: 22, right: 14, bottom: 34, left: 46 },
    panels: { core: 210, skin: 150 },
    gap: 44,
  },
};
const narrowBreakpoint = 760;

// 두 패널의 세로 범위. 심부는 좁게(0.1도가 보여야 한다), 피부·방은 넓게 잡는다.
const coreScale = { min: 35.7, max: 37.4 };
const skinScale = { min: 10, max: 38 };

let chart;
let plotWidth;
let panelTop;

function isNarrow() {
  return window.innerWidth <= narrowBreakpoint;
}

function syncChartSize() {
  chart = isNarrow() ? layout.narrow : layout.wide;
  plotWidth = chart.width - chart.padding.left - chart.padding.right;
  panelTop = {
    core: chart.padding.top,
    skin: chart.padding.top + chart.panels.core + chart.gap,
  };
}

// ── DOM ───────────────────────────────────────────────────
const scene = document.querySelector("#bedScene");
const svg = document.querySelector("#tempChart");

const controls = {
  season: document.querySelector("#season"),
  roomStart: document.querySelector("#roomStart"),
  cooling: document.querySelector("#coolingMode"),
  acSet: document.querySelector("#acSet"),
  outfit: document.querySelector("#outfit"),
  bedding: document.querySelector("#bedding"),
  shower: document.querySelector("#shower"),
  showerBefore: document.querySelector("#showerBefore"),
  handsOut: document.querySelector("#handsOut"),
  speed: document.querySelector("#speed"),
  playToggle: document.querySelector("#playToggle"),
  restart: document.querySelector("#restart"),
  reset: document.querySelector("#reset"),
};

const readouts = {
  roomStart: document.querySelector("#roomStartValue"),
  acSet: document.querySelector("#acSetValue"),
  showerBefore: document.querySelector("#showerBeforeValue"),
  handsOut: document.querySelector("#handsOutValue"),
  speed: document.querySelector("#speedValue"),
  perfusion: document.querySelector("#perfusionValue"),
  perfusionBar: document.querySelector("#perfusionBar"),
  dump: document.querySelector("#dumpValue"),
  dumpBar: document.querySelector("#dumpBar"),
  core: document.querySelector("#coreValue"),
  drop: document.querySelector("#dropValue"),
  room: document.querySelector("#roomValue"),
  distal: document.querySelector("#distalValue"),
  latency: document.querySelector("#latencyValue"),
  wake: document.querySelector("#wakeValue"),
  status: document.querySelector("#statusValue"),
};

// 열화상으로 칠할 몸의 부위. 값은 그 부위가 어느 온도를 따라가는지다.
//   core   : 심부 그대로
//   trunk  : 몸통 피부
//   limb   : 몸통과 말단의 중간 (허벅지, 종아리)
//   distal : 말단 그대로 (손, 발)
const bodyParts = [
  ["#partCore", "core"],
  ["#partHead", "trunk", 0.9],
  ["#partNeck", "trunk", 0.4],
  ["#partTorso", "trunk"],
  ["#partHip", "trunk", -0.3],
  ["#partThigh", "limb"],
  ["#partShin", "limb", -0.8],
  ["#partFoot", "distal"],
  ["#partArm", "limb", -0.2],
  ["#partForearm", "limb", -0.6],
  ["#partHandIn", "distal"],
  ["#partArmOut", "limb", -0.2],
  ["#partForearmOut", "limb", -0.6],
  ["#partHandOut", "distal"],
];

const sceneNodes = {
  thermRoom: document.querySelector("#thermRoom"),
  thermCore: document.querySelector("#thermCore"),
  thermClock: document.querySelector("#thermClock"),
  heatHand: document.querySelector("#heatHand"),
  heatFoot: document.querySelector("#heatFoot"),
  blanketPill: document.querySelector("#blanketPillText"),
};

// ── 상태 ──────────────────────────────────────────────────
const defaults = {
  season: "spring",
  roomStart: 22,
  cooling: "none",
  acSet: 24,
  outfit: "light",
  bedding: "summer",
  shower: "none",
  showerBefore: 60,
  handsOut: true,
};

let result = simulate(defaults);
const idealRun = simulate(idealSettings);
let playTime = 0;
let playing = false;
let lastFrame = null;

function settingsFromControls() {
  return {
    season: controls.season.value,
    roomStart: Number(controls.roomStart.value),
    cooling: controls.cooling.value,
    acSet: Number(controls.acSet.value),
    outfit: controls.outfit.value,
    bedding: controls.bedding.value,
    shower: controls.shower.value,
    showerBefore: Number(controls.showerBefore.value),
    handsOut: controls.handsOut.checked,
  };
}

function sampleAt(hours) {
  const index = clamp(Math.round(hours / stepHours), 0, result.samples.length - 1);
  return result.samples[index];
}

// 시각과 분을 따로 반올림하면 24.9999가 "00:60"으로 나온다.
// 1분씩 더해 오는 값이라 이런 자투리가 반드시 생긴다. 분으로 먼저 모아서 나눈다.
function clockLabel(hour) {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function hourTick(hour) {
  return `${Math.round(hour) % 24}시`;
}

// ── 장면 ──────────────────────────────────────────────────

function partTemperature(sample, kind, offset = 0) {
  const middle = (sample.prox + sample.distal) / 2;
  const base = kind === "core" ? sample.core : kind === "trunk" ? sample.prox : kind === "limb" ? middle : sample.distal;
  return base + offset;
}

function renderScene(sample) {
  const settings = settingsFromControls();
  scene.dataset.season = settings.season;
  scene.dataset.cooling = settings.cooling;
  scene.dataset.exposed = sample.hour < night.bedtime || settings.handsOut ? "on" : "off";
  scene.dataset.asleep = sample.asleep ? "on" : "off";
  // 눕기 전에는 침대 밖에 서 있다.
  scene.dataset.stage = sample.hour < night.bedtime ? "before" : "bed";

  bodyParts.forEach(([selector, kind, offset]) => {
    const node = document.querySelector(selector);
    if (node !== null) node.setAttribute("fill", thermalColor(partTemperature(sample, kind, offset)));
  });

  sceneNodes.thermRoom.textContent = sample.room.toFixed(1);
  sceneNodes.thermCore.textContent = `심부 ${sample.core.toFixed(2)}°`;
  sceneNodes.thermClock.textContent = clockLabel(sample.hour);

  // 열이 실제로 빠져나가는 만큼만 아지랑이를 띄운다. 손발을 넣으면 같이 사라진다.
  const plume = clamp((sample.dump - 0.2) / 0.9, 0, 1);
  sceneNodes.heatHand.setAttribute("opacity", plume.toFixed(2));
  sceneNodes.heatFoot.setAttribute("opacity", plume.toFixed(2));
  sceneNodes.blanketPill.textContent = settings.handsOut ? "이불: 손발 내놓기" : "이불: 손발 넣기";
}

// ── 오른쪽 패널 ───────────────────────────────────────────

function latencyText() {
  if (result.latency === null) return "새벽까지 못 잠";
  if (result.latency <= 0) return "눕자마자";
  return `${result.latency}분`;
}

function renderPanel(sample) {
  readouts.perfusion.textContent = `${Math.round(sample.perfusion * 100)}%`;
  readouts.perfusionBar.style.width = `${sample.perfusion * 100}%`;
  // 게이지의 100%는 "이불 속에서 내보내야 하는 열"이다. 그 선을 넘겨야 심부가 내려간다.
  readouts.dump.textContent = `${Math.round((sample.dump / needed) * 100)}%`;
  readouts.dumpBar.style.width = `${clamp((sample.dump / needed / 2) * 100, 0, 100)}%`;

  readouts.core.textContent = `${sample.core.toFixed(2)}°C`;
  readouts.drop.textContent = sample.drop < 0 ? `+${(-sample.drop).toFixed(2)}°C` : `−${sample.drop.toFixed(2)}°C`;
  readouts.room.textContent = `${sample.room.toFixed(1)}°C`;
  readouts.distal.textContent = `${sample.distal.toFixed(1)}°C`;
  readouts.latency.textContent = latencyText();
  readouts.wake.textContent = result.wakeHours.length === 0 ? "없음" : `${result.wakeHours.length}번`;
  readouts.status.textContent = statusText(sample);
}

function statusText(sample) {
  const settings = settingsFromControls();
  const bedAmbient = sample.room + clamp(outfits[settings.outfit].insul + beddings[settings.bedding].insul, 0, maxInsul) * (skinMix.neutral - sample.room);

  if (result.latency === null) {
    if (bedAmbient > heatPaths.sweatStart + 2) {
      return "심부 온도가 문턱까지 안 내려갑니다. 이불 속이 이미 피부 온도라 열이 갈 곳이 없습니다. 이불이나 옷부터 얇게 해보세요.";
    }
    if (settings.handsOut && sample.room < comfort.coldStart) {
      return "너무 춥습니다. 손발의 혈관이 닫혀서, 방이 찬데도 오히려 열을 못 내보냅니다.";
    }
    return "새벽 4시까지 심부 온도가 잠드는 문턱까지 내려가지 않았습니다.";
  }

  if (!settings.handsOut) {
    return `손발을 이불 속에 넣으면 열을 내보낼 창구가 막힙니다. 내놓기만 해도 ${latencyText()}가 크게 줄어듭니다.`;
  }
  if (result.wakeHours.length >= 2) {
    return `잠들기는 했지만 밤새 ${result.wakeHours.length}번 깹니다. 잠든 뒤에도 방은 계속 더워서, 열을 못 버린 채로 자는 밤입니다.`;
  }
  if (settings.shower === "none" && result.latency > 30) {
    return "잘 내려가고는 있습니다. 자기 전 따뜻한 물로 씻으면 피가 표면으로 올라와 훨씬 빨리 떨어집니다.";
  }
  if (result.latency <= 20) {
    return "좋습니다. 손발이 붉어지면서 심부의 열이 그쪽으로 빠져나가고 있습니다.";
  }
  return `${latencyText()} 만에 잠듭니다. 방 온도를 ${idealRoom}도 쪽으로 내려보면 더 빨라집니다.`;
}

function syncLabels() {
  readouts.roomStart.textContent = `${Number(controls.roomStart.value).toFixed(1)}°C`;
  readouts.acSet.textContent =
    controls.cooling.value === "ac" ? `${Number(controls.acSet.value).toFixed(1)}°C` : "냉방 꺼짐";
  readouts.showerBefore.textContent =
    controls.shower.value === "none"
      ? "—"
      : Number(controls.showerBefore.value) === 0
        ? "눕기 직전"
        : `${controls.showerBefore.value}분 전`;
  readouts.handsOut.textContent = controls.handsOut.checked ? "내놓음" : "이불 속";
  readouts.speed.textContent = `×${Number(controls.speed.value).toFixed(1)}`;
}

// ── 차트 ──────────────────────────────────────────────────

function x(hour) {
  return chart.padding.left + ((hour - night.start) / (night.end - night.start)) * plotWidth;
}

function yCore(value) {
  const t = (value - coreScale.min) / (coreScale.max - coreScale.min);
  return panelTop.core + (1 - t) * chart.panels.core;
}

function ySkin(value) {
  const t = (value - skinScale.min) / (skinScale.max - skinScale.min);
  return panelTop.skin + (1 - t) * chart.panels.skin;
}

// 1분 간격 샘플을 그대로 다 그리면 path가 360점이 된다. 3분마다면 눈에 똑같고 훨씬 가볍다.
function linePath(samples, pick, yFor) {
  const commands = [];
  for (let i = 0; i < samples.length; i += 3) {
    const sample = samples[i];
    commands.push(`${commands.length === 0 ? "M" : "L"} ${x(sample.hour).toFixed(2)} ${yFor(pick(sample)).toFixed(2)}`);
  }
  const last = samples[samples.length - 1];
  commands.push(`L ${x(last.hour).toFixed(2)} ${yFor(pick(last)).toFixed(2)}`);
  return commands.join(" ");
}

// 재생선은 매 프레임 움직이므로 차트를 다시 그리지 않고 이 노드들만 건드린다.
const head = {
  line: create("line", { class: "temp-playhead" }),
  coreDot: create("circle", { class: "temp-dot is-core", r: 4.5 }),
  roomDot: create("circle", { class: "temp-dot is-room", r: 3.5 }),
  distalDot: create("circle", { class: "temp-dot is-distal", r: 4 }),
  label: create("text", { class: "temp-playhead-label" }),
};

function renderChart() {
  syncChartSize();
  svg.setAttribute("viewBox", `0 0 ${chart.width} ${chart.height}`);

  const bottom = panelTop.skin + chart.panels.skin;
  const parts = [];

  // 취침 전 구간과 잠든 구간
  parts.push(
    create("rect", {
      class: "temp-prebed",
      x: x(night.start),
      y: chart.padding.top,
      width: x(night.bedtime) - x(night.start),
      height: bottom - chart.padding.top,
    }),
  );
  if (result.onsetHour !== null) {
    parts.push(
      create("rect", {
        class: "temp-asleep",
        x: x(result.onsetHour),
        y: panelTop.core,
        width: x(night.end) - x(result.onsetHour),
        height: chart.panels.core,
      }),
    );
  }

  // 시각 눈금
  for (let hour = night.start; hour <= night.end; hour += 1) {
    [
      [panelTop.core, chart.panels.core],
      [panelTop.skin, chart.panels.skin],
    ].forEach(([top, panelHeight]) => {
      parts.push(create("line", { class: "temp-grid", x1: x(hour), y1: top, x2: x(hour), y2: top + panelHeight }));
    });
    parts.push(create("text", { class: "temp-axis-tick", x: x(hour), y: bottom + 20 }, hourTick(hour)));
  }

  // ── 위 패널: 심부 온도 ──
  [36, 36.5, 37].forEach((value) => {
    parts.push(
      create("line", { class: "temp-grid", x1: chart.padding.left, y1: yCore(value), x2: chart.width - chart.padding.right, y2: yCore(value) }),
    );
    parts.push(create("text", { class: "temp-row-label", x: chart.padding.left - 8, y: yCore(value) + 4 }, value.toFixed(1)));
  });

  parts.push(create("text", { class: "temp-panel-title", x: chart.padding.left, y: panelTop.core - 8 }, "심부 온도 (°C)"));

  // 밤 전체의 목표(−1도)와 잠드는 문턱은 다른 선이다. 둘 다 그려야 오해가 없다.
  const goalY = yCore(startCore - nightGoal);
  parts.push(create("line", { class: "temp-goal-line", x1: chart.padding.left, y1: goalY, x2: chart.width - chart.padding.right, y2: goalY }));
  parts.push(create("text", { class: "temp-goal-label", x: chart.padding.left + 4, y: goalY - 6 }, "−1.0도 (밤 전체의 낙폭)"));

  const gateY = yCore(startCore - onsetDrop);
  parts.push(create("line", { class: "temp-gate-line", x1: x(night.bedtime), y1: gateY, x2: chart.width - chart.padding.right, y2: gateY }));
  parts.push(
    create("text", { class: "temp-gate-label", x: chart.width - chart.padding.right - 4, y: gateY - 6 }, `잠드는 문턱 −${onsetDrop}도`),
  );

  parts.push(create("path", { class: "temp-ideal-line", d: linePath(idealRun.samples, (s) => s.core, yCore) }));
  parts.push(create("path", { class: "temp-core-line", d: linePath(result.samples, (s) => s.core, yCore) }));

  // 취침 시각
  parts.push(create("line", { class: "temp-bedtime-line", x1: x(night.bedtime), y1: panelTop.core, x2: x(night.bedtime), y2: bottom }));
  parts.push(create("text", { class: "temp-bedtime-label", x: x(night.bedtime) - 6, y: panelTop.core + 14 }, "취침 23시"));

  // 씻은 시각
  const settings = settingsFromControls();
  const washed = showerHour(settings);
  if (settings.shower !== "none" && washed >= night.start) {
    parts.push(create("line", { class: "temp-shower-line", x1: x(washed), y1: panelTop.core, x2: x(washed), y2: panelTop.core + chart.panels.core }));
    parts.push(create("text", { class: "temp-shower-label", x: x(washed) + 5, y: panelTop.core + 30 }, showers[settings.shower].label));
  }

  if (result.onsetHour !== null) {
    const onset = sampleAt(result.onsetHour - night.start);
    parts.push(create("circle", { class: "temp-onset-dot", cx: x(result.onsetHour), cy: yCore(onset.core), r: 5 }));
    parts.push(
      create("text", { class: "temp-onset-label", x: x(result.onsetHour) + 9, y: yCore(onset.core) + 4 }, `${clockLabel(result.onsetHour)} 잠듦`),
    );
  }

  result.wakeHours.forEach((hour) => {
    parts.push(create("path", { class: "temp-wake-mark", d: `M ${x(hour) - 5} ${panelTop.core + 12} L ${x(hour) + 5} ${panelTop.core + 12} L ${x(hour)} ${panelTop.core + 2} Z` }));
  });

  // ── 아래 패널: 피부와 방 ──
  [15, 20, 25, 30, 35].forEach((value) => {
    parts.push(
      create("line", { class: "temp-grid", x1: chart.padding.left, y1: ySkin(value), x2: chart.width - chart.padding.right, y2: ySkin(value) }),
    );
    parts.push(create("text", { class: "temp-row-label", x: chart.padding.left - 8, y: ySkin(value) + 4 }, String(value)));
  });

  parts.push(create("text", { class: "temp-panel-title", x: chart.padding.left, y: panelTop.skin - 8 }, "피부와 방 온도 (°C)"));

  const idealY = ySkin(idealRoom);
  parts.push(create("line", { class: "temp-ideal-room", x1: chart.padding.left, y1: idealY, x2: chart.width - chart.padding.right, y2: idealY }));
  parts.push(create("text", { class: "temp-ideal-room-label", x: chart.padding.left + 4, y: idealY - 5 }, `이상적인 침실 ${idealRoom}도`));

  parts.push(create("path", { class: "temp-room-line", d: linePath(result.samples, (s) => s.room, ySkin) }));
  parts.push(create("path", { class: "temp-prox-line", d: linePath(result.samples, (s) => s.prox, ySkin) }));
  parts.push(create("path", { class: "temp-distal-line", d: linePath(result.samples, (s) => s.distal, ySkin) }));

  // 세 곡선의 이름표를 오른쪽 끝에 몰면 서로 겹친다. 각자 다른 시각의 곡선 위에 얹는다.
  [
    ["is-distal", "손발 피부", 26.7, (s) => s.distal, 18],
    ["is-prox", "몸통 피부", 24.7, (s) => s.prox, -10],
    ["is-room", "방 온도", 27.3, (s) => s.room, -10],
  ].forEach(([kind, text, hour, pick, dy]) => {
    const sample = sampleAt(hour - night.start);
    parts.push(create("text", { class: `temp-curve-label ${kind}`, x: x(hour), y: ySkin(pick(sample)) + dy }, text));
  });

  svg.replaceChildren(...parts, head.line, head.coreDot, head.roomDot, head.distalDot, head.label);
  updatePlayhead();
}

function updatePlayhead() {
  const sample = sampleAt(playTime);
  const px = x(sample.hour);
  const bottom = panelTop.skin + chart.panels.skin;

  head.line.setAttribute("x1", px);
  head.line.setAttribute("y1", chart.padding.top);
  head.line.setAttribute("x2", px);
  head.line.setAttribute("y2", bottom);

  head.coreDot.setAttribute("cx", px);
  head.coreDot.setAttribute("cy", yCore(sample.core));
  head.roomDot.setAttribute("cx", px);
  head.roomDot.setAttribute("cy", ySkin(sample.room));
  head.distalDot.setAttribute("cx", px);
  head.distalDot.setAttribute("cy", ySkin(sample.distal));

  // 오른쪽 끝에서는 라벨이 잘리므로 선 왼쪽으로 넘긴다.
  const nearEnd = px > chart.width - chart.padding.right - 60;
  head.label.setAttribute("x", nearEnd ? px - 7 : px + 7);
  head.label.setAttribute("y", chart.padding.top + 12);
  head.label.setAttribute("text-anchor", nearEnd ? "end" : "start");
  head.label.textContent = clockLabel(sample.hour);

  renderScene(sample);
  renderPanel(sample);
}

// ── 재생 ──────────────────────────────────────────────────

const totalHours = night.end - night.start;
// 재생 속도 1일 때 밤 6시간을 약 40초에 지나간다.
const baseSpeed = 0.15;

function setPlaying(next) {
  playing = next;
  controls.playToggle.textContent = playing ? "일시정지" : "재생";
  if (playing) lastFrame = null;
}

function frame(timestamp) {
  if (lastFrame === null) lastFrame = timestamp;
  // 탭을 벗어났다 돌아왔을 때 한 번에 건너뛰지 않도록 클램프한다.
  const dt = clamp((timestamp - lastFrame) / 1000, 0, 0.05);
  lastFrame = timestamp;

  if (playing) {
    playTime += dt * Number(controls.speed.value) * totalHours * baseSpeed;
    if (playTime >= totalHours) {
      playTime = totalHours;
      setPlaying(false);
    }
    updatePlayhead();
  }
  requestAnimationFrame(frame);
}

// ── 갱신 ──────────────────────────────────────────────────

function rebuild() {
  result = simulate(settingsFromControls());
  syncLabels();
  renderChart();
}

[
  controls.season,
  controls.roomStart,
  controls.cooling,
  controls.acSet,
  controls.outfit,
  controls.bedding,
  controls.shower,
  controls.showerBefore,
  controls.handsOut,
].forEach((input) => input.addEventListener("input", rebuild));

// 계절을 바꾸면 그 계절의 흔한 방 온도로 슬라이더를 옮긴다.
// 안 그러면 "한겨울인데 방이 28도"처럼 앞뒤가 안 맞는 화면에서 시작하게 된다.
controls.season.addEventListener("change", () => {
  controls.roomStart.value = String(seasons[controls.season.value].defaultRoom);
  rebuild();
});

controls.speed.addEventListener("input", syncLabels);

controls.playToggle.addEventListener("click", () => {
  if (playTime >= totalHours) playTime = 0;
  setPlaying(!playing);
});

controls.restart.addEventListener("click", () => {
  playTime = 0;
  updatePlayhead();
  setPlaying(true);
});

controls.reset.addEventListener("click", () => {
  controls.season.value = defaults.season;
  controls.roomStart.value = String(defaults.roomStart);
  controls.cooling.value = defaults.cooling;
  controls.acSet.value = String(defaults.acSet);
  controls.outfit.value = defaults.outfit;
  controls.bedding.value = defaults.bedding;
  controls.shower.value = defaults.shower;
  controls.showerBefore.value = String(defaults.showerBefore);
  controls.handsOut.checked = defaults.handsOut;
  controls.speed.value = "1";
  playTime = 0;
  setPlaying(false);
  rebuild();
});

// 그래프 위를 끌면 그 시각으로 이동한다.
function seekFrom(event) {
  const box = svg.getBoundingClientRect();
  const ratio = (event.clientX - box.left) / box.width;
  const hour = ((ratio * chart.width - chart.padding.left) / plotWidth) * totalHours;
  playTime = clamp(hour, 0, totalHours);
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

// 이불을 누르면 손발을 넣고 뺀다. 책이 말하는 "손발을 삐죽 내미는" 동작이 이것이다.
const blanketHotspot = document.querySelector("#blanketHotspot");

function toggleHands() {
  controls.handsOut.checked = !controls.handsOut.checked;
  blanketHotspot.setAttribute("aria-pressed", String(controls.handsOut.checked));
  rebuild();
}

blanketHotspot.addEventListener("click", toggleHands);
// SVG의 <g>는 버튼이 아니라서 스페이스·엔터가 저절로 먹지 않는다.
blanketHotspot.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggleHands();
});

// 차트 크기가 바뀌는 순간에만 다시 그린다. 리사이즈마다 그리면 헛일이다.
let wasNarrow = isNarrow();
window.addEventListener("resize", () => {
  if (isNarrow() === wasNarrow) return;
  wasNarrow = isNarrow();
  renderChart();
});

rebuild();
requestAnimationFrame(frame);
