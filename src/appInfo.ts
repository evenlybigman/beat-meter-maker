// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 앱 정보: 저작자·라이선스·링크. 링크는 여기 한 곳만 고치면 정보 창과 진단 정보에 반영됨
// sourceUrl·donateUrl이 비어 있으면 정보 창에서 그 줄을 숨김
import { APP_VERSION } from './diag';
import { ic } from './icons';
import { $ } from './util';

export const APP_INFO = {
  name: 'Beat Meter Maker',
  author: 'Juke',
  year: 2026,
  license: 'GPL-3.0-or-later',
  /** 소스 코드 저장소 (예: https://github.com/<사용자>/beat-meter-maker) — 정해지면 채우기 */
  sourceUrl: '',
  /** 후원 링크 — 정해지면 채우기 */
  donateUrl: '',
  donateLabel: '후원하기',
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeUrl = (u: string) => (/^https:\/\//.test(u) ? u : '');   // https 주소만 링크로
const link = (u: string, text: string) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

export function renderAbout() {
  const I = APP_INFO, src = safeUrl(I.sourceUrl), don = safeUrl(I.donateUrl);
  const notices = src ? link(`${src.replace(/\/$/, '')}/blob/main/THIRD_PARTY_NOTICES.md`, '함께 들어가는 프로그램 안내') : '함께 들어가는 프로그램 안내: 설치 폴더의 THIRD_PARTY_NOTICES.md';
  $('#aboutBody').innerHTML = `
    <h3>${esc(I.name)} <small id="aboutVer">v${esc(APP_VERSION)}</small></h3>
    <p>Copyright © ${I.year} <b id="aboutAuthor">${esc(I.author)}</b></p>
    ${don ? `<p><a class="donate" id="aboutDonate" href="${esc(don)}" target="_blank" rel="noopener noreferrer">${ic('heart')}${esc(I.donateLabel)}</a><br><span class="hint">이 프로그램은 무료입니다. 개발을 응원하고 싶다면 후원해 주세요.</span></p>` : ''}
    ${src ? `<p id="aboutSource">소스 코드: ${link(src, src.replace(/^https:\/\//, ''))}</p>` : ''}
    <p class="hint" id="aboutLicense">이 프로그램은 자유 소프트웨어입니다. 자유 소프트웨어 재단이 발표한 GNU 일반 공중 사용 허가서(GPL) 3판 또는 (원하는 경우) 그 이후 판의 조건에 따라 다시 배포하거나 고칠 수 있습니다.
    이 프로그램은 쓸모 있기를 바라며 배포하지만, 상품성이나 특정 목적에 맞는지에 대한 묵시적 보증을 포함해 <b>어떠한 보증도 하지 않습니다</b>.
    자세한 내용은 ${link('https://www.gnu.org/licenses/gpl-3.0.html', 'GPL 3판 전문')}을 보세요.</p>
    <p class="hint" id="aboutCredits">기본 소리 "하우스 킥": Dan Wray (${link('https://freesound.org/people/DWSD/', 'DWSD')}) 무료 샘플, ${link('https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0')} (16비트 모노로 변환)</p>
    <p class="hint">${notices}</p>`;
}
export function openAbout() { renderAbout(); $('#about').style.display = 'flex'; }
export function closeAbout() { $('#about').style.display = 'none'; }
