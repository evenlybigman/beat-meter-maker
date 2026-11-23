// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 공통 도구: DOM 조회, 시간 표시, 알림, 이진 탐색, 다운로드

// 요소 조회. 입력칸·버튼 등 다양한 요소를 그대로 다루기 위해 any로 둠
export const $ = (s: string): any => document.querySelector(s);

/* ---------- 유틸 ---------- */
export const fmt = (t: number) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };
export const fmtShort = (t: number) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t - m * 60); return m + ':' + String(s).padStart(2, '0'); };
/* ---------- 기록 (진단 정보용) ---------- 최근 200건, 같은 내용이 이어지면 횟수만 늘림 */
export interface LogEntry { t: string; kind: 'error' | 'warn' | 'toast' | 'info'; msg: string; n: number }
export const LOG: LogEntry[] = [];
export function logEvent(kind: LogEntry['kind'], msg: string) {
  msg = String(msg).slice(0, 2000);
  const last = LOG[LOG.length - 1];
  if (last && last.kind === kind && last.msg === msg) { last.n++; return; }
  LOG.push({ t: new Date().toISOString(), kind, msg, n: 1 });
  if (LOG.length > 200) LOG.shift();
}
let toastTimer = 0;
export function toast(msg: string, ms = 2200) {
  logEvent('toast', msg); const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove('on'), ms); }
export function status(msg: string) { $('#status').textContent = msg; }
export function upperBound(arr: number[], t: number) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] > t) hi = m; else lo = m + 1; } return lo; }
export function lowerBound(arr: number[], t: number) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }
export function download(blob: Blob, name: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
/** catch로 받은 값(무엇이든 올 수 있음)의 오류 메시지 */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function baseName(n: string) { return (n || 'project').replace(/\.[^.]+$/, ''); }
