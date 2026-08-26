// 시각화 여러 개가 함께 쓰는 헬퍼.
// 각 페이지에서 nav.js 다음, 시각화 스크립트보다 먼저 읽어야 한다.
//
// 참고: app.js의 clockLabel(하루 7시를 0으로 보는 시계 라벨)은 그 시각화의 축 규칙이라
// 여기로 옮기지 않았다. 아래 formatHours는 "길이"를 사람 말로 바꾸는 별개 함수다.

const ns = "http://www.w3.org/2000/svg";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function create(tag, attributes = {}, text = "") {
  const node = document.createElementNS(ns, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function formatHours(hours) {
  // 7.997시간을 "7시간 60분"으로 적던 버그가 있었다. 반올림이 60이 되면 시간으로 올린다.
  const totalMinutes = Math.round(hours * 60);
  const whole = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  // 한 시간이 안 되는데 "0시간 6분"이라고 적으면 눈에 걸린다. 다만 정확히 0일 때는 "0시간"이 맞다.
  if (whole === 0 && minutes > 0) return `${minutes}분`;
  return minutes === 0 ? `${whole}시간` : `${whole}시간 ${minutes}분`;
}
