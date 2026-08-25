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

// ── 항목 아이콘 ───────────────────────────────────────────
// 24×24 좌표계에 선으로만 그린다. 채우기를 쓰지 않아야 화면(SVG)과 내보내는 이미지(캔버스 Path2D)가
// 똑같은 경로 데이터를 그대로 나눠 쓸 수 있고, 색도 stroke 한 곳에서만 정해진다.
const svgNs = "http://www.w3.org/2000/svg";

function circlePath(cx, cy, r) {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

const icons = [
  // 01 알람시계 — 일어날 시간이 아니라 자러 갈 시간에 맞추는 알람이다
  [circlePath(12, 13.5, 7), "M12 9.6V13.5H15.2", "M5.6 6.4 3.4 4.2", "M18.4 6.4 20.6 4.2", "M8 20.2 6.6 22.2", "M16 20.2 17.4 22.2"],
  // 02 아령
  ["M3 12h1.8M4.8 9.2v5.6M8 7.4v9.2M8 12h8M16 7.4v9.2M19.2 9.2v5.6M19.2 12H21"],
  // 03 커피잔
  [
    "M4.5 9.5h12l-1.3 9a2.2 2.2 0 0 1-2.2 1.9H8a2.2 2.2 0 0 1-2.2-1.9Z",
    "M16.8 11.6h1.9a2.7 2.7 0 0 1 0 5.4h-1.3",
    "M8.6 6.6c0-1.3 1.2-1.7 1.2-3",
    "M12.6 6.6c0-1.3 1.2-1.7 1.2-3",
  ],
  // 04 와인잔
  ["M7 3.5h10c0 6.2-2.2 9.6-5 9.6S7 9.7 7 3.5Z", "M12 13.1V19.4", "M8.6 19.8h6.8"],
  // 05 포크와 나이프
  ["M6 3v5.4a2.1 2.1 0 0 0 4.2 0V3", "M8.1 3v7.6", "M8.1 10.6V21", "M16.6 3c2.5 2.4 2.5 6.6 0 8.9V21"],
  // 06 캡슐 — 45도로 누운 알약. 가운데 선이 두 쪽으로 나뉘는 자리다
  ["M6.03 13.03 13.03 6.03a3.5 3.5 0 0 1 4.94 4.94l-7 7a3.5 3.5 0 0 1-4.94-4.94Z", "M9.53 9.53 14.47 14.47"],
  // 07 낮잠 — zZ. 12번(뜬 눈)과 헷갈리지 않게 침대는 10번에만 쓴다
  ["M3.6 11.2h8L3.6 20h8", "M14 4h6l-6 6h6"],
  // 08 펼친 책
  ["M12 6.6C10 5.1 7 4.6 3.6 4.9v13.5C7 18.1 10 18.6 12 20.1c2-1.5 5-2 8.4-1.7V4.9C17 4.6 14 5.1 12 6.6Z", "M12 6.6V20.1"],
  // 09 욕조
  ["M2.6 12.4h18.8v3a4 4 0 0 1-4 4H6.6a4 4 0 0 1-4-4Z", "M6.4 19.4V21.6", "M17.6 19.4V21.6", "M5.8 12.4V7.4a2 2 0 0 1 2-2h2.2"],
  // 10 침대
  [
    "M3 20.4V9.6",
    "M3 15.2h18v5.2",
    "M4.8 15.2v-2.4a1.6 1.6 0 0 1 1.6-1.6h11.2a1.6 1.6 0 0 1 1.6 1.6v2.4",
    "M6.4 13.1h3.4",
  ],
  // 11 지평선 위로 뜨는 해
  ["M7 14.4a5 5 0 0 1 10 0", "M2.4 17.6h19.2", "M12 5.2V3.2", "M5.9 7.9 4.5 6.5", "M18.1 7.9 19.5 6.5", "M3.6 14.4H2", "M20.4 14.4H22"],
  // 12 뜬 눈
  ["M2.4 12s3.7-6.6 9.6-6.6S21.6 12 21.6 12s-3.7 6.6-9.6 6.6S2.4 12 2.4 12Z", circlePath(12, 12, 2.5)],
];

// 아이콘과 번호를 한 줄로 묶는다. 번호는 HTML에 이미 있으므로 옮겨 담기만 한다.
function mountIcons() {
  [...grid.querySelectorAll(".tip-card")].forEach((card, index) => {
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "tip-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    icons[index].forEach((d) => {
      const path = document.createElementNS(svgNs, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });

    const head = document.createElement("div");
    head.className = "tip-head";
    head.append(svg, card.querySelector(".metric"));
    card.prepend(head);
  });
}

// 보기 방식을 주소에 남긴다. 제목만 뽑아둔 화면을 그대로 북마크하거나 건네줄 수 있다.
function modeFromHash() {
  const name = location.hash.replace("#", "");
  return Object.hasOwn(modes, name) ? name : "full";
}

function setMode(mode) {
  grid.dataset.mode = mode;
  modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  // pushState가 아니라 replaceState다. 보기 방식을 바꿀 때마다 뒤로가기가 쌓이면 성가시다.
  history.replaceState(null, "", `#${mode}`);
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
  // style은 화면의 보기 방식과 짝을 이룬다. card = 제목+본문 카드, poster = 제목만, row = 한 줄.
  layouts: {
    full: { width: 1000, columns: 2, gap: 22, pad: 24, titleSize: 20, bodySize: 15, bodyLine: 25, icon: 30, style: "card" },
    card: { width: 980, columns: 3, gap: 20, pad: 26, titleSize: 22, bodySize: 0, bodyLine: 0, icon: 42, style: "poster" },
    list: { width: 780, columns: 1, gap: 0, pad: 16, titleSize: 18, bodySize: 0, bodyLine: 0, icon: 22, style: "row" },
  },
};

const face = 'Inter, ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function font(weight, size) {
  return `${weight} ${size}px ${face}`;
}

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// CSS 토큰은 16진수로 들어온다. 옅게 깔 때 필요한 투명도는 여기서 붙인다.
function withAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const number = parseInt(full, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
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

// 화면의 SVG와 같은 경로를 쓴다. 선 굵기는 확대 비율로 나눠, 아이콘을 키워도 선은 굵어지지 않게 한다.
function drawIcon(ctx, index, x, y, size, color) {
  const ratio = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 / ratio;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  icons[index].forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.restore();
}

// 한 줄 목록은 아이콘과 번호가 제목 옆에 붙으므로 글이 쓸 폭이 그만큼 줄어든다.
function textWidthOf(layout, columnWidth) {
  const inner = columnWidth - layout.pad * 2;
  return layout.style === "row" ? inner - layout.icon - 12 - 38 : inner;
}

// 높이를 먼저 재고 캔버스를 만든다. 캔버스는 크기를 바꾸면 내용이 지워지므로 순서가 중요하다.
function measureTips(layout, textWidth) {
  const ctx = document.createElement("canvas").getContext("2d");
  return collectTips().map((tip) => {
    ctx.font = font(800, layout.titleSize);
    const titleLines = wrapText(ctx, tip.title, textWidth);
    const titleHeight = titleLines.length * (layout.titleSize + 7);
    let bodyLines = [];

    if (layout.style === "row") {
      return { tip, titleLines, bodyLines, height: Math.max(layout.icon, titleHeight) + layout.pad * 2 };
    }

    // 아이콘 한 줄 + 제목 + (본문)
    let height = layout.pad * 2 + layout.icon + 14 + titleHeight;
    if (layout.bodySize > 0) {
      ctx.font = font(500, layout.bodySize);
      bodyLines = wrapText(ctx, tip.body, textWidth);
      height += 10 + bodyLines.length * layout.bodyLine;
    }
    return { tip, titleLines, bodyLines, height };
  });
}

function renderImage(mode) {
  const layout = image.layouts[mode];
  const columnWidth = (layout.width - image.padding * 2 - layout.gap * (layout.columns - 1)) / layout.columns;
  const textWidth = textWidthOf(layout, columnWidth);
  const items = measureTips(layout, textWidth);

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
      const index = Number(item.tip.no) - 1;

      if (layout.style === "row") {
        drawIcon(ctx, index, x, y + (rowHeight - layout.icon) / 2, layout.icon, accent);
        let textY = y + rowHeight / 2 + layout.titleSize / 2 - 2;
        ctx.fillStyle = accent;
        ctx.font = font(900, 13);
        ctx.fillText(item.tip.no, x + layout.icon + 12, textY);
        ctx.fillStyle = ink;
        ctx.font = font(800, layout.titleSize);
        item.titleLines.forEach((text, i) => {
          ctx.fillText(text, x + layout.icon + 50, textY + i * (layout.titleSize + 7));
        });
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + rowHeight - 0.5);
        ctx.lineTo(x + columnWidth, y + rowHeight - 0.5);
        ctx.stroke();
        return;
      }

      ctx.fillStyle = token("--surface") || "#ffffff";
      roundedRect(ctx, x, y, columnWidth, rowHeight, 10);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (layout.style === "poster") {
        // 위쪽 강조선과, 배경처럼 깔리는 큰 번호. 화면의 제목만 보기와 같은 규칙이다.
        ctx.save();
        roundedRect(ctx, x, y, columnWidth, rowHeight, 10);
        ctx.clip();
        ctx.fillStyle = accent;
        ctx.fillRect(x, y, columnWidth, 3);
        ctx.fillStyle = withAlpha(accent, 0.1);
        ctx.font = font(900, 62);
        ctx.textAlign = "right";
        ctx.fillText(item.tip.no, x + columnWidth - 14, y + 62);
        ctx.textAlign = "left";
        ctx.restore();
      }

      drawIcon(ctx, index, x + layout.pad, y + layout.pad, layout.icon, accent);

      if (layout.style === "card") {
        ctx.fillStyle = muted;
        ctx.font = font(900, 13);
        ctx.fillText(item.tip.no, x + layout.pad + layout.icon + 12, y + layout.pad + layout.icon / 2 + 5);
      }

      let textY = y + layout.pad + layout.icon + 14 + layout.titleSize;
      ctx.fillStyle = ink;
      ctx.font = font(800, layout.titleSize);
      item.titleLines.forEach((text) => {
        ctx.fillText(text, x + layout.pad, textY);
        textY += layout.titleSize + 7;
      });

      if (item.bodyLines.length > 0) {
        textY += 4;
        ctx.fillStyle = muted;
        ctx.font = font(500, layout.bodySize);
        item.bodyLines.forEach((text) => {
          ctx.fillText(text, x + layout.pad, textY);
          textY += layout.bodyLine;
        });
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

mountIcons();
setMode(modeFromHash());
