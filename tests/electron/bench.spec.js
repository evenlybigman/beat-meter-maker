// 속도 측정 (자동 테스트에서는 건너뜀): BMM_BENCH=<1080p 영상 경로> npm run test:app -- bench
const { test } = require('./helpers');
const fs = require('fs');
test('bench', async ({ desk }) => {
  test.skip(!process.env.BMM_BENCH, 'BMM_BENCH가 없으면 건너뜀');
  const a = await desk.launch();
  await a.page.setInputFiles('#fMusic', [require('./helpers').FX('bpm128_sil3_2.ogg')]);
  await a.page.waitForFunction(() => S.songs.length === 1, null, { timeout: 30000 });
  await a.page.setInputFiles('#fClips', [process.env.BMM_BENCH]);
  await a.page.waitForFunction(() => S.clips.filter(c => c.dur > 0).length === 1);
  for (const [res, lay] of [['1920x1080', '1'], ['1920x1080', '3h'], ['1280x720', '1']]) {
    await a.E(`window.__lastExport=null; S.set.durMode='manual'; S.set.durSec=10; S.set.res='${res}'; S.set.layout='${lay}'; S.set.fps=30;`);
    await a.E(`document.querySelector('#btnExport').click()`);
    await a.page.waitForFunction(() => window.__lastExport, null, { timeout: 110000 });
        console.log(res, lay, await a.E('JSON.stringify(window.__lastExport)'));
  }
});
