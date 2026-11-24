// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 자동 업데이트 알림 바 (데스크톱 설치본만). 화면 위 가운데
//  새 버전 있음  → [다운로드] [나중에]
//  받는 중       → 진행률 막대·%·MB, [숨기기] (다 받으면 다시 뜸)
//  준비됨        → [지금 재시작해서 설치] (자동 저장 후 재시작) [나중에] (앱을 끌 때 설치)
//  실패          → [다시 시도] [닫기]
import { desk, type UpdState } from './desktop';
import { btnHtml } from './icons';
import { autosaveTick } from './project';
import { S } from './state';
import { $, toast } from './util';

const mb = (b = 0) => (b / 1048576).toFixed(1);
let st: UpdState | null = null, hiddenPhase = '';

function render() {
  const bar = $('#updBar'); if (!st) return;
  bar.style.display = st.phase === hiddenPhase ? 'none' : 'flex';
  bar.dataset.phase = st.phase;
  const v = `<b>v${st.version}</b>`, pct = Math.max(0, Math.min(100, st.percent || 0));
  const msg = $('#updMsg'), act = $('#updAct'), later = $('#updLater');
  $('#updProg').style.display = st.phase === 'downloading' ? 'block' : 'none';
  $('#updFill').style.width = pct.toFixed(1) + '%';
  act.style.display = st.phase === 'downloading' ? 'none' : '';
  if (st.phase === 'available') { msg.innerHTML = `새 버전 ${v}이(가) 있습니다`; act.innerHTML = btnHtml('export', '다운로드'); later.textContent = '나중에'; }
  else if (st.phase === 'downloading') { msg.innerHTML = `${v} 받는 중 <span class="pct">${Math.floor(pct)}%</span>${st.total ? ` <span class="mb">${mb(st.transferred)} / ${mb(st.total)}MB</span>` : ''}`; later.textContent = '숨기기'; }
  else if (st.phase === 'ready') { msg.innerHTML = `새 버전 ${v} 준비됨`; act.innerHTML = btnHtml('export', '지금 재시작해서 설치'); later.textContent = '나중에'; }
  else { msg.textContent = `업데이트를 받지 못했습니다${st.error ? ' — ' + st.error : ''}`; act.textContent = '다시 시도'; later.textContent = '닫기'; }
}

export function initUpdate() {
  const U = desk()?.update;
  if (!U) return;
  U.onChange(s => { st = s; render(); });
  $('#updAct').onclick = async () => {
    if (!st) return;
    if (st.phase === 'available' || st.phase === 'error') { hiddenPhase = ''; await U.download(); return; }
    if (st.phase === 'ready') {
      if (S.exporting) { toast('내보내기가 끝난 뒤에 다시 눌러 주세요'); return; }
      await autosaveTick();
      await U.install();
    }
  };
  $('#updLater').onclick = () => {
    if (!st) return;
    hiddenPhase = st.phase; render();
    if (st.phase === 'downloading') toast('계속 받는 중입니다 — 다 받으면 다시 알려 드립니다');
    else if (st.phase === 'ready') toast('앱을 끌 때 새 버전이 설치됩니다');
    else if (st.phase === 'available') toast('다음에 앱을 켤 때 다시 알려 드립니다');
  };
}
