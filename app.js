const svg = document.querySelector("#sleepChart");

const controls = {
  rate: document.querySelector("#adenosineRate"),
  initialAdenosine: document.querySelector("#initialAdenosine"),
  decay: document.querySelector("#sleepDecayRate"),
  cycle: document.querySelector("#cycleInterval"),
  phase: document.querySelector("#cycleStart"),
  threshold: document.querySelector("#sleepThreshold"),
  sleepLimit: document.querySelector("#sleepLimit"),
  autoSleep: document.querySelector("#autoSleep"),
  forcedMode: document.querySelector("#forcedMode"),
  clearForcedSleep: document.querySelector("#clearForcedSleep"),
};

const readouts = {
  rate: document.querySelector("#rateValue"),
  initialAdenosine: document.querySelector("#initialAdenosineValue"),
  decay: document.querySelector("#decayValue"),
  cycle: document.querySelector("#cycleValue"),
  phase: document.querySelector("#phaseValue"),
  threshold: document.querySelector("#thresholdValue"),
  sleepLimit: document.querySelector("#sleepLimitValue"),
  autoSleep: document.querySelector("#autoSleepValue"),
  forcedMode: document.querySelector("#forcedModeValue"),
  forcedCount: document.querySelector("#forcedCountValue"),
};

const width = 1120;
const height = 460;
const padding = { top: 38, right: 34, bottom: 56, left: 58 };
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;
const totalHours = 72;
const step = 0.1;
const yMin = -0.45;
let chartYMax = 1.25;
const ns = "http://www.w3.org/2000/svg";
const adenosineFloor = 0;
const adenosineRiseTarget = 1.85;

const state = {
  forcedSleeps: [],
  nextForcedId: 1,
  dragStart: null,
  dragEnd: null,
  clickStart: null,
  ignoreNextClick: false,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readSettings() {
  return {
    rate: Number(controls.rate.value),
    initialAdenosine: Number(controls.initialAdenosine.value),
    decay: Number(controls.decay.value),
    cycle: Number(controls.cycle.value),
    phase: Number(controls.phase.value),
    threshold: Number(controls.threshold.value),
    sleepLimit: Number(controls.sleepLimit.value),
    autoSleep: controls.autoSleep.checked,
    forcedMode: controls.forcedMode.checked,
  };
}

function circadianAt(hour, settings) {
  const wave = Math.sin(((hour - settings.phase) / settings.cycle) * Math.PI * 2);
  return 0.42 + wave * 0.3;
}

function forcedSleepAt(hour) {
  return state.forcedSleeps.find((sleep) => hour >= sleep.start && hour < sleep.end) ?? null;
}

function buildSimulation(settings) {
  let adenosine = Math.max(adenosineFloor, settings.initialAdenosine);
  let sleeping = false;
  let sleepStart = null;
  let sleepReason = "auto";
  let activeForcedId = null;
  const points = [];
  const sleepWindows = [];

  for (let hour = 0; hour <= totalHours + 0.001; hour += step) {
    const circadian = circadianAt(hour, settings);
    const pressure = adenosine - circadian;
    const forced = forcedSleepAt(hour);

    if (forced !== null && activeForcedId !== forced.id) {
      if (sleeping && sleepStart !== null) {
        sleepWindows.push({ start: sleepStart, end: hour, reason: sleepReason, forcedId: activeForcedId });
      }
      sleeping = true;
      sleepStart = hour;
      sleepReason = "forced";
      activeForcedId = forced.id;
    } else if (!sleeping && settings.autoSleep && forced === null && pressure >= settings.threshold) {
      sleeping = true;
      sleepStart = hour;
      sleepReason = "auto";
      activeForcedId = null;
    }

    if (sleeping) {
      adenosine = Math.max(adenosineFloor, adenosine * Math.exp(-settings.decay * step));
    } else {
      adenosine += (adenosineRiseTarget - adenosine) * settings.rate * step;
    }

    const nextCircadian = circadianAt(hour + step, settings);
    const sleptLongEnough = sleepStart !== null && hour - sleepStart >= 0.6;
    const reachedSleepLimit = sleepStart !== null && hour - sleepStart >= settings.sleepLimit;
    const autoWake = sleptLongEnough && (adenosine <= nextCircadian || reachedSleepLimit);
    const activeForced =
      activeForcedId === null ? null : state.forcedSleeps.find((sleep) => sleep.id === activeForcedId) ?? null;
    const forcedWake = sleepReason === "forced" && (activeForced === null || hour + step >= activeForced.end);
    const shouldWake = sleepReason === "forced" ? forcedWake : autoWake;

    if (sleeping && shouldWake) {
      const end = activeForced !== null && activeForced !== undefined ? Math.min(activeForced.end, hour + step) : hour + step;
      sleepWindows.push({ start: sleepStart, end, reason: sleepReason, forcedId: activeForcedId });
      sleeping = false;
      sleepStart = null;
      activeForcedId = null;
    }

    points.push({
      hour,
      adenosine,
      circadian,
      pressure: adenosine - circadian,
      sleeping,
    });
  }

  if (sleeping && sleepStart !== null) {
    sleepWindows.push({ start: sleepStart, end: totalHours, reason: sleepReason, forcedId: activeForcedId });
  }

  return { points, sleepWindows };
}

function x(hour) {
  return padding.left + (hour / totalHours) * plotWidth;
}

function y(value) {
  const normalized = (value - yMin) / (chartYMax - yMin);
  return padding.top + (1 - normalized) * plotHeight;
}

function create(tag, attributes = {}, text = "") {
  const node = document.createElementNS(ns, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function pathFor(points, key) {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${x(point.hour).toFixed(2)} ${y(point[key]).toFixed(2)}`;
    })
    .join(" ");
}

function labelForHour(hour) {
  const clock = (7 + hour) % 24;
  return `${String(Math.round(clock)).padStart(2, "0")}:00`;
}

function formatHour(hour) {
  const day = Math.floor(hour / 24) + 1;
  const clock = (7 + hour) % 24;
  const wholeHour = Math.floor(clock);
  const minutes = Math.round((clock - wholeHour) * 60);
  return `${day}일차 ${String(wholeHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function updateReadouts(settings) {
  readouts.rate.textContent = `${settings.rate.toFixed(3)}/h`;
  readouts.initialAdenosine.textContent = settings.initialAdenosine.toFixed(3);
  readouts.decay.textContent = `${settings.decay.toFixed(3)}/h`;
  readouts.cycle.textContent = `${settings.cycle.toFixed(2)}h`;
  readouts.phase.textContent = labelForHour(settings.phase);
  readouts.threshold.textContent = settings.threshold.toFixed(3);
  readouts.sleepLimit.textContent = `${settings.sleepLimit.toFixed(2)}h`;
  readouts.autoSleep.textContent = settings.autoSleep ? "ON" : "OFF";
  readouts.forcedMode.textContent = settings.forcedMode ? "ON" : "OFF";
  document.body.classList.toggle("forced-draw-mode", settings.forcedMode);
  readouts.forcedCount.textContent =
    state.forcedSleeps.length === 0 ? "강제수면 없음" : `강제수면 ${state.forcedSleeps.length}개`;
}

function drawPressureFill(points) {
  const fillStride = 5;

  for (let index = 0; index < points.length - fillStride; index += fillStride) {
    const point = points[index];
    const next = points[index + fillStride];
    if (point.pressure <= 0 || next.pressure <= 0) continue;

    const averageGap = (point.pressure + next.pressure) / 2;
    const opacity = clamp(0.16 + averageGap * 0.78, 0.16, 0.86);
    const polygon = [
      `${x(point.hour).toFixed(2)},${y(point.adenosine).toFixed(2)}`,
      `${x(next.hour).toFixed(2)},${y(next.adenosine).toFixed(2)}`,
      `${x(next.hour).toFixed(2)},${y(next.circadian).toFixed(2)}`,
      `${x(point.hour).toFixed(2)},${y(point.circadian).toFixed(2)}`,
    ].join(" ");

    svg.appendChild(
      create("polygon", {
        class: "pressure-fill",
        points: polygon,
        fill: "#245fc4",
        opacity: opacity.toFixed(3),
      }),
    );
  }
}

function drawDragPreview() {
  if (state.clickStart !== null && state.dragStart === null) {
    svg.appendChild(
      create("line", {
        class: "forced-line",
        x1: x(state.clickStart),
        x2: x(state.clickStart),
        y1: padding.top,
        y2: height - padding.bottom,
      }),
    );
  }

  if (state.dragStart === null || state.dragEnd === null) return;

  const start = Math.min(state.dragStart, state.dragEnd);
  const end = Math.max(state.dragStart, state.dragEnd);
  if (end - start < 0.05) return;

  svg.appendChild(
    create("rect", {
      class: "drag-preview",
      x: x(start),
      y: padding.top,
      width: Math.max(1, x(end) - x(start)),
      height: plotHeight,
    }),
  );
}

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

  state.forcedSleeps.push({
    id: state.nextForcedId,
    start: normalizedStart,
    end: normalizedEnd,
  });
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

function drawBackground(settings, sleepWindows) {
  svg.appendChild(create("rect", { width, height, fill: "transparent" }));

  sleepWindows.forEach(({ start, end, reason, forcedId }) => {
    const isForced = reason === "forced";
    const sleepRect = create("rect", {
      class: isForced ? "forced-sleep-band" : "sleep-band",
      x: x(start),
      y: padding.top,
      width: Math.max(1, x(end) - x(start)),
      height: plotHeight,
    });

    if (isForced) {
      sleepRect.addEventListener("click", (event) => {
        event.stopPropagation();
        state.forcedSleeps = state.forcedSleeps.filter((sleep) => sleep.id !== forcedId);
        drawChart();
      });
    }

    svg.appendChild(sleepRect);
    svg.appendChild(
      create(
        "text",
        {
          class: isForced ? "manual-label" : "sleep-label",
          x: x(start) + 10,
          y: padding.top + 24,
        },
        isForced ? `강제수면 ${forcedId}` : "자동수면",
      ),
    );
  });

  [-0.25, 0, 0.25, 0.5, 0.75, 1].forEach((value) => {
    svg.appendChild(
      create("line", {
        class: "grid-line",
        x1: padding.left,
        x2: width - padding.right,
        y1: y(value),
        y2: y(value),
      }),
    );
    svg.appendChild(
      create(
        "text",
        {
          class: "chart-text",
          x: padding.left - 12,
          y: y(value) + 4,
          "text-anchor": "end",
        },
        value.toFixed(2),
      ),
    );
  });

  for (let hour = 0; hour <= totalHours; hour += 6) {
    svg.appendChild(
      create("line", {
        class: "grid-line",
        x1: x(hour),
        x2: x(hour),
        y1: padding.top,
        y2: height - padding.bottom,
      }),
    );
    svg.appendChild(
      create(
        "text",
        {
          class: "chart-text",
          x: x(hour),
          y: height - padding.bottom + 28,
          "text-anchor": "middle",
        },
        labelForHour(hour),
      ),
    );
  }

  svg.appendChild(
    create("line", {
      class: "threshold-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: y(settings.threshold),
      y2: y(settings.threshold),
    }),
  );
  svg.appendChild(
    create(
      "text",
      {
        class: "chart-text",
        x: width - padding.right - 8,
        y: y(settings.threshold) - 8,
        "text-anchor": "end",
      },
      "수면 임계값",
    ),
  );
  drawDragPreview();
  svg.appendChild(
    create("line", {
      class: "axis-line",
      x1: padding.left,
      x2: padding.left,
      y1: padding.top,
      y2: height - padding.bottom,
    }),
  );
  svg.appendChild(
    create("line", {
      class: "axis-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: y(0),
      y2: y(0),
    }),
  );
}

function drawChart() {
  const settings = readSettings();
  const { points, sleepWindows } = buildSimulation(settings);
  const highestPoint = Math.max(...points.flatMap((point) => [point.adenosine, point.circadian, point.pressure]));
  chartYMax = Math.max(1.25, highestPoint + 0.12, settings.threshold + 0.12);
  updateReadouts(settings);

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.appendChild(create("title", { id: "chart-title" }, "아데노신, 하루주기, 수면압력 그래프"));
  svg.appendChild(
    create(
      "desc",
      { id: "chart-desc" },
      "아데노신은 깨어 있을 때 상승하고 수면 중 하강한다. 하루주기는 sin 곡선이며 수면압력은 아데노신에서 하루주기를 뺀 값이다.",
    ),
  );

  drawPressureFill(points);
  drawBackground(settings, sleepWindows);
  svg.appendChild(create("path", { class: "path-adenosine", d: pathFor(points, "adenosine") }));
  svg.appendChild(create("path", { class: "path-circadian", d: pathFor(points, "circadian") }));
  svg.appendChild(create("path", { class: "path-pressure", d: pathFor(points, "pressure") }));
}

Object.values(controls).forEach((control) => {
  if (control instanceof HTMLInputElement) {
    control.addEventListener("input", drawChart);
    control.addEventListener("change", drawChart);
  }
});

controls.clearForcedSleep.addEventListener("click", () => {
  state.forcedSleeps = [];
  state.dragStart = null;
  state.dragEnd = null;
  state.clickStart = null;
  drawChart();
});

svg.addEventListener("pointerdown", (event) => {
  beginDrag(event);
  if (state.dragStart === null) return;
  svg.setPointerCapture(event.pointerId);
});

svg.addEventListener("pointermove", moveDrag);
svg.addEventListener("pointerup", finishDrag);
svg.addEventListener("pointercancel", cancelDrag);

svg.addEventListener("mousedown", beginDrag);
svg.addEventListener("mousemove", moveDrag);
window.addEventListener("mouseup", finishDrag);

svg.addEventListener("click", (event) => {
  if (!controls.forcedMode.checked) return;
  if (state.ignoreNextClick) {
    state.ignoreNextClick = false;
    return;
  }

  const clickedHour = hourFromPointer(event);
  if (state.clickStart === null) {
    state.clickStart = clickedHour;
  } else {
    addForcedSleep(state.clickStart, clickedHour);
  }
  drawChart();
});

drawChart();
