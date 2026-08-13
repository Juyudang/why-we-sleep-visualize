# 작업 규칙

매튜 워커 『우리는 왜 잠을 자야 할까』의 개념을 조작 가능한 장면으로 옮기는 개인 프로젝트.
**빌드 단계가 없는 정적 사이트**다. 번들러도 패키지 매니저도 없고, HTML/CSS/JS를 그대로 서빙한다.
UI 문구와 코드 주석은 한국어로 쓴다.

## 새 시각화 추가 절차

순서를 지킬 것. 예전에 홈 카드 링크와 뒤로가기 경로를 빠뜨린 적이 있다.

1. **`nav.js`의 `visualizations` 배열에 항목 추가.** 여기가 유일한 등록 지점이다.
   이 배열 하나로 모든 페이지의 상단 헤더와 홈의 카드 목록이 함께 만들어진다.
   따로 `home/index.html`을 고치지 않는다.
2. `<이름>_sim/index.html` 과 루트 `<이름>.js` 생성.
   HTML에는 `../styles.css`, 그리고 `<body>` 끝에 `../nav.js` → `../<이름>.js` 순서로 넣는다.
3. 아직 만드는 중이면 `ready: false`로 두면 된다. 홈에 회색 점선 카드로 표시되고 헤더에는 안 뜬다.
   완성되면 `ready: true` + `path` 채우기.

## 구조와 스타일

- 시각화 하나 = `<이름>_sim/index.html` + 루트 `<이름>.js`
  (`sleep_pressure_sim/`+`app.js`, `microsleep_sim/`+`microsleep.js`)
- `styles.css`는 전 페이지 공용. 새 스타일은 하단에 절 주석으로 구분해 추가
- 색은 `:root` 토큰 재사용 (`--ink` `--muted` `--line` `--pressure` `--caffeine` `--surface` 등).
  새 색을 임의로 만들지 않는다
- **`.insight-grid`는 홈과 sim 페이지가 공유한다.** 홈 목록용으로 손대면 sim 페이지의
  "핵심 설명" 카드까지 클릭 가능한 것처럼 보인다. 홈 전용은 `.viz-grid` / `.viz-card`를 쓴다
- **경로는 반드시 상대 경로** (`../styles.css`). GitHub Pages가 하위 경로로 서빙하므로
  절대 경로(`/styles.css`)는 배포에서 깨진다

## 코딩 컨벤션

- 튜닝 상수는 이름을 붙여 파일 상단에 모은다 (`microsleep.js`의 `risk`, `road`, `oncoming`, `curveAmplitude`).
  난이도나 곡선을 바꿀 때 한 곳만 보면 되게 한다
- 주석은 "무엇"이 아니라 **"왜"**. 특히 좌표계 변환과 보정 로직
- SVG는 `create(tag, attrs, text)` 헬퍼, 캔버스는 `requestAnimationFrame` 루프에 `dt` 클램프
- **알려진 부채:** `clamp`, `create`, `ns`, `formatHour`가 `app.js`와 `microsleep.js`에 중복돼 있다.
  세 번째 시각화를 만들 때 `shared.js`로 분리할 것

## 작업 흐름

- **항상 워크트리 → 브랜치 → PR.** main에 직접 커밋하지 않는다
- 커밋 메시지와 PR 본문은 한국어로, 무엇을 왜 바꿨는지. 커밋이 여러 개면 PR에 대응표를 넣는다

## 실행과 검증

- 로컬 서버는 `.claude/launch.json`의 `why-we-sleep` (`python3 -m http.server 4173`).
  Bash로 서버를 직접 띄우지 않는다
- 검증 기준: 바꾼 화면을 브라우저에서 열어 **동작 확인 + 콘솔 에러 0 + 스크린샷**
- **캐시 함정 (매번 걸린다).** 정적 서버라 브라우저가 JS/CSS/HTML을 캐시한다.
  새로고침해도 옛 파일이 떠서 수정이 안 먹은 것처럼 보이고, 실제로 오진한 적이 있다.
  검증 전에 `fetch(경로, {cache:'reload'})`로 비운 뒤 쿼리스트링을 붙여 재접속할 것.
  사용자에게 안내할 때도 강제 새로고침(Cmd+Shift+R)을 함께 알린다
- 스크린샷 패널이 옛 프레임을 반환하는 경우가 있다. 이상하면 DOM 조회로 사실을 확인하고,
  스크린샷만 근거로 판단하지 않는다
- 확률·속도·난이도처럼 수치가 결과를 바꾸는 변경을 했고 실제 값 측정이 필요하면 사용자에게 요청한다

## 수치 표기 원칙

시뮬레이터의 숫자는 **체감을 위해 조정한 값이지 연구 수치가 아니다.**
출처가 있는 데이터(예: 그림 12 = AAA Foundation, Tefft 2016)와 한 화면에 놓을 때는
캡션에 출처와 "시뮬레이터 수치와 별개"임을 명시한다. README에도 밝혀두었다.

## 환경 함정

- 파일 권한이 644→755로 드리프트해 `git pull`이 막힐 수 있다.
  내용이 같은지 확인한 뒤 `git checkout -- .` 후 pull. 반복되면 `git config core.fileMode false`
- `.omc/`는 에이전트 세션 상태라 커밋하지 않는다 (`.gitignore`에 등록됨)
