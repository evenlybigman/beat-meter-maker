// 공통 도구: 페이지 열기, 페이지 오류 수집, 미디어 불러오기, 상태 읽기
const path = require('path');
const { test: base, expect } = require('@playwright/test');

const APP = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');   // npm run build 결과물을 테스트
const FX = name => path.resolve(__dirname, 'fixtures', name);
const SONG = { s97: 'bpm097_5_sil7_4.ogg', s128: 'bpm128_sil3_2.ogg', s140: 'bpm140_sil1_5.ogg' };

// 모든 테스트: 페이지 오류(예외)가 하나라도 나면 실패
const test = base.extend({
  app: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(APP);
    await use({ page, errors, E: expr => page.evaluate(expr) });
    expect(errors, '페이지 오류 없음').toEqual([]);
  },
});

async function loadMusic(app, files) {
  const before = await app.E('S.songs.length');
  await app.page.setInputFiles('#fMusic', files.map(FX));
  await app.page.waitForFunction(n => S.songs.length >= n, before + files.length, { timeout: 30_000 });
}
async function loadClips(app, files) {
  const before = await app.E('S.clips.filter(c => c.dur > 0).length');
  await app.page.setInputFiles('#fClips', files.map(FX));
  await app.page.waitForFunction(n => S.clips.filter(c => c.dur > 0).length >= n, before + files.length, { timeout: 30_000 });
}
// 트랙 k의 조각 요약 [클립명, 시작, 끝]
const track = (app, k = 0) => app.E(`S.tracks[${k}].map(g => [g.srcName, +g.start.toFixed(3), +g.end.toFixed(3)])`);

module.exports = { test, expect, APP, FX, SONG, loadMusic, loadClips, track };
