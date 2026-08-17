const canvas = document.querySelector("#driveCanvas");
const ctx = canvas.getContext("2d");
const frame = document.querySelector("#driveFrame");
const lidTop = document.querySelector(".eyelid-top");
const lidBottom = document.querySelector(".eyelid-bottom");

const controls = {
  sleepHours: document.querySelector("#sleepHours"),
  speed: document.querySelector("#speed"),
  steerLeft: document.querySelector("#steerLeft"),
  steerRight: document.querySelector("#steerRight"),
};

const readouts = {
  sleepHours: document.querySelector("#sleepHoursValue"),
  speed: document.querySelector("#speedValue"),
  speedHint: document.querySelector("#speedHint"),
  hudSpeed: document.querySelector("#hudSpeed"),
  distanceNote: document.querySelector("#distanceNote"),
  probability: document.querySelector("#probValue"),
  probabilityHint: document.querySelector("#probHint"),
  closeSeconds: document.querySelector("#closeValue"),
  closeHint: document.querySelector("#closeHint"),
  applyHint: document.querySelector("#applyHint"),
  time: document.querySelector("#hudTime"),
  closures: document.querySelector("#hudClosures"),
  blind: document.querySelector("#hudBlind"),
  laneMarker: document.querySelector("#laneMarker"),
  laneLabel: document.querySelector("#laneLabel"),
};

const overlay = {
  root: document.querySelector("#driveOverlay"),
  eyebrow: document.querySelector("#overlayEyebrow"),
  title: document.querySelector("#overlayTitle"),
  body: document.querySelector("#overlayBody"),
  stats: document.querySelector("#overlayStats"),
  time: document.querySelector("#statTime"),
  closures: document.querySelector("#statClosures"),
  blind: document.querySelector("#statBlind"),
  reason: document.querySelector("#statReason"),
  button: document.querySelector("#overlayButton"),
};


// 위험도는 로그 곡선 하나로만 정한다.
//   severity(h) = ln(safe / h) / ln(safe / peak)
// peak(2시간)에서 정확히 1, safe(8시간)에서 정확히 0이 되고 그 위로는 계속 0이다.
// 확률과 눈 감겨 있는 시간 둘 다 이 값 하나에서 나온다.
const risk = {
  peakHours: 2,
  safeHours: 8,
  minCloseSeconds: 1.5,
  maxCloseSeconds: 10,
};

const hoursRange = { min: 2, max: 10 };

// 책 그림 12 "수면 부족과 자동차 사고 확률". 위에서 아래로 그림과 같은 순서.
// 출처 데이터: AAA Foundation for Traffic Safety, Tefft (2016).
const crashRiskData = [
  { label: "<4Hr", ratio: 11.5, min: 0, max: 4 },
  { label: "4-5Hr", ratio: 4.3, min: 4, max: 5 },
  { label: "5-6Hr", ratio: 1.9, min: 5, max: 6 },
  { label: "6-7Hr", ratio: 1.3, min: 6, max: 7 },
  { label: "7Hr+", ratio: 1.0, min: 7, max: 24 },
];

const checkInterval = 4; // 초마다 한 번씩 졸음 판정
const reopenGrace = 2.5; // 눈을 뜬 직후 유예 시간
const lidCloseTime = 0.35;
const lidOpenTime = 0.3;
// 도로 굴곡은 거리의 함수라, 속도를 올리면 같은 시간에 더 많이 휜다.
// 굴곡용 거리를 실제 거리와 분리해 항상 이 기준속도로 흐르게 하면
// 속도를 바꿔도 "초당 휘는 정도"가 그대로라 난이도가 흔들리지 않는다.
const speedRef = 100 / 3.6;

const road = {
  laneHalf: 0.9, // 한 차선의 반폭
  lanesPerSide: 2,
  unitRatio: 0.13, // 화면 아래쪽에서 월드 1단위가 차지하는 가로 비율
  horizonRatio: 0.42,
  lookScale: 26,
  lookLimit: 420,
  drawLimit: 380, // 노면 밖 오브젝트를 그리는 최대 거리
  driverOffset: 0.22, // 운전석이 차체 중앙보다 왼쪽에 있는 만큼 시점도 왼쪽으로
};

// 중앙선에서 갓길까지의 반폭
road.halfWidth = road.laneHalf * 2 * road.lanesPerSide;
// 내 주행 차선(가장 바깥 차선) 중앙
road.homeLane = road.halfWidth - road.laneHalf;

const oncoming = {
  speed: 100 / 3.6, // 반대편 차량 속도
  // 간격을 두 갈래로 뽑아 붙어 오다가 한참 비는 실제 도로처럼 만든다.
  closeGap: [90, 260],
  openGap: [420, 950],
  clusterChance: 0.62,
  spawnAhead: 460,
  halfWidth: 0.45,
  halfLength: 5.5, // 차 길이 + 내 차 앞범퍼. 정면충돌 판정 구간
};

const scenery = {
  fenceSpacing: 6,
  fenceHeight: 1.05,
  fenceRun: 7, // 이 개수만큼을 한 덩어리로 묶어 있고 없고를 정한다
  fenceDensity: 0.55,
};

const steerRate = 3.2; // 핸들이 최대 조향까지 가는 속도
const maxLateral = 0.62; // 최대 조향에서의 초당 횡방향 이동

const view = { width: 960, height: 540 };
const keys = { left: false, right: false };

const drive = {
  status: "idle", // idle | driving | crashed
  settings: null,
  speed: 130 / 3.6,
  curveDistance: 0, // 굴곡 전용 거리. 항상 기준속도로 흐른다
  travelled: 0,
  carX: 0,
  steer: 0,
  elapsed: 0,
  nextCheckIn: checkInterval,
  eye: "open", // open | closing | shut | opening
  lid: 0, // 0 완전히 뜬 상태, 1 완전히 감긴 상태
  shutRemaining: 0,
  closures: 0,
  blindTime: 0,
  blindDistance: 0,
  shake: 0,
  crashReason: "",
  traffic: [],
};

function severity(hours) {
  if (hours >= risk.safeHours) return 0;
  return clamp(Math.log(risk.safeHours / hours) / Math.log(risk.safeHours / risk.peakHours), 0, 1);
}

function riskFor(hours) {
  const level = severity(hours);
  return {
    hours,
    probability: level,
    closeSeconds: risk.minCloseSeconds + (risk.maxCloseSeconds - risk.minCloseSeconds) * level,
  };
}

function meanTimeToClosure(probability) {
  if (probability <= 0) return Infinity;
  return checkInterval / probability;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.width = rect.width;
  view.height = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// 도로가 좌우로 흔들리는 폭. 클수록 계속 조향해야 하고, 눈이 감겼을 때
// 물려 있던 조향각도 커져서 사고가 늘어난다. 난이도를 정하는 핵심 값.
const curveAmplitude = 0.5;

function roadCenterAt(d) {
  return (
    curveAmplitude *
    (1.24 * Math.sin(d * 0.0135) + 0.6 * Math.sin(d * 0.0069 + 1.7) + 0.2 * Math.sin(d * 0.031 + 0.6))
  );
}

// 실제 거리(내 앞 몇 m)를 굴곡용 거리로 바꾼다. 현재 위치는 항상 연속이라
// 주행 중 속도를 바꿔도 도로가 옆으로 튀지 않는다.
function roadCenterAhead(distanceAhead) {
  return roadCenterAt(drive.curveDistance + distanceAhead * (speedRef / drive.speed));
}

// 월드 좌표에 고정된 의사난수. 매 프레임 같은 값이 나와야 깜박이지 않는다.
function noiseAt(index) {
  const value = Math.sin(index * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

// 중앙선 기준 위치. 0이 중앙선, +가 내 방향 차선, -가 반대편 차선.
function laneOffset() {
  return drive.carX - roadCenterAhead(0);
}

// 내 주행 차선 중앙 기준 이탈. 0이 차선 중앙, -1이 옆 차선 경계, +1이 갓길.
function laneDeviation() {
  return (laneOffset() - road.homeLane) / road.laneHalf;
}

// 운전석은 차체 중앙보다 왼쪽에 있으므로 시점도 그만큼 왼쪽에 둔다.
function cameraX() {
  return drive.carX - road.driverOffset;
}

// 월드 거리 -> 원근 계수 p (1이 화면 맨 아래, 0이 지평선)
function perspectiveAt(distance) {
  return road.lookScale / (distance - drive.travelled + road.lookScale);
}

function oncomingLateral(car) {
  return roadCenterAhead(car.distance - drive.travelled) - car.lane + car.jitter;
}

function spawnTraffic() {
  const furthest = drive.traffic.reduce((max, car) => Math.max(max, car.distance), drive.travelled);
  if (furthest > drive.travelled + oncoming.spawnAhead) return;

  const [low, high] = Math.random() < oncoming.clusterChance ? oncoming.closeGap : oncoming.openGap;
  const gap = low + Math.random() * (high - low);
  // 반대편도 2차선이므로 어느 쪽 차선으로 올지 고른다.
  const laneIndex = Math.floor(Math.random() * road.lanesPerSide);
  drive.traffic.push({
    distance: Math.max(furthest, drive.travelled + 150) + gap,
    lane: road.laneHalf * (2 * laneIndex + 1),
    jitter: (Math.random() - 0.5) * 0.24,
    hue: Math.random() < 0.5 ? "#5c6470" : "#6d5a52",
  });
}

function updateTraffic(dt) {
  drive.traffic.forEach((car) => {
    car.distance -= oncoming.speed * dt;
  });
  drive.traffic = drive.traffic.filter((car) => car.distance - drive.travelled > -30);
  spawnTraffic();

  if (drive.status !== "driving") return;

  const hit = drive.traffic.find(
    (car) =>
      Math.abs(car.distance - drive.travelled) < oncoming.halfLength &&
      Math.abs(oncomingLateral(car) - drive.carX) < oncoming.halfWidth * 2,
  );
  if (hit !== undefined) {
    crash(drive.eye === "open" ? "중앙선을 넘어 정면충돌했습니다" : "눈이 감긴 사이 중앙선을 넘어 정면충돌했습니다");
  }
}

function updateReadouts() {
  const hours = Number(controls.sleepHours.value);
  const risk = riskFor(hours);
  const gap = meanTimeToClosure(risk.probability);

  // 속도는 주행 중에도 바로 반영된다. 굴곡용 거리를 따로 두어 도로가 튀지 않는다.
  const speedKmh = Number(controls.speed.value);
  drive.speed = speedKmh / 3.6;
  readouts.speed.textContent = `${speedKmh} km/h`;
  readouts.speedHint.textContent = `초당 ${drive.speed.toFixed(1)}m. 주행 중에도 바꿀 수 있습니다.`;
  readouts.hudSpeed.textContent = `${speedKmh} km/h`;
  readouts.distanceNote.textContent =
    `시속 ${speedKmh}km는 초당 약 ${drive.speed.toFixed(1)}m입니다. ` +
    `눈이 4초 감기면 ${Math.round(drive.speed * 4)}m를 아무도 운전하지 않는 상태로 달립니다.`;

  const safe = risk.probability <= 0;

  readouts.sleepHours.textContent = formatHours(hours);
  readouts.probability.textContent = safe ? "0%" : `${(risk.probability * 100).toFixed(1)}%`;
  readouts.probabilityHint.textContent = safe
    ? "충분히 잤습니다. 눈이 저절로 감기지 않습니다."
    : `${checkInterval}초마다 판정, 평균 ${Math.round(gap)}초에 한 번`;
  readouts.closeSeconds.textContent = safe ? "없음" : `${risk.closeSeconds.toFixed(1)}초`;
  readouts.closeHint.textContent = safe
    ? "미세수면이 발생하지 않는 구간입니다."
    : `그 사이 약 ${Math.round(risk.closeSeconds * drive.speed)}m를 무의식으로 주행`;

  // 주행 중에는 출발 버튼이 화면 뒤로 숨으므로, 수면시간 변경은 다음 출발부터 적용된다.
  const pending = drive.settings !== null && drive.settings.hours !== hours;
  readouts.applyHint.textContent =
    drive.status === "driving"
      ? "주행 중입니다. 수면시간은 다음 출발부터 적용됩니다. (속도는 지금 바로 반영)"
      : pending
        ? "설정이 바뀌었습니다. 출발을 누르면 새 수면시간으로 시작합니다."
        : "슬라이더를 옮기거나 그래프를 드래그한 뒤 출발을 누르세요.";

  drawRiskCurve(hours);
  highlightCrashRisk(hours);
}

function updateHud() {
  readouts.time.textContent = `${drive.elapsed.toFixed(1)}초`;
  readouts.closures.textContent = `${drive.closures}회`;
  readouts.blind.textContent = `${Math.round(drive.blindDistance)} m`;

  const deviation = laneDeviation();
  readouts.laneMarker.style.left = `${((clamp(deviation, -1, 1) + 1) / 2) * 100}%`;

  const magnitude = Math.abs(deviation);
  let label = "차선에서 벗어남";
  let level = "warn";

  if (laneOffset() <= 0) {
    label = "중앙선 침범";
    level = "danger";
  } else if (deviation > 0.75) {
    label = "갓길 이탈 직전";
    level = "danger";
  } else if (magnitude < 0.35) {
    label = "차선 중앙";
    level = "ok";
  } else if (deviation < -0.35) {
    label = "옆 차선으로 벗어남";
  }

  readouts.laneLabel.textContent = label;
  readouts.laneLabel.dataset.level = level;
}

function showOverlay({ eyebrow, title, body, stats = false, button }) {
  overlay.eyebrow.textContent = eyebrow;
  overlay.title.textContent = title;
  overlay.body.textContent = body;
  overlay.stats.hidden = !stats;
  overlay.button.textContent = button;
  overlay.root.hidden = false;
}

function hideOverlay() {
  overlay.root.hidden = true;
}

function startDrive() {
  const hours = Number(controls.sleepHours.value);
  drive.settings = riskFor(hours);
  drive.status = "driving";
  drive.travelled = 0;
  drive.curveDistance = 0;
  drive.carX = roadCenterAt(0) + road.homeLane; // 바깥 주행 차선 중앙에서 출발
  drive.steer = 0;
  drive.traffic = [];
  drive.blindDistance = 0;
  drive.elapsed = 0;
  drive.nextCheckIn = checkInterval;
  drive.eye = "open";
  drive.lid = 0;
  drive.shutRemaining = 0;
  drive.closures = 0;
  drive.blindTime = 0;
  drive.shake = 0;
  drive.crashReason = "";
  keys.left = false;
  keys.right = false;

  hideOverlay();
  updateReadouts();
  updateHud();
  frame.focus();
}

function crash(reason) {
  drive.status = "crashed";
  drive.crashReason = reason;
  drive.eye = "opening"; // 사고 판정이 나면 눈은 자동으로 떠진다
  drive.shutRemaining = 0;
  drive.shake = 1;

  overlay.time.textContent = `${drive.elapsed.toFixed(1)}초`;
  overlay.closures.textContent = `${drive.closures}회`;
  overlay.blind.textContent = `${Math.round(drive.blindDistance)} m (${drive.blindTime.toFixed(1)}초)`;
  overlay.reason.textContent = reason;

  const hours = drive.settings === null ? Number(controls.sleepHours.value) : drive.settings.hours;
  showOverlay({
    eyebrow: "사고",
    title: `${formatHours(hours)} 수면으로 ${drive.elapsed.toFixed(1)}초 주행`,
    body:
      drive.closures === 0
        ? "이번에는 눈이 감기기 전에 조향에서 먼저 벗어났습니다."
        : "눈이 감긴 동안 차는 멈추지 않았습니다. 그 거리만큼 아무도 운전하지 않았습니다.",
    stats: true,
    button: "다시 출발",
  });
  updateReadouts(); // "주행 중" 안내를 출발 안내로 되돌린다
}

function triggerClosure() {
  drive.eye = "closing";
  drive.closures += 1;
  drive.shutRemaining = drive.settings.closeSeconds * (1 + Math.random() * 0.35);
}

function updateEye(dt) {
  if (drive.eye === "open") {
    if (drive.status !== "driving") return;
    drive.nextCheckIn -= dt;
    if (drive.nextCheckIn > 0) return;

    drive.nextCheckIn = checkInterval;
    if (Math.random() < drive.settings.probability) triggerClosure();
    return;
  }

  drive.blindTime += dt;
  if (drive.status === "driving") drive.blindDistance += drive.speed * dt;

  if (drive.eye === "closing") {
    drive.lid = Math.min(1, drive.lid + dt / lidCloseTime);
    if (drive.lid >= 1) drive.eye = "shut";
    return;
  }

  if (drive.eye === "shut") {
    drive.shutRemaining -= dt;
    if (drive.shutRemaining <= 0) drive.eye = "opening";
    return;
  }

  drive.lid = Math.max(0, drive.lid - dt / lidOpenTime);
  if (drive.lid <= 0) {
    drive.eye = "open";
    drive.nextCheckIn = reopenGrace;
  }
}

function updateDrive(dt) {
  updateEye(dt);

  if (drive.status !== "driving") {
    updateTraffic(dt);
    drive.shake = Math.max(0, drive.shake - dt * 2);
    return;
  }

  // 눈이 감기면 새 입력은 받지 않지만, 감기기 직전에 넣고 있던 조향은 그대로 유지된다.
  // 오른쪽을 누른 채로 잠들면 계속 오른쪽으로 간다.
  if (drive.eye === "open") {
    const target = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    const step = steerRate * dt;
    drive.steer += clamp(target - drive.steer, -step, step);
  }

  drive.travelled += drive.speed * dt;
  drive.curveDistance += speedRef * dt;
  drive.carX += drive.steer * maxLateral * dt;

  updateTraffic(dt);
  if (drive.status !== "driving") return;

  const offset = laneOffset();
  const deviation = Math.abs(laneDeviation());
  drive.shake = deviation > 0.8 ? Math.min(1, drive.shake + dt * 3) : Math.max(0, drive.shake - dt * 3);

  if (offset > road.halfWidth) {
    crash(drive.eye === "open" ? "갓길 쪽으로 도로를 벗어났습니다" : "눈이 감긴 동안 도로를 벗어났습니다");
  } else if (offset < -road.halfWidth) {
    crash(drive.eye === "open" ? "반대편 갓길로 도로를 벗어났습니다" : "눈이 감긴 동안 반대편으로 도로를 벗어났습니다");
  }

  drive.elapsed += dt;
}

function renderRoad() {
  const width = view.width;
  const height = view.height;
  const horizonY = height * road.horizonRatio;
  const unitPx = width * road.unitRatio;
  const depth = height - horizonY;

  ctx.save();
  if (drive.shake > 0) {
    const amount = drive.shake * 4;
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }

  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, "#1b2a44");
  sky.addColorStop(0.6, "#3d4f6d");
  sky.addColorStop(1, "#7c7186");
  ctx.fillStyle = sky;
  ctx.fillRect(-10, -10, width + 20, horizonY + 10);

  ctx.fillStyle = "#1f2a22";
  ctx.fillRect(-10, horizonY, width + 20, depth + 10);

  const hillCenter = width / 2 - roadCenterAhead(road.lookLimit) * unitPx * 0.06;
  ctx.fillStyle = "#2a3348";
  ctx.beginPath();
  ctx.moveTo(-10, horizonY);
  ctx.lineTo(hillCenter - width * 0.34, horizonY - height * 0.075);
  ctx.lineTo(hillCenter - width * 0.12, horizonY - height * 0.02);
  ctx.lineTo(hillCenter + width * 0.16, horizonY - height * 0.09);
  ctx.lineTo(hillCenter + width * 0.38, horizonY - height * 0.01);
  ctx.lineTo(width + 10, horizonY);
  ctx.closePath();
  ctx.fill();

  const camera = cameraX();
  const step = 3;
  const segments = [];
  for (let y = horizonY + 1; y <= height; y += step) {
    const p = (y - horizonY) / depth;
    const ahead = Math.min(road.lookLimit, road.lookScale * (1 / p - 1));
    segments.push({
      y,
      p,
      distance: drive.travelled + ahead,
      center: width / 2 + (roadCenterAhead(ahead) - camera) * unitPx * p,
      half: road.halfWidth * unitPx * p,
      unit: unitPx * p,
    });
  }

  // 갓길과 잔디 (거리에 따라 색이 바뀌어 속도감을 준다)
  segments.forEach((segment) => {
    const band = Math.floor(segment.distance / 9) % 2 === 0;
    ctx.fillStyle = band ? "#26332a" : "#212c25";
    ctx.fillRect(-10, segment.y, width + 20, step + 1);
  });

  ctx.beginPath();
  segments.forEach((segment, index) => {
    const x = segment.center - segment.half;
    if (index === 0) ctx.moveTo(x, segment.y);
    else ctx.lineTo(x, segment.y);
  });
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    ctx.lineTo(segment.center + segment.half, segment.y);
  }
  ctx.closePath();
  ctx.fillStyle = "#3a3d42";
  ctx.fill();

  segments.forEach((segment) => {
    const band = Math.floor(segment.distance / 9) % 2 === 0;
    const rumble = Math.max(1.2, segment.half * 0.09);
    ctx.fillStyle = band ? "#c8543f" : "#e8e2d6";
    ctx.fillRect(segment.center - segment.half - rumble, segment.y, rumble, step + 1);
    ctx.fillRect(segment.center + segment.half, segment.y, rumble, step + 1);

    const line = Math.max(1, segment.unit * 0.05);
    ctx.fillStyle = "#eae5da";
    ctx.fillRect(segment.center - segment.half + line * 0.6, segment.y, line, step + 1);
    ctx.fillRect(segment.center + segment.half - line * 1.6, segment.y, line, step + 1);

    // 같은 방향 차선끼리는 넘어도 되는 흰 점선으로 나눈다.
    if (Math.floor(segment.distance / 14) % 2 === 0) {
      for (let index = 1; index < road.lanesPerSide; index += 1) {
        const shift = road.laneHalf * 2 * index * segment.unit;
        ctx.fillRect(segment.center - shift - line / 2, segment.y, line, step + 1);
        ctx.fillRect(segment.center + shift - line / 2, segment.y, line, step + 1);
      }
    }

    // 중앙선은 넘으면 안 되는 선이므로 끊기지 않는 노란 실선 두 줄로 그린다.
    ctx.fillStyle = "#f0d98a";
    ctx.fillRect(segment.center - line * 1.8, segment.y, line, step + 1);
    ctx.fillRect(segment.center + line * 0.8, segment.y, line, step + 1);
  });

  renderScenery(width, horizonY, depth, unitPx, camera);
  renderTraffic(width, horizonY, depth, unitPx, camera);
  renderCockpit(width, height);
  ctx.restore();
}

function renderScenery(width, horizonY, depth, unitPx, camera) {
  const spacing = scenery.fenceSpacing;
  // 기둥 위치를 월드 격자에 고정한다. 그리기 범위에 맞춰 잡으면 매 프레임 어긋나 깜박인다.
  const firstIndex = Math.ceil((drive.travelled - 12) / spacing);
  const lastIndex = Math.floor((drive.travelled + road.drawLimit) / spacing);

  // 먼 것부터 그려서 가까운 것이 위로 오게 한다. 없는 자리는 null로 남겨 이어짐을 끊는다.
  const posts = [];
  for (let index = lastIndex; index >= firstIndex; index -= 1) {
    if (noiseAt(Math.floor(index / scenery.fenceRun)) > scenery.fenceDensity) {
      posts.push(null);
      continue;
    }

    const distance = index * spacing;
    const p = perspectiveAt(distance);
    if (p > 1.4) {
      posts.push(null);
      continue;
    }

    // 울타리는 내가 달리는 쪽 갓길 바깥에 세운다.
    const lateral = roadCenterAhead(distance - drive.travelled) + road.halfWidth + 0.6;
    posts.push({
      x: width / 2 + (lateral - camera) * unitPx * p,
      y: horizonY + p * depth,
      unit: unitPx * p,
    });
  }

  ctx.strokeStyle = "#6d6455";
  for (let index = 0; index < posts.length - 1; index += 1) {
    const a = posts[index];
    const b = posts[index + 1];
    if (a === null || b === null) continue;

    [0.42, 0.86].forEach((level) => {
      ctx.lineWidth = Math.max(1, ((a.unit + b.unit) / 2) * 0.06);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - scenery.fenceHeight * level * a.unit);
      ctx.lineTo(b.x, b.y - scenery.fenceHeight * level * b.unit);
      ctx.stroke();
    });
  }

  ctx.fillStyle = "#5c5446";
  posts.forEach((post) => {
    if (post === null) return;
    const postWidth = Math.max(1, post.unit * 0.09);
    ctx.fillRect(post.x - postWidth / 2, post.y - scenery.fenceHeight * post.unit, postWidth, scenery.fenceHeight * post.unit);
  });
}

function renderTraffic(width, horizonY, depth, unitPx, camera) {
  const visible = drive.traffic
    .map((car) => ({ car, p: perspectiveAt(car.distance) }))
    .filter((entry) => entry.p > 0.02 && entry.p < 1.9)
    .sort((a, b) => a.p - b.p); // 먼 차부터 그린다

  visible.forEach(({ car, p }) => {
    const unit = unitPx * p;
    const x = width / 2 + (oncomingLateral(car) - camera) * unit;
    const groundY = horizonY + p * depth;
    const bodyWidth = oncoming.halfWidth * 2 * unit;
    const bodyHeight = 0.78 * unit;
    const roofWidth = bodyWidth * 0.72;
    const roofHeight = bodyHeight * 0.62;

    ctx.fillStyle = "rgb(0 0 0 / 0.32)";
    ctx.beginPath();
    ctx.ellipse(x, groundY, bodyWidth * 0.6, bodyHeight * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2c313a";
    ctx.fillRect(x - roofWidth / 2, groundY - bodyHeight - roofHeight, roofWidth, roofHeight);
    ctx.fillStyle = car.hue;
    ctx.fillRect(x - bodyWidth / 2, groundY - bodyHeight, bodyWidth, bodyHeight);

    ctx.fillStyle = "#1a1e26";
    ctx.fillRect(x - roofWidth * 0.42, groundY - bodyHeight - roofHeight * 0.78, roofWidth * 0.84, roofHeight * 0.6);

    const lampR = Math.max(1, bodyWidth * 0.1);
    const lampY = groundY - bodyHeight * 0.42;
    const glow = ctx.createRadialGradient(x, lampY, 0, x, lampY, bodyWidth * 0.9);
    glow.addColorStop(0, "rgb(255 246 214 / 0.42)");
    glow.addColorStop(1, "rgb(255 246 214 / 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - bodyWidth, lampY - bodyWidth, bodyWidth * 2, bodyWidth * 2);

    ctx.fillStyle = "#fff6d6";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(x + side * bodyWidth * 0.34, lampY, lampR, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function renderCockpit(width, height) {
  const hoodTop = height * 0.8;

  ctx.fillStyle = "#12161c";
  ctx.beginPath();
  ctx.moveTo(-10, height + 10);
  ctx.lineTo(-10, hoodTop + height * 0.09);
  ctx.quadraticCurveTo(width * 0.5, hoodTop - height * 0.045, width + 10, hoodTop + height * 0.09);
  ctx.lineTo(width + 10, height + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1b212a";
  ctx.fillRect(-10, height - height * 0.06, width + 20, height * 0.06 + 10);

  // 좌핸들 차량이므로 운전대는 화면 중앙보다 왼쪽에 있다.
  const wheelX = width * 0.34;
  const wheelY = height * 0.995;
  const wheelR = Math.min(width * 0.2, height * 0.24);

  ctx.save();
  ctx.translate(wheelX, wheelY);
  ctx.rotate(drive.steer * 0.6);
  ctx.strokeStyle = "#2b3340";
  ctx.lineWidth = Math.max(6, wheelR * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, wheelR, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();

  ctx.strokeStyle = "#232a35";
  ctx.lineWidth = Math.max(4, wheelR * 0.08);
  ctx.beginPath();
  ctx.moveTo(-wheelR * 0.86, -wheelR * 0.16);
  ctx.lineTo(-wheelR * 0.2, -wheelR * 0.34);
  ctx.moveTo(wheelR * 0.86, -wheelR * 0.16);
  ctx.lineTo(wheelR * 0.2, -wheelR * 0.34);
  ctx.stroke();
  ctx.restore();
}

function renderIdleHint() {
  if (drive.status === "driving") return;
  ctx.fillStyle = "rgba(9, 12, 18, 0.35)";
  ctx.fillRect(0, 0, view.width, view.height);
}

function renderLids() {
  const closed = drive.lid;
  lidTop.style.transform = `scaleY(${closed.toFixed(4)})`;
  lidBottom.style.transform = `scaleY(${closed.toFixed(4)})`;
  frame.classList.toggle("is-shut", closed > 0.98);
  // 눈이 감긴 동안에는 계기판도 보이지 않는다. 무의식으로 달린 거리만 남긴다.
  frame.classList.toggle("is-blind", drive.eye !== "open");
}

let lastFrame = performance.now();

function loop(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;

  if (drive.status !== "idle") updateDrive(dt);

  renderRoad();
  renderIdleHint();
  renderLids();
  if (drive.status === "driving") updateHud();

  requestAnimationFrame(loop);
}

// 곡선 그래프의 좌표계. 그리기와 드래그가 같은 값을 써야 하므로 밖으로 뺀다.
const curveChart = {
  width: 420,
  height: 240,
  padding: { top: 18, right: 18, bottom: 38, left: 46 },
};
curveChart.plotWidth = curveChart.width - curveChart.padding.left - curveChart.padding.right;
curveChart.plotHeight = curveChart.height - curveChart.padding.top - curveChart.padding.bottom;

function drawRiskCurve(currentHours) {
  const svg = document.querySelector("#riskCurve");
  const { width, height, padding, plotWidth, plotHeight } = curveChart;
  const minHours = hoursRange.min;
  const maxHours = hoursRange.max;

  const xFor = (hours) => padding.left + ((hours - minHours) / (maxHours - minHours)) * plotWidth;
  const yFor = (probability) => padding.top + (1 - probability) * plotHeight;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  [0, 0.25, 0.5, 0.75, 1].forEach((value) => {
    svg.appendChild(
      create("line", {
        class: "grid-line",
        x1: padding.left,
        x2: width - padding.right,
        y1: yFor(value),
        y2: yFor(value),
      }),
    );
    svg.appendChild(
      create(
        "text",
        { class: "chart-text", x: padding.left - 10, y: yFor(value) + 4, "text-anchor": "end" },
        `${value * 100}%`,
      ),
    );
  });

  for (let hours = minHours; hours <= maxHours; hours += 1) {
    svg.appendChild(
      create(
        "text",
        { class: "chart-text", x: xFor(hours), y: height - padding.bottom + 22, "text-anchor": "middle" },
        `${hours}h`,
      ),
    );
  }

  const path = [];
  for (let hours = minHours; hours <= maxHours + 0.001; hours += 0.05) {
    const command = path.length === 0 ? "M" : "L";
    path.push(`${command} ${xFor(hours).toFixed(2)} ${yFor(severity(hours)).toFixed(2)}`);
  }
  svg.appendChild(create("path", { class: "path-pressure", d: path.join(" ") }));

  const probability = severity(currentHours);
  svg.appendChild(
    create("line", {
      class: "now-line",
      x1: xFor(currentHours),
      x2: xFor(currentHours),
      y1: padding.top,
      y2: height - padding.bottom,
    }),
  );
  svg.appendChild(
    create("circle", { class: "current-dot", cx: xFor(currentHours), cy: yFor(probability), r: 6 }),
  );
  svg.appendChild(
    create(
      "text",
      {
        class: "event-label",
        x: clamp(xFor(currentHours) + 10, padding.left, width - padding.right - 60),
        y: clamp(yFor(probability) - 12, padding.top + 12, height - padding.bottom),
      },
      `${(probability * 100).toFixed(1)}%`,
    ),
  );

  svg.appendChild(create("line", { class: "axis-line", x1: padding.left, x2: padding.left, y1: padding.top, y2: height - padding.bottom }));
  svg.appendChild(
    create("line", {
      class: "axis-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: height - padding.bottom,
      y2: height - padding.bottom,
    }),
  );
}

function highlightCrashRisk(currentHours) {
  const svg = document.querySelector("#crashRiskChart");
  const width = 420;
  const height = 240;
  const padding = { top: 14, right: 44, bottom: 42, left: 66 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxRatio = 12;
  const bandHeight = plotHeight / crashRiskData.length;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  [2, 4, 6, 8, 10, 12].forEach((value) => {
    const x = padding.left + (value / maxRatio) * plotWidth;
    svg.appendChild(
      create("line", { class: "grid-line dashed", x1: x, x2: x, y1: padding.top, y2: padding.top + plotHeight }),
    );
    svg.appendChild(
      create(
        "text",
        { class: "chart-text", x, y: padding.top + plotHeight + 20, "text-anchor": "middle" },
        `×${value}`,
      ),
    );
  });

  crashRiskData.forEach((bucket, index) => {
    const barWidth = (bucket.ratio / maxRatio) * plotWidth;
    const y = padding.top + index * bandHeight + bandHeight * 0.22;
    const barHeight = bandHeight * 0.56;
    const active = currentHours >= bucket.min && currentHours < bucket.max;

    svg.appendChild(
      create("rect", {
        class: active ? "risk-bar is-active" : "risk-bar",
        x: padding.left,
        y,
        width: Math.max(1, barWidth),
        height: barHeight,
        rx: 2,
      }),
    );
    svg.appendChild(
      create(
        "text",
        {
          class: active ? "event-label" : "chart-text",
          x: padding.left + barWidth + 8,
          y: y + barHeight / 2 + 4,
        },
        bucket.ratio.toFixed(1),
      ),
    );
    svg.appendChild(
      create(
        "text",
        {
          class: active ? "event-label" : "chart-text",
          x: padding.left - 10,
          y: y + barHeight / 2 + 4,
          "text-anchor": "end",
        },
        bucket.label,
      ),
    );
  });

  svg.appendChild(
    create("text", { class: "chart-text", x: padding.left + plotWidth / 2, y: height - 8, "text-anchor": "middle" }, "사고 확률"),
  );
  svg.appendChild(
    create("line", {
      class: "axis-line",
      x1: padding.left,
      x2: padding.left,
      y1: padding.top,
      y2: padding.top + plotHeight,
    }),
  );
  svg.appendChild(
    create("line", {
      class: "axis-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: padding.top + plotHeight,
      y2: padding.top + plotHeight,
    }),
  );
}

function setKey(direction, pressed) {
  if (drive.status !== "driving" || drive.eye !== "open") return;
  keys[direction] = pressed;
}

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setKey("left", true);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setKey("right", true);
  } else if (event.key === " " || event.key === "Enter") {
    if (drive.status !== "driving") {
      event.preventDefault();
      startDrive();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft") keys.left = false;
  if (event.key === "ArrowRight") keys.right = false;
});

window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
});

[
  [controls.steerLeft, "left"],
  [controls.steerRight, "right"],
].forEach(([button, direction]) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setKey(direction, true);
  });
  button.addEventListener("pointerup", () => {
    keys[direction] = false;
  });
  button.addEventListener("pointercancel", () => {
    keys[direction] = false;
  });
  button.addEventListener("pointerleave", () => {
    keys[direction] = false;
  });
});

controls.sleepHours.addEventListener("input", updateReadouts);
overlay.button.addEventListener("click", startDrive);

// 곡선 위를 클릭하거나 드래그해 수면시간을 정한다. 슬라이더와 같은 값을 공유한다.
const riskCurve = document.querySelector("#riskCurve");
let scrubbing = false;

function hoursFromCurvePointer(event) {
  const rect = riskCurve.getBoundingClientRect();
  if (rect.width === 0) return Number(controls.sleepHours.value);

  const localX = ((event.clientX - rect.left) / rect.width) * curveChart.width;
  const ratio = (localX - curveChart.padding.left) / curveChart.plotWidth;
  const raw = hoursRange.min + ratio * (hoursRange.max - hoursRange.min);
  const step = Number(controls.sleepHours.step) || 0.5;
  return clamp(Math.round(raw / step) * step, hoursRange.min, hoursRange.max);
}

function scrubTo(event) {
  const hours = hoursFromCurvePointer(event);
  if (Number(controls.sleepHours.value) === hours) return;
  controls.sleepHours.value = String(hours);
  updateReadouts();
}

riskCurve.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  scrubbing = true;
  riskCurve.setPointerCapture(event.pointerId);
  riskCurve.classList.add("is-scrubbing");
  scrubTo(event);
});

riskCurve.addEventListener("pointermove", (event) => {
  if (!scrubbing) return;
  event.preventDefault();
  scrubTo(event);
});

["pointerup", "pointercancel"].forEach((name) => {
  riskCurve.addEventListener(name, () => {
    scrubbing = false;
    riskCurve.classList.remove("is-scrubbing");
  });
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
drive.carX = roadCenterAt(0) + road.homeLane;
spawnTraffic();
updateReadouts();
updateHud();
showOverlay({
  eyebrow: "준비",
  title: "수면시간을 정하고 출발하세요",
  body: "← → 방향키로 차선을 유지합니다. 눈이 감기는 동안에는 화면이 꺼지고 조작이 먹지 않습니다.",
  button: "적용하고 출발",
});
requestAnimationFrame(loop);
