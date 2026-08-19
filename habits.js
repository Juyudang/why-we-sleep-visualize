// 부록 "건강한 수면을 위한 열두 가지 비결" 페이지.
//
// 다른 시각화와 달리 모델도 시뮬레이션도 없다. 목록을 읽고 원하는 형태로 꺼내 가는 게 전부다.
// 보기 방식(전체 / 제목만 / 한 줄 목록)은 CSS가 data-mode로 처리하고,
// 이 파일은 그 상태를 인쇄·이미지·텍스트로 옮기는 일만 한다.
//
// 내보내기는 전부 지금 보고 있는 형태를 따른다. 제목만 보고 있는데 본문이 딸려 나오면
// "보기"와 "출력"이 따로 노는 셈이라, 무엇이 나올지 눌러보기 전에는 알 수 없게 된다.

const grid = document.querySelector("#tipGrid");
const status = document.querySelector("#toolStatus");
const modeButtons = [...document.querySelectorAll(".tips-modes button")];

const modes = {
  full: { label: "전체 보기", note: "제목과 본문이 모두 나갑니다.", body: true },
  card: { label: "제목만 보기", note: "카드마다 번호와 제목만 나갑니다.", body: false },
  list: { label: "한 줄 목록", note: "번호와 제목이 한 줄씩 나갑니다.", body: false },
};

const documentTitle = "건강한 수면을 위한 열두 가지 비결";
const documentSource = "매튜 워커, 『우리는 왜 잠을 자야 할까』 부록";
const fileBase = "열두-가지-비결";

function currentMode() {
  return grid.dataset.mode;
}

// 목록은 HTML에 있다. 내보내기가 화면과 어긋나지 않으려면 여기서 다시 읽어야 한다.
// (tip-link는 이 사이트 안의 다른 장면으로 가는 안내라 밖으로 내보내지 않는다.)
function collectTips() {
  return [...grid.querySelectorAll(".tip-card")].map((card) => ({
    no: card.querySelector(".metric").textContent.trim(),
    title: card.querySelector("h3").textContent.trim(),
    body: card.querySelector(".tip-body").textContent.replace(/\s+/g, " ").trim(),
  }));
}

function setMode(mode) {
  grid.dataset.mode = mode;
  modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  say(`${modes[mode].label}입니다. ${modes[mode].note}`);
}

function say(message) {
  status.textContent = message;
}

// ── 텍스트 ────────────────────────────────────────────────
function toText(mode) {
  const lines = [documentTitle, documentSource, ""];
  collectTips().forEach((tip) => {
    if (modes[mode].body) lines.push(`${tip.no}. ${tip.title}`, tip.body, "");
    else lines.push(`${tip.no}. ${tip.title}`);
  });
  return `${lines.join("\n").trim()}\n`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // 바로 해제하면 저장이 시작되기 전에 주소가 사라져 취소되는 브라우저가 있다. 한 박자 뒤에 놓아준다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 이미지 ────────────────────────────────────────────────
// 화면을 그대로 캡처하는 게 아니라 캔버스에 다시 그린다.
// 라이브러리 없이 DOM을 이미지로 옮기려면 foreignObject에 스타일을 통째로 넣어야 하는데,
// 폰트와 CSS 변수가 자주 어긋난다. 목록은 우리가 아는 내용이라 직접 그리는 편이 확실하다.
const image = {
  scale: 2, // 레티나에서 글자가 뭉개지지 않게 두 배로 그린 뒤 줄인다
  padding: 56,
  layouts: {
    full: { width: 1000, columns: 2, gap: 22, pad: 24, titleSize: 20, bodySize: 15, bodyLine: 25, boxed: true },
    card: { width: 960, columns: 3, gap: 18, pad: 26, titleSize: 21, bodySize: 0, bodyLine: 0, boxed: true },
    list: { width: 760, columns: 1, gap: 0, pad: 15, titleSize: 18, bodySize: 0, bodyLine: 0, boxed: false },
  },
};

const face = 'Inter, ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function font(weight, size) {
  return `${weight} ${size}px ${face}`;
}

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 한국어는 낱말이 길어서 띄어쓰기만으로는 한 줄에 안 들어가는 경우가 생긴다.
// 그때는 글자 단위로 자른다. 안 그러면 줄 밖으로 삐져나간다.
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";

  text.split(/\s+/).filter(Boolean).forEach((word) => {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      return;
    }
    if (line !== "") {
      lines.push(line);
      line = "";
    }
    let chunk = "";
    [...word].forEach((letter) => {
      if (chunk !== "" && ctx.measureText(chunk + letter).width > maxWidth) {
        lines.push(chunk);
        chunk = letter;
      } else {
        chunk += letter;
      }
    });
    line = chunk;
  });

  if (line !== "") lines.push(line);
  return lines;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// 높이를 먼저 재고 캔버스를 만든다. 캔버스는 크기를 바꾸면 내용이 지워지므로 순서가 중요하다.
function measureTips(layout, innerWidth) {
  const ctx = document.createElement("canvas").getContext("2d");
  return collectTips().map((tip) => {
    ctx.font = font(800, layout.titleSize);
    const titleLines = wrapText(ctx, tip.title, innerWidth);
    let bodyLines = [];
    let height = layout.pad * 2 + 20 + titleLines.length * (layout.titleSize + 7);
    if (layout.bodySize > 0) {
      ctx.font = font(500, layout.bodySize);
      bodyLines = wrapText(ctx, tip.body, innerWidth);
      height += 10 + bodyLines.length * layout.bodyLine;
    }
    return { tip, titleLines, bodyLines, height };
  });
}

function renderImage(mode) {
  const layout = image.layouts[mode];
  const columnWidth = (layout.width - image.padding * 2 - layout.gap * (layout.columns - 1)) / layout.columns;
  const innerWidth = columnWidth - layout.pad * 2;
  const items = measureTips(layout, innerWidth);

  const rows = [];
  for (let i = 0; i < items.length; i += layout.columns) {
    const row = items.slice(i, i + layout.columns);
    rows.push({ row, height: Math.max(...row.map((item) => item.height)) });
  }

  const headerHeight = 112;
  const footerHeight = 46;
  const bodyHeight = rows.reduce((sum, row) => sum + row.height + layout.gap, 0) - layout.gap;
  const width = layout.width;
  const height = image.padding * 2 + headerHeight + bodyHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * image.scale;
  canvas.height = height * image.scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(image.scale, image.scale);
  ctx.textBaseline = "alphabetic";

  const ink = token("--ink");
  const muted = token("--muted");
  const line = token("--line");
  const accent = token("--pressure");

  ctx.fillStyle = token("--surface") || "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // ── 머리말 ──
  ctx.fillStyle = accent;
  ctx.font = font(800, 13);
  ctx.fillText("VISUAL NOTE 07", image.padding, image.padding + 14);
  ctx.fillStyle = ink;
  ctx.font = font(900, 34);
  ctx.fillText(documentTitle, image.padding, image.padding + 58);
  ctx.fillStyle = muted;
  ctx.font = font(700, 14);
  ctx.fillText(documentSource, image.padding, image.padding + 84);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(image.padding, image.padding + 100.5);
  ctx.lineTo(width - image.padding, image.padding + 100.5);
  ctx.stroke();

  // ── 항목 ──
  let y = image.padding + headerHeight;
  rows.forEach(({ row, height: rowHeight }) => {
    row.forEach((item, column) => {
      const x = image.padding + column * (columnWidth + layout.gap);

      if (layout.boxed) {
        ctx.fillStyle = "#fbfcfb";
        roundedRect(ctx, x, y, columnWidth, rowHeight, 8);
        ctx.fill();
        ctx.strokeStyle = line;
        ctx.stroke();
        // 카드 왼쪽의 강조선. 화면의 .tip-card와 같은 규칙이다.
        ctx.fillStyle = accent;
        roundedRect(ctx, x, y, 4, rowHeight, 2);
        ctx.fill();
      }

      let textY = y + layout.pad + 14;
      ctx.fillStyle = layout.boxed ? muted : accent;
      ctx.font = font(900, 13);
      ctx.fillText(item.tip.no, x + layout.pad, textY);

      textY += 22;
      ctx.fillStyle = ink;
      ctx.font = font(800, layout.titleSize);
      item.titleLines.forEach((text) => {
        ctx.fillText(text, x + layout.pad, textY);
        textY += layout.titleSize + 7;
      });

      if (item.bodyLines.length > 0) {
        textY += 6;
        ctx.fillStyle = muted;
        ctx.font = font(500, layout.bodySize);
        item.bodyLines.forEach((text) => {
          ctx.fillText(text, x + layout.pad, textY);
          textY += layout.bodyLine;
        });
      }

      // 한 줄 목록은 상자가 없으니 밑줄로 항목을 가른다
      if (!layout.boxed) {
        ctx.strokeStyle = line;
        ctx.beginPath();
        ctx.moveTo(x, y + rowHeight - 0.5);
        ctx.lineTo(x + columnWidth, y + rowHeight - 0.5);
        ctx.stroke();
      }
    });
    y += rowHeight + layout.gap;
  });

  // ── 꼬리말 ──
  ctx.fillStyle = muted;
  ctx.font = font(700, 12);
  ctx.fillText("원문은 미국 국립보건원(NIH)의 수면 위생 권고를 옮긴 것입니다.", image.padding, height - image.padding + 4);

  return canvas;
}

// ── 버튼 ──────────────────────────────────────────────────
modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

document.querySelector("#toPrint").addEventListener("click", () => {
  say(`${modes[currentMode()].label} 그대로 인쇄합니다. 인쇄 창에서 대상을 "PDF로 저장"으로 바꾸면 PDF가 됩니다.`);
  window.print();
});

document.querySelector("#toImage").addEventListener("click", () => {
  const mode = currentMode();
  renderImage(mode).toBlob((blob) => {
    if (blob === null) {
      say("이미지를 만들지 못했습니다. 다른 형태로 내보내 보세요.");
      return;
    }
    saveBlob(blob, `${fileBase}-${mode}.png`);
    say(`${modes[mode].label}를 PNG로 저장했습니다.`);
  }, "image/png");
});

document.querySelector("#toText").addEventListener("click", () => {
  const mode = currentMode();
  saveBlob(new Blob([toText(mode)], { type: "text/plain;charset=utf-8" }), `${fileBase}.txt`);
  say(`${modes[mode].label}를 텍스트 파일로 저장했습니다.`);
});

document.querySelector("#toClipboard").addEventListener("click", async () => {
  const mode = currentMode();
  try {
    await navigator.clipboard.writeText(toText(mode));
    say(`${modes[mode].label}를 클립보드에 복사했습니다.`);
  } catch {
    // 클립보드는 권한이 없거나 https가 아니면 막힌다. 그때는 파일로 안내한다.
    say("복사가 막혔습니다. 브라우저 권한을 확인하거나 텍스트 파일로 저장해 보세요.");
  }
});

setMode("full");
