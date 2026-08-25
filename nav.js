// 시각화 목록. 새 시각화를 추가할 때 고쳐야 할 유일한 곳이다.
// 이 배열 하나로 모든 페이지의 상단 헤더와 홈의 카드 목록이 함께 만들어진다.
//
//   path  : 디렉터리 이름. 미구현이면 null
//   ready : false면 헤더에서 빠지고 홈에서는 회색 카드로 표시된다
const visualizations = [
  {
    title: "아데노신과 수면압력",
    path: "sleep_pressure_sim",
    ready: true,
    description: "차오르는 아데노신이 몸시계가 만든 잠드는 선을 뚫는 순간이 취침 시각입니다. 하루가 어떻게 무너지는지 봅니다.",
  },
  {
    title: "움직이는 대포",
    path: "microsleep_sim",
    ready: true,
    description: "수면시간을 정하고 직접 운전해봅니다. 몇 초 동안 눈이 감기면 어떤 일이 벌어지는지 봅니다.",
  },
  {
    title: "밤사이 뇌 청소",
    path: "amyloid_sim",
    ready: true,
    description: "자는 동안 뇌에 쌓인 아밀로이드가 어떻게 줄어드는지, 수면 단계마다 속도가 어떻게 달라지는지 봅니다.",
  },
  {
    title: "저녁의 빛",
    path: "light_sim",
    ready: true,
    description: "거실의 조명과 화면을 하나씩 꺼보면서 멜라토닌 분비와 잠들 확률이 어떻게 달라지는지 봅니다.",
  },
  {
    title: "밤술과 가짜 잠",
    path: "alcohol_sim",
    ready: true,
    description: "진정은 잠이 아닙니다. 잠들기 전 마신 술이 뇌파와 밤 구조를 어떻게 바꾸는지 봅니다.",
  },
  {
    title: "밤에는 선선하게",
    path: "temperature_sim",
    ready: true,
    description: "샤워, 방 온도, 선풍기와 에어컨을 바꿔가며 심부 온도가 1도 떨어지기까지를 재생해봅니다.",
  },
  {
    title: "열두 가지 비결",
    path: "habits_sim",
    ready: true,
    description: "부록의 열두 가지입니다. 전체·제목만·한 줄 목록으로 바꿔 보고 인쇄, 이미지, 텍스트로 꺼내 갑니다.",
  },
  {
    title: "카페인의 영향",
    path: null,
    ready: false,
    description: "카페인이 아데노신 신호를 가리는 장면을 다음 시각화로 확장할 예정입니다.",
  },
];

const homePath = "home";

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => node.appendChild(child));
  return node;
}

// 지금 보고 있는 페이지의 디렉터리 이름.
// GitHub Pages처럼 하위 경로로 서빙돼도 마지막 디렉터리만 보므로 안전하다.
function currentDirectory() {
  const parts = location.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === undefined) return "";
  return last.endsWith(".html") ? (parts[parts.length - 2] ?? "") : last;
}

// 모든 페이지가 한 단계 깊이에 있으므로 이웃 디렉터리는 항상 ../ 로 간다.
function linkTo(directory) {
  return `../${directory}/`;
}

function renderHeader(here) {
  const brand =
    here === homePath
      ? el("span", { class: "site-nav-brand", text: "Visual Notes", "aria-current": "page" })
      : el("a", { class: "site-nav-brand", href: linkTo(homePath), text: "Visual Notes" });

  const links = visualizations
    .filter((item) => item.ready)
    .map((item) =>
      item.path === here
        ? el("span", { class: "site-nav-link is-current", text: item.title, "aria-current": "page" })
        : el("a", { class: "site-nav-link", href: linkTo(item.path), text: item.title }),
    );

  const header = el("header", { class: "site-nav" }, [
    el("div", { class: "site-nav-inner" }, [brand, el("nav", { class: "site-nav-links", "aria-label": "시각화 목록" }, links)]),
  ]);

  document.body.insertAdjacentElement("afterbegin", header);
}

// 홈에서만 동작한다. 구현된 것은 카드 전체가 링크, 미구현은 회색 카드.
function renderHomeCards() {
  const target = document.querySelector("#vizList");
  if (target === null) return;

  let readyCount = 0;
  const cards = visualizations.map((item) => {
    const badge = item.ready ? String(++readyCount).padStart(2, "0") : "Soon";
    const body = [
      el("span", { class: "metric", text: badge }),
      el("h3", { text: item.title }),
      el("p", { text: item.description }),
    ];

    if (!item.ready) {
      return el("div", { class: "viz-card is-soon" }, body);
    }

    body.push(el("span", { class: "viz-card-go", text: "열어보기 →" }));
    return el("a", { class: "viz-card", href: linkTo(item.path) }, body);
  });

  target.replaceChildren(...cards);
}

const here = currentDirectory();
renderHeader(here);
renderHomeCards();
