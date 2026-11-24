// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 진입점: 모든 모듈을 불러온 뒤 초기 상태를 그리고 루프 시작
import { initDiag, APP_VERSION, saveDiag, collectDiag } from './diag';
initDiag();   // 오류 기록은 가장 먼저
import { injectIcons } from './icons';
injectIcons();
import './util';
import './dom';
import './state';
import './audio';
import './songs';
import './beatsound';
import './beats';
import './timeline';
import './fill';
import './clips';
import './render';
import './player';
import './project';
import './settings';
import './events';
import './timelineInput';
import './windowUi';
import { actx, now, projDur, seek, updateDurUI } from './audio';
import { beatsChanged, gridBeats, setPreset, syncBeatInputs, updateBeatInfo } from './beats';
import { SND, curSnd } from './beatsound';
import { frame } from './player';
import { initAutosave, projectData } from './project';
import { poolSize, syncAll } from './render';
import { applySettingsToUI } from './settings';
import { removeSong, renderSongList } from './songs';
import { S } from './state';
import { ensureTracks, refreshTimeline, selectClip } from './timeline';
import { fitCanvas, setPreviewSize } from './windowUi';
import { updateHistoryUI } from './history';
import { desk } from './desktop';
import { APP_INFO, closeAbout, openAbout } from './appInfo';
import { $ } from './util';
import { initUpdate } from './update';
import { initClipFx } from './clipFxUi';
import { initFullscreen } from './fullscreen';

setPreset('q');
$('#btnDiag').onclick = saveDiag;
$('#btnAbout').onclick = openAbout;
$('#aboutClose').onclick = closeAbout;
window.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#about').style.display === 'flex') closeAbout(); });
$('#about').onclick = (e: MouseEvent) => { if (e.target === e.currentTarget) closeAbout(); };
$('#appVer').textContent = `v${APP_VERSION}${desk() ? ' · 데스크톱' : ' · 웹'}`;
if (desk()) $('#expInfo').textContent = '데스크톱 앱: 프레임을 하나씩 만들어 MP4(H.264)로 저장합니다. 재생 시간에 묶이지 않고 프레임이 빠지지 않습니다.';
applySettingsToUI(); syncBeatInputs(); updateBeatInfo(); ensureTracks(); renderSongList(); updateDurUI();
try { const pv = JSON.parse(localStorage.getItem('bmm.pv') || 'null'); if (pv && pv.mode !== 'auto') setPreviewSize(pv.mode, pv.mode === 'custom' ? pv.px : 0); } catch (e) {}
fitCanvas();
initAutosave();
initUpdate();
initClipFx();
initFullscreen();
updateHistoryUI();   // 모듈을 모두 불러온 뒤 (history 모듈 초기화 전에 부르면 안 됨)
requestAnimationFrame(frame);

/* ---------- 테스트용 노출 ----------
   자동 테스트(tests/)가 내부 상태를 읽고 조작할 때 쓰는 이름들.
   모듈 스크립트는 전역에 이름이 남지 않아서 필요한 것만 명시적으로 내보냄. */
Object.assign(window, { S, SND, removeSong, beatsChanged, curSnd, gridBeats, now, projDur, projectData, refreshTimeline, seek, selectClip, syncAll, collectDiag, poolSize, APP_INFO, openAbout });
Object.defineProperty(window, 'actx', { get: () => actx, configurable: true });
