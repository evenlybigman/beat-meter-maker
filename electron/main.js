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
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());

/* ---------- 파일 ---------- */
ipcMain.handle('diag:mainLog', () => { try { return fs.readFileSync(logFile(), 'utf8').trim().split('\n').slice(-50); } catch (e) { return []; } });
ipcMain.handle('diag:metrics', () => app.getAppMetrics().map(m => ({ type: m.type, name: m.name || '', cpu: Math.round(m.cpu.percentCPUUsage), workingSetKB: m.memory.workingSetSize, privateKB: m.memory.privateBytes || 0 })));
ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));

/* ---------- 내보내기 저장 위치 (ffmpeg 실행은 preload의 ff.js) ---------- */
ipcMain.handle('exp:dialog', async (e, name) => {
  if (TEST) return process.env.BMM_TEST_OUT;
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: '영상 내보내기', defaultPath: name, filters: [{ name: 'MP4 영상', extensions: ['mp4'] }] });
  return r.canceled || !r.filePath ? null : r.filePath;
});
