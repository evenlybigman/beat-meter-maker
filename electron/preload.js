// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 웹 화면에 데스크톱 기능을 window.bmm으로 열어 줌 (웹 버전에는 window.bmm이 없음)
// ffmpeg는 여기(화면과 같은 프로세스)에서 실행 → 프레임을 프로세스 사이로 복사하지 않아 빠름
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const os = require('os');
const ff = require('./ff');

window.addEventListener('beforeunload', () => ff.killAll());

contextBridge.exposeInMainWorld('bmm', {
  desktop: true,
  /** 파일 선택·끌어 놓기로 받은 File의 실제 경로 */
  pathOf: file => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  /** 내 컴퓨터 파일을 화면에서 읽는 주소 */
  mediaUrl: p => 'app://local/media?p=' + encodeURIComponent(p),
  exists: async paths => paths.map(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }),
  showInFolder: p => ipcRenderer.invoke('shell:show', p),
  ffVersion: () => ff.version(),
  /** 영상 파일에서 소리만 FLAC으로 */
  extractAudio: p => ff.extractAudio(p),
  /** 진단용: 이 화면 프로세스의 메모리(KB)와 앱 전체 프로세스별 메모리·CPU */
  memory: async () => { const m = await process.getProcessMemoryInfo(); return { privateKB: m.private, residentKB: m.residentSet, heapKB: Math.round(process.memoryUsage().heapUsed / 1024) }; },
  metrics: () => ipcRenderer.invoke('diag:metrics'),
  mainLog: () => ipcRenderer.invoke('diag:mainLog'),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, os: `${process.platform} ${os.release()} ${process.arch}` },
  /** 자동 업데이트: 상태가 바뀔 때마다 cb(state) (이미 있는 상태면 바로 한 번). download() 받기 시작, install() 재시작하며 설치 */
  update: {
    onChange: cb => { ipcRenderer.on('upd:changed', (_e, st) => cb(st)); ipcRenderer.invoke('upd:state').then(st => { if (st) cb(st); }); },
    download: () => ipcRenderer.invoke('upd:download'),
    install: () => ipcRenderer.invoke('upd:install'),
  },
  dec: { open: async o => ff.decOpen(o), read: id => ff.decRead(id), close: async id => ff.decClose(id) },
  exp: {
    /** 저장 위치를 묻고(취소하면 canceled) 인코더 시작 */
    begin: async o => { const out = await ipcRenderer.invoke('exp:dialog', o.name); return out ? ff.expBegin(o, out) : { canceled: true }; },
    frame: data => ff.expFrame(data),
    end: cancel => ff.expEnd(cancel),
  },
});
