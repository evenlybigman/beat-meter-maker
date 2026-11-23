// 메모리 측정 (자동 테스트에서는 건너뜀): BMM_MEM=<측정용 미디어 폴더> npm run test:app -- memory
// 폴더에 long.ogg(10분 음악), big.mp4(3분 1080p 영상), c1~c6.mp4(30초 720p 클립)가 있어야 함
const path = require('path');
const { test } = require('./helpers');
const M = n => path.join(process.env.BMM_MEM || '', n);
async function mem(a, label) {
  await a.page.waitForTimeout(1500);
  const r = await a.E(`(async () => { const m = await bmm.memory(), all = await bmm.metrics();
    return { ...m, totalMB: Math.round(all.reduce((s, x) => s + x.workingSetKB, 0) / 1024), vids: document.querySelectorAll('video').length,
             jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }; })()`);
  if (process.env.BMM_MEM_DETAIL) console.log((await a.E('bmm.metrics()')).map(m => `${m.type}${m.name ? '(' + m.name + ')' : ''} ${Math.round(m.workingSetKB / 1024)}MB`).join(' · '));
  console.log(label.padEnd(28), `renderer ${Math.round(r.privateKB / 1024)}MB · JS heap ${r.jsHeapMB}MB · 앱 전체 ${r.totalMB}MB · video ${r.vids}개`);
  return r;
}
test('memory', async ({ desk }) => {
  test.skip(!process.env.BMM_MEM, 'BMM_MEM이 없으면 건너뜀');
  test.setTimeout(400_000);
  const a = await desk.launch();
  await mem(a, '시작');
  await a.page.setInputFiles('#fMusic', [M('long.ogg')]);
  await a.page.waitForFunction(() => S.songs.length === 1, null, { timeout: 120000 });
  await mem(a, '10분 음악');
  const t0 = Date.now();
  await a.page.setInputFiles('#fMusic', [M('big.mp4')]);
  let peak = 0;
  while (!(await a.E('S.songs.length === 2'))) { const m = await a.E('bmm.memory()'); peak = Math.max(peak, m.privateKB); await a.page.waitForTimeout(200); }
  console.log('영상(137MB)→음악 최고'.padEnd(28), `renderer ${Math.round(peak / 1024)}MB, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  await mem(a, '영상→음악 끝');
  await a.page.setInputFiles('#fClips', [1, 2, 3, 4, 5, 6].map(i => M(`c${i}.mp4`)));
  await a.page.waitForFunction(() => S.clips.filter(c => c.dur > 0).length === 6, null, { timeout: 60000 });
  await a.E(`S.set.layout = '4'; document.querySelector('#btnFill') && 0`);
  await a.E(`(() => { const base = { kind: 'video', x: 0, y: 0, zoom: 1, flip: false, vol: 0, rate: 1 };
    S.tracks = [0, 1, 2, 3].map(k => Array.from({ length: 40 }, (_, i) => { const c = S.clips[(i + k) % 6];
      return { ...base, src: c, srcName: c.name, start: i * 3, end: i * 3 + 3, off: (i * 7 + k * 3) % 25 }; }));
    refreshTimeline(); })()`);
  await mem(a, '클립 6개 + 4분할 배치');
  await a.E(`seek(0)`); await a.page.click('#btnPlay');
  for (let s = 0; s < 6; s++) { await a.page.waitForTimeout(4000); await a.E(`seek(${s * 19 + 5})`); }
  await mem(a, '4분할 재생·탐색 25초');
  await a.page.click('#btnPlay');
  // 자동 저장 한 번에 걸리는 시간 (사용자 비트 소리 2.5MB 포함)
  await a.E(`(() => { const b64 = btoa(String.fromCharCode(...new Uint8Array(1024))).repeat(2500); SND.list.push({ id: 'cx', name: 'big', buf: null, b64, custom: true }); })()`);
  const ms = await a.E(`(() => { const t = performance.now(); for (let i = 0; i < 10; i++) JSON.stringify(projectData()); return (performance.now() - t) / 10; })()`);
  console.log('자동 저장 비교 1회'.padEnd(28), `${ms.toFixed(1)}ms (2초마다)`);
});
