// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 데스크톱 앱(Electron) 메인 프로세스
//  - 웹 빌드(dist/index.html)를 app:// 주소로 띄움 (미디어와 같은 출처 → 캔버스 오염 없음)
//  - app://local/media?p=<경로> : 내 컴퓨터의 영상·음악 파일 (구간 요청 지원 → 영상 탐색 가능)
//  - 저장 위치 대화상자. ffmpeg는 preload(ff.js)에서 실행
const { app, BrowserWindow, protocol, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const DIST = path.resolve(__dirname, '..', 'dist');
const TEST = process.env.BMM_TEST === '1';   // 자동 테스트: 저장 대화상자 대신 BMM_TEST_OUT 경로 사용
if (process.env.BMM_USER_DATA) app.setPath('userData', process.env.BMM_USER_DATA);   // 테스트마다 따로 (자동 저장 분리)

/* ---------- 기록 파일 (사용자 폴더/logs/main.log, 1MB 넘으면 새로) — 진단 정보에 마지막 부분이 들어감 ---------- */
function logFile() { const d = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(d, { recursive: true }); return path.join(d, 'main.log'); }
function mlog(msg) {
  try {
    const f = logFile();
    try { if (fs.statSync(f).size > 1 << 20) fs.renameSync(f, f + '.old'); } catch (e) {}
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {}
}
process.on('uncaughtException', e => mlog('uncaughtException ' + (e && e.stack || e)));
process.on('unhandledRejection', e => mlog('unhandledRejection ' + (e && e.stack || e)));
app.on('render-process-gone', (_e, _wc, d) => mlog(`화면 프로세스 종료: ${d.reason} (code ${d.exitCode})`));
app.on('child-process-gone', (_e, d) => mlog(`보조 프로세스 종료: ${d.type} ${d.reason} (code ${d.exitCode})`));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac' };
const mimeOf = p => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

// 파일 응답 (Range 요청이면 206 부분 응답)
function fileResponse(p, req) {
  let st; try { st = fs.statSync(p); } catch (e) { return new Response('not found', { status: 404 }); }
  if (!st.isFile()) return new Response('not found', { status: 404 });
  const size = st.size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const head = { 'Content-Type': mimeOf(p), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (m && size > 0) {
    let a = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
    let b = m[1] !== '' && m[2] !== '' ? Number(m[2]) : size - 1;
    a = Math.max(0, a); b = Math.min(size - 1, b);
    if (a > b) return new Response(null, { status: 416, headers: { ...head, 'Content-Range': `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(p, { start: a, end: b })), {
      status: 206, headers: { ...head, 'Content-Length': String(b - a + 1), 'Content-Range': `bytes ${a}-${b}/${size}` } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(p)), { status: 200, headers: { ...head, 'Content-Length': String(size) } });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640, backgroundColor: '#0b0c10', title: 'Beat Meter Maker',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://local/index.html');
  // 정보 창의 링크(소스·후원·라이선스)는 앱 안이 아니라 기본 브라우저로 열기. https 주소만 허용
  const openExt = url => { if (!/^https:\/\//.test(url)) return; if (TEST) globalThis.__lastExternal = url; else shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openExt(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://local/')) { e.preventDefault(); openExt(url); } });
  // 닫기 확인은 웹 쪽 beforeunload가 처리 → 대화상자로 물어봄
  win.webContents.on('will-prevent-unload', e => {
    if (TEST) return e.preventDefault();
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['닫기', '취소'], defaultId: 1, cancelId: 1,
      title: 'Beat Meter Maker', message: '저장하지 않은 작업이 있을 수 있습니다. 닫을까요?', detail: '작업은 자동 저장되어 다음에 열 때 복구할 수 있습니다.' });
    if (r === 0) e.preventDefault();
  });
  return win;
}

app.whenReady().then(() => {
  mlog(`시작 v${app.getVersion()} electron ${process.versions.electron} ${process.platform}-${process.arch}`);
  protocol.handle('app', req => {
    const u = new URL(req.url);
    if (u.pathname === '/media') return fileResponse(u.searchParams.get('p') || '', req);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const p = path.resolve(DIST, rel);
    if (!p.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    return fileResponse(p, req);
  });
  setupUpdates(createWindow());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());

/* ---------- 파일 ---------- */
ipcMain.handle('diag:mainLog', () => { try { return fs.readFileSync(logFile(), 'utf8').trim().split('\n').slice(-50); } catch (e) { return []; } });
ipcMain.handle('diag:metrics', () => app.getAppMetrics().map(m => ({ type: m.type, name: m.name || '', cpu: Math.round(m.cpu.percentCPUUsage), workingSetKB: m.memory.workingSetSize, privateKB: m.memory.privateBytes || 0 })));
ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));

/* ---------- 자동 업데이트 (GitHub 릴리스) ----------
 * 설치본에서만. 켤 때 새 버전 확인 → "새 버전이 있습니다 [다운로드] [나중에]"
 * → 다운로드를 누르면 받으면서 진행률 표시 → 다 받으면 "[지금 재시작해서 설치] [나중에]"
 * 받은 뒤 나중에를 누르면 앱을 끌 때 설치됨. macOS는 코드 서명이 없으면 동작하지 않아 끔
 * 상태는 하나(upd)로 관리하고 바뀔 때마다 화면에 통째로 보냄: phase = available | downloading | ready | error
 * 테스트: BMM_FAKE_UPDATE=<버전> 이면 실제로 확인하지 않고 흉내 (BMM_FAKE_UPDATE_FAIL=1: 첫 다운로드는 실패) */
let updater = null, upd = null, updWin = null;
const FAKE_UPD = process.env.BMM_FAKE_UPDATE || '';
let fakeFail = process.env.BMM_FAKE_UPDATE_FAIL === '1';
function setUpd(patch) {
  upd = { ...(upd || {}), ...patch };
  if (updWin && !updWin.isDestroyed()) updWin.webContents.send('upd:changed', upd);
}
function setupUpdates(win) {
  updWin = win;
  if (FAKE_UPD) { win.webContents.once('did-finish-load', () => setTimeout(() => setUpd({ phase: 'available', version: FAKE_UPD }), 300)); return; }
  if (TEST || !app.isPackaged || process.platform === 'darwin' || process.env.BMM_NO_UPDATE === '1') return;
  try { updater = require('electron-updater').autoUpdater; } catch (e) { mlog('[update] 불러오기 실패 ' + e.message); return; }
  updater.logger = { info: m => mlog('[update] ' + m), warn: m => mlog('[update] ' + m), error: m => mlog('[update] 오류 ' + m), debug() {} };
  updater.autoDownload = false;            // 받기 전에 먼저 물어봄
  updater.autoInstallOnAppQuit = true;     // 받은 뒤 '나중에'면 끌 때 설치
  updater.on('update-available', i => setUpd({ phase: 'available', version: i.version }));
  let last = 0;
  updater.on('download-progress', p => {
    const t = Date.now(); if (t - last < 150 && p.percent < 100) return; last = t;   // 너무 자주 보내지 않게
    setUpd({ phase: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total });
  });
  updater.on('update-downloaded', i => setUpd({ phase: 'ready', version: i.version, percent: 100 }));
  updater.on('error', e => {
    const msg = String(e && e.message || e).split('\n')[0].slice(0, 200);
    mlog('[update] 오류 ' + msg);
    if (upd && upd.phase === 'downloading') setUpd({ phase: 'error', error: msg });   // 확인 단계의 오류(인터넷 없음 등)는 조용히 넘어감
  });
  updater.checkForUpdates().catch(e => mlog('[update] 확인 실패 ' + (e && e.message || e)));
}
ipcMain.handle('upd:state', () => upd);
ipcMain.handle('upd:download', () => {
  if (!upd || !['available', 'error'].includes(upd.phase)) return false;
  setUpd({ phase: 'downloading', percent: 0, transferred: 0, total: 0, error: '' });
  mlog(`[update] ${upd.version} 다운로드 시작`);
  if (FAKE_UPD) {   // 테스트: 0→100%를 1.5초쯤에 걸쳐 흉내
    const total = 80 * 1024 * 1024; let pct = 0;
    const tick = setInterval(() => {
      pct += 10;
      if (fakeFail && pct >= 40) { clearInterval(tick); fakeFail = false; setUpd({ phase: 'error', error: '네트워크 연결이 끊겼습니다 (테스트)' }); return; }
      if (pct >= 100) { clearInterval(tick); setUpd({ phase: 'ready', percent: 100 }); return; }
      setUpd({ phase: 'downloading', percent: pct, transferred: total * pct / 100, total });
    }, 150);
    return true;
  }
  updater.downloadUpdate().catch(() => {});   // 실패는 'error' 이벤트에서 처리
  return true;
});
ipcMain.handle('upd:install', () => {
  if (!upd || upd.phase !== 'ready') return false;
  if (FAKE_UPD) { globalThis.__updInstall = (globalThis.__updInstall || 0) + 1; return true; }
  mlog(`[update] ${upd.version} 설치하며 재시작`);
  setImmediate(() => updater.quitAndInstall(false, true));
  return true;
});

/* ---------- 내보내기 저장 위치 (ffmpeg 실행은 preload의 ff.js) ---------- */
ipcMain.handle('exp:dialog', async (e, name) => {
  if (TEST) return process.env.BMM_TEST_OUT;
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: '영상 내보내기', defaultPath: name, filters: [{ name: 'MP4 영상', extensions: ['mp4'] }] });
  return r.canceled || !r.filePath ? null : r.filePath;
});
