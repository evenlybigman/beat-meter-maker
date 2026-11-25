// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 버튼·입력칸 이벤트 연결
import { afterEdit, commit, record, redo, undo } from './history';
import { btnHtml } from './icons';
import { ensureAudio, musicGain, now, projDur, seek, setDuration, updateDurUI } from './audio';
import { R, applyPattern, applyRange, generateAll, getRange, hit, nearestBeat, setA, setB, setPreset, startRec, stopRec, syncBeatInputs, tap } from './beats';
import { SND, addSoundFile, beatGain, curSnd, grabPreview, grabSave, previewSnd, renderSndUI, setGrabStart, setSndOn } from './beatsound';
import { addClips, clampImgLen, removeSelectedClips, renderClipList } from './clips';
import { fxTargets } from './clipFxUi';
import { randomFill } from './fill';
import { cancelExport, exportVideo, seekUi, togglePlay } from './player';
import { loadProject, newProject, saveProject } from './project';
import { applySettingsToUI } from './settings';
import { loadMusicFiles, runDetect } from './songs';
import { S } from './state';
import { clampTilt } from './itemTypes';
import { clearAllItems, selectClip, selectedItems, addSelectedClip, allItems, appendSelectedClip, copyTrack, delItem, dupItem, itemOp, prependSelectedClip, setTrim, splitAt, trackOf } from './timeline';
import { zoomBy } from './timelineInput';
import { $, fmt, status, toast } from './util';
/** 기준 조각의 시작을 t로. 여러 개 선택했으면 모두 같은 만큼 옮김 (서로 간격 유지, 0초 앞으로는 안 감) */
function moveSelTo(t: number) {
  const g0 = S.selItem; if (!g0) return toast('먼저 타임라인에서 조각을 선택하세요');
  const gs = selectedItems().filter(x => x.kind === g0.kind);
  const d = Math.max(t - g0.start, -Math.min(...gs.map(x => x.start)));
  itemOp(g => { g.start += d; g.end += d; });
}
/** 입력칸 이벤트 (target이 입력 요소) */
type InEv = Event & { target: HTMLInputElement };

/* ---------- 이벤트 ---------- */
$('#dropMusic').onclick = () => $('#fMusic').click();
$('#dropClips').onclick = () => $('#fClips').click();
$('#fMusic').onchange = (e: InEv) => { const f = [...(e.target.files || [])]; if (f.length) loadMusicFiles(f); e.target.value = ''; };
$('#fClips').onchange = (e: InEv) => { addClips([...(e.target.files || [])]); e.target.value = ''; };
$('#fProj').onchange = (e: InEv) => { const f = e.target.files?.[0]; if (f) loadProject(f); e.target.value = ''; };
$('#btnLoad').onclick = () => $('#fProj').click();
$('#btnSave').onclick = saveProject;
$('#btnExport').onclick = exportVideo;
$('#btnCancel').onclick = cancelExport;
$('#btnPlay').onclick = togglePlay;
$('#btnStart').onclick = () => seek(0);
$('#btnDetect').onclick = () => runDetect(false);
$('#btnTap').onclick = tap;
$('#btnGen').onclick = generateAll;
$('#btnClear').onclick = () => commit('비트 전부 삭제', () => { S.beats = []; });
$('#btnRange').onclick = applyRange;
$('#btnSetA').onclick = setA;
$('#btnSetB').onclick = setB;
$('#btnExport2').onclick = exportVideo;
$('#btnRec').onclick = () => R.on ? stopRec() : startRec();
$('#pad').addEventListener('pointerdown', (e: InEv) => { e.preventDefault(); hit(); });
$('#patPreset').onchange = (e: InEv) => { if (e.target.value) { setPreset(e.target.value); e.target.value = ''; } };
$('#btnPatRange').onclick = () => { const [a, b] = getRange(); if (b > a) applyPattern(a, b); else toast('구간을 확인해 주세요'); };
$('#btnPatAll').onclick = () => { if (!S.music.dur) return toast('먼저 음악을 넣어 주세요'); applyPattern(0, S.music.dur); };
document.querySelectorAll<HTMLElement>('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll<HTMLElement>('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll<HTMLElement>('.tab').forEach(p => p.classList.toggle('on', p.id === b.dataset.tab));
});
// 클립 사용 구간
// 이미지 기본 길이: 고른 이미지 클립 모두에
$('#imgLen').onchange = (e: InEv) => {
  const v = clampImgLen(e.target.value), cs = fxTargets().filter(c => c.image);
  for (const c of cs) c.dur = v;
  e.target.value = v.toFixed(1); renderClipList();
  if (cs.length > 1) toast(`이미지 ${cs.length}개의 기본 길이를 ${v.toFixed(1)}초로 바꿨습니다`);
};
$('#clipSelClear').onclick = () => selectClip(S.selClip);
$('#clipSelDel').onclick = removeSelectedClips;
$('#trimIn').onchange = (e: InEv) => setTrim('in', e.target.value);
$('#trimOut').onchange = (e: InEv) => setTrim('out', e.target.value);
$('#btnTrimIn').onclick = () => setTrim('in', $('#trimVid').currentTime);
$('#btnTrimOut').onclick = () => setTrim('out', $('#trimVid').currentTime);
$('#btnTrimAdd').onclick = addSelectedClip;
// 타임라인
$('#tlAdd').onclick = addSelectedClip;
$('#tlAppend').onclick = appendSelectedClip;
$('#tlPrepend').onclick = prependSelectedClip;
$('#btnTrimPrepend').onclick = prependSelectedClip;
$('#btnTrimAppend').onclick = appendSelectedClip;
$('#tlSplit').onclick = () => splitAt(now());
$('#tlDup').onclick = dupItem;
$('#tlClear').onclick = clearAllItems;
$('#btnNew').onclick = newProject;
$('#tlDel').onclick = () => { if (!delItem()) toast('삭제할 조각을 선택하세요'); };
$('#zIn').onclick = () => zoomBy(1 / 1.5);
$('#zOut').onclick = () => zoomBy(1.5);
$('#zFit').onclick = () => { S.zoom = Math.max(4, S.music.dur || 60); };
$('#btnCopyTrack').onclick = copyTrack;
// 선택한 조각
$('#segClip').onchange = (e: InEv) => itemOp(g => { const c = S.clips[+e.target.value]; if (!c) return; g.src = c; g.srcName = c.name; if (g.off >= c.dur) g.off = c.inPt; });
$('#segOff').onchange = (e: InEv) => itemOp(g => { if (g.src) g.off = Math.max(0, Math.min(g.src.dur - 0.05, +e.target.value || 0)); });
$('#btnSegOffPrev').onclick = () => itemOp(g => { if (g.src !== S.selClip) return toast('소스 탭 미리보기의 클립과 이 조각의 클립이 다릅니다'); g.off = $('#trimVid').currentTime; });
$('#segStart').onchange = (e: InEv) => moveSelTo(+e.target.value || 0);
$('#segLen').onchange = (e: InEv) => itemOp(g => { g.end = g.start + Math.max(0.1, +e.target.value || 0.1); });
$('#btnSegSnap').onclick = () => itemOp(g => { const nb = nearestBeat(g.start); if (nb.i >= 0) { const len = g.end - g.start; g.start = S.beats[nb.i]; g.end = g.start + len; } });
$('#btnSegFill').onclick = () => itemOp(g => { const tr = S.tracks[trackOf(g)]; const nx = tr.find(x => x !== g && x.start > g.start + 0.01); g.end = nx ? nx.start : (S.music.dur || g.end); });
$('#segRate').onchange = (e: InEv) => itemOp(g => { g.rate = +e.target.value || 1; });
for (const [id, key, sc] of [['#segX', 'x', 100], ['#segY', 'y', 100], ['#segZoom', 'zoom', 100]] as const) {
  $(id).addEventListener('pointerdown', () => { if (S.selItem) record('화면 안 위치 조절'); });
  $(id).addEventListener('input', (e: InEv) => itemOp(g => { g[key] = (+e.target.value) / sc; }, false));
}
$('#segFlip').onchange = (e: InEv) => itemOp(g => { g.flip = e.target.checked; });
document.querySelectorAll<HTMLElement>('#segRot button').forEach(b => b.onclick = () => itemOp(g => { g.rot = +(b.dataset.rot || 0); }, true, '회전'));
$('#segTilt').addEventListener('pointerdown', () => { if (S.selItem) record('기울기'); });
$('#segTilt').addEventListener('input', (e: InEv) => itemOp(g => { g.tilt = clampTilt(e.target.value); }, false));
$('#segVol').addEventListener('pointerdown', () => { if (S.selItem) record('클립 소리 조절'); });
$('#segVol').addEventListener('input', (e: InEv) => itemOp(g => { g.vol = (+e.target.value) / 100; }, false));
$('#btnVolMute').onclick = () => itemOp(g => { g.vol = 0; });
$('#btnVolOn').onclick = () => { ensureAudio(); itemOp(g => { g.vol = 1; }); };
$('#btnVolAll').onclick = () => itemOp(g => { for (const x of S.tracks[trackOf(g)]) x.vol = g.vol || 0; toast(`화면 ${trackOf(g) + 1}의 모든 조각 소리를 ${Math.round((g.vol || 0) * 100)}%로 맞췄습니다`); });
export function updateClipSoundBtn() { const b = $('#tlSound'), on = !!S.set.clipSound; b.innerHTML = btnHtml(on ? 'vol' : 'volOff', on ? '클립 소리 켬' : '클립 소리 끔'); b.classList.toggle('on', on); }
export function toggleClipSound() {
  const ac = ensureAudio(); if (ac.state === 'suspended') ac.resume();
  commit('클립 소리 전체 켜기/끄기', () => {
    S.set.clipSound = !S.set.clipSound;
    for (const g of allItems()) g.vol = S.set.clipSound ? (g.vol > 0 ? g.vol : 1) : 0;
  });
  updateClipSoundBtn();
  toast(S.set.clipSound ? '모든 영상 조각의 소리를 켰습니다 (새로 넣는 조각도 소리 켜짐)' : '모든 영상 조각의 소리를 껐습니다 (새로 넣는 조각도 소리 꺼짐)', 3000);
}
export function setMusicVol(v: number) { S.musicVol = Math.max(0, Math.min(1.5, +v)); $('#musicVol').value = Math.round(S.musicVol * 100); $('#vMusicVol').textContent = Math.round(S.musicVol * 100) + '%'; if (musicGain) musicGain.gain.setTargetAtTime(S.musicVol, musicGain.context.currentTime, 0.015); }
$('#tlSound').onclick = toggleClipSound;
$('#btnFill').onclick = randomFill;
$('#tlFill').onclick = randomFill;
$('#musicVol').addEventListener('input', (e: InEv) => setMusicVol(+e.target.value / 100));
$('#sndSw').onclick = () => setSndOn(!S.set.beatSoundOn);
$('#sndSw2').onclick = () => setSndOn(!S.set.beatSoundOn);
$('#sndSel').onchange = (e: InEv) => { S.set.beatSound = e.target.value; renderSndUI(); previewSnd(); };
$('#sndPlay').onclick = previewSnd;
$('#sndAdd').onclick = () => $('#fSnd').click();
$('#fSnd').onchange = (e: InEv) => { const f = e.target.files?.[0]; if (f) addSoundFile(f); e.target.value = ''; };
$('#sndDel').onclick = () => { const c = curSnd(); if (!c || !c.custom) return; SND.list.splice(SND.list.indexOf(c), 1); S.set.beatSound = 'tick'; renderSndUI(); };
$('#sndVol').addEventListener('input', (e: InEv) => { S.set.beatVol = +e.target.value / 100; $('#vSndVol').textContent = e.target.value + '%'; if (beatGain) beatGain.gain.setTargetAtTime(S.set.beatVol, beatGain.context.currentTime, 0.015); });
$('#grabToggle').onclick = () => { const b = $('#grabBox'), open = b.style.display === 'none'; b.style.display = open ? 'block' : 'none'; if (open && S.music.dur && !+$('#grabStart').value) setGrabStart(now()); };
$('#grabNow').onclick = () => setGrabStart(now());
$('#grabBeat').onclick = () => { const nb = nearestBeat(now()); if (nb.i < 0) return toast('비트가 없습니다'); setGrabStart(S.beats[nb.i] - 0.005); if (!S.playing) seek(S.beats[nb.i]); };
document.querySelectorAll<HTMLElement>('[data-gn]').forEach(b => b.onclick = () => { setGrabStart((+$('#grabStart').value || 0) + (+(b.dataset.gn || 0))); grabPreview(); });
$('#grabLen').addEventListener('input', (e: InEv) => { $('#vGrabLen').textContent = e.target.value; });
$('#grabLen').addEventListener('change', grabPreview);
$('#grabStart').addEventListener('change', grabPreview);
$('#grabPlay').onclick = grabPreview;
$('#grabSave').onclick = grabSave;
$('#sndTap').onchange = (e: InEv) => { S.set.beatTapSound = e.target.checked; };
$('#btnSegReset').onclick = () => itemOp(g => { g.x = 0; g.y = 0; g.zoom = 1; g.flip = false; g.rot = 0; g.tilt = 0; });
$('#btnSplit').onclick = () => splitAt(now());
$('#btnDup').onclick = dupItem;
$('#btnDel').onclick = () => delItem();
// 비트 위치 보정
$('#btnOffNow').onclick = () => { if (!S.music.el) return; S.offset = Math.round(now() * 1000) / 1000; syncBeatInputs(); $('#genSrc').value = 'global'; generateAll(); toast(`첫 비트를 ${fmt(S.offset)}로 맞추고 비트를 다시 만들었습니다`); };
$('#mStart').onchange = (e: InEv) => { S.musicStart = Math.max(0, +e.target.value || 0); };
document.querySelectorAll<HTMLElement>('[data-nudge]').forEach(b => b.onclick = () => {
  const d = +(b.dataset.nudge || 0);
  commit('전체 비트 이동', () => { S.beats = S.beats.map(t => Math.round((t + d) * 10000) / 10000).filter(t => t >= 0); });
  S.offset = Math.round((S.offset + d) * 1000) / 1000; syncBeatInputs();
  status(`전체 비트를 ${d > 0 ? '+' : ''}${Math.round(d * 1000)}ms 이동`);
});
$('#btnResClip').onclick = () => {
  const c = S.selClip || S.clips[0]; if (!c || !c.w) return toast('먼저 클립을 선택하세요');
  S.set.res = 'custom'; S.set.cw = c.w; S.set.ch = c.h; applySettingsToUI();
  toast(`출력 해상도를 ${S.set.cw}×${S.set.ch}로 맞췄습니다`);
};
$('#bpm').onchange = (e: InEv) => { const v = parseFloat(e.target.value); if (v > 0) { S.bpm = v; $('#genSrc').value = 'global'; } };
$('#offset').onchange = (e: InEv) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { S.offset = v; $('#genSrc').value = 'global'; } };
$('#durMode').onchange = (e: InEv) => { if (e.target.value === 'manual') setDuration(projDur() || 60); else { S.set.durMode = 'auto'; updateDurUI(); seek(Math.min(now(), projDur())); } };
$('#durSec').onchange = (e: InEv) => setDuration(+e.target.value || 1);
$('#durNow').onclick = () => { if (now() < 1) return toast('재생 위치를 영상이 끝날 곳으로 옮긴 뒤 누르세요'); commit('영상 길이 정하기', () => setDuration(now())); toast(`영상 길이를 ${fmt(now())}로 정했습니다`); };
$('#audOff').onchange = (e: InEv) => itemOp(g => { g.off = +e.target.value || 0; });
$('#audStart').onchange = (e: InEv) => moveSelTo(+e.target.value || 0);
$('#audLen').onchange = (e: InEv) => itemOp(g => { g.end = g.start + Math.max(0.1, +e.target.value || 0.1); });
$('#audVol').addEventListener('input', (e: InEv) => { const g = S.selItem; if (!g || g.kind !== 'audio') return; g.vol = +e.target.value / 100; $('#vAudVol').textContent = e.target.value + '%'; });
$('#audVol').addEventListener('pointerdown', () => { if (S.selItem && S.selItem.kind === 'audio') record('음악 볼륨 조절'); });
$('#audVol').addEventListener('change', () => afterEdit());
$('#audBpm').onclick = () => { const g = S.selItem; if (!g || g.kind !== 'audio' || !g.src) return; S.bpm = g.src.bpm; S.offset = Math.round((g.start - g.off + g.src.offset) * 1000) / 1000; syncBeatInputs(); $('#genSrc').value = 'global'; toast(`BPM ${S.bpm} 기준으로 설정 — 비트 탭의 "전체 비트 자동 생성"이나 패턴에 적용됩니다`, 3500); };
$('#audSplit').onclick = () => splitAt(now());
$('#audDup').onclick = dupItem;
$('#audDel').onclick = () => delItem();
$('#latency').onchange = (e: InEv) => { S.latency = parseFloat(e.target.value) || 0; };
$('#snap').onchange = (e: InEv) => { S.snap = e.target.checked; };
$('#seek').addEventListener('input', (e: InEv) => { seekUi.dragging = true; seek(+e.target.value / 1000 * (S.music.dur || 0)); });
$('#seek').addEventListener('change', () => { seekUi.dragging = false; });

// 되돌리기·다시 실행 버튼
$('#tlUndo').onclick = () => { if (!R.on) undo(); };
$('#tlRedo').onclick = () => { if (!R.on) redo(); };
