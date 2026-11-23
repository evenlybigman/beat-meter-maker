// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 선 아이콘 (24×24, 직접 그림). 화면(index.html)과 코드 모두 <use href="#i-이름">로 참조
// 처음 불러올 때 한 번 문서에 넣어 둠 (injectIcons)
const P: Record<string, string> = {
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  back: '<path d="M18 5.5v13a1 1 0 0 1-1.6.8L8 13a1.2 1.2 0 0 1 0-2l8.4-6.3a1 1 0 0 1 1.6.8Z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  vol: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  volOff: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  keys: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  first: '<path d="M5 5v14"/><path d="m13 7-5 5 5 5M8 12h12"/>',
  last: '<path d="M19 5v14"/><path d="m11 7 5 5-5 5M16 12H4"/>',
  rec: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  shuffle: '<path d="M2 18h2.5a4 4 0 0 0 3.3-1.8l6.4-8.4A4 4 0 0 1 17.5 6H22"/><path d="m19 3 3 3-3 3"/><path d="M2 6h2.5a4 4 0 0 1 3.3 1.8l.7.9M22 18h-4.5a4 4 0 0 1-3.3-1.8l-.7-.9"/><path d="m19 21 3-3-3-3"/>',
  save: '<path d="M5 21h14a2 2 0 0 0 2-2V8l-5-5H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-8.7C1.4 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.2 3.4 3.8 6.3C19 15.6 12 20 12 20Z" fill="currentColor" stroke="none"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  wave: '<path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"/>',
  bug: '<rect x="7" y="6" width="10" height="14" rx="5"/><path d="M12 10v10M7 13H3M21 13h-4M8 8 5 5M16 8l3-3M7 18l-3 2M17 18l3 2"/>',
};

/** 아이콘 마크업. 버튼 등 안에 넣어 씀 */
export const ic = (name: keyof typeof P | string) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
/** 단축키 표시 */
export const kbd = (k: string) => `<kbd>${k}</kbd>`;
/** 버튼 내용: 아이콘 + 글자 (+ 단축키) */
export const btnHtml = (icon: string, label: string, key?: string) => `${icon ? ic(icon) : ''}<span>${label}</span>${key ? kbd(key) : ''}`;

export function injectIcons() {
  if (document.getElementById('iconSprite')) return;
  const syms = Object.entries(P).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `<svg id="iconSprite" style="display:none" xmlns="http://www.w3.org/2000/svg">${syms}</svg>`);
}
