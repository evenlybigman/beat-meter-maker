// 시나리오 37~38: 클립 기본 편집 — 클립에 걸면 그 클립의 조각 전부에, 여러 클립 한 번에, 되돌리기, 저장·불러오기, 속도
const fs = require('fs'), os = require('os'), path = require('path');
const { test, expect, APP, FX, SONG, loadMusic, loadClips } = require('./helpers');

const COLOR = (fx, fy) => `(() => {
  const c = document.getElementById('view'), d = c.getContext('2d').getImageData(Math.round(c.width * ${fx}), Math.round(c.height * ${fy}), 1, 1).data;
  const hi = v => v > 150, lo = v => v < 90;
  return hi(d[0]) && lo(d[1]) && lo(d[2]) ? 'red' : lo(d[0]) && lo(d[1]) && hi(d[2]) ? 'blue' : Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]) < 30 && Math.max(d[0], d[1], d[2]) > 30 ? 'gray' : lo(d[0]) && lo(d[1]) && lo(d[2]) ? 'black' : d.slice(0, 3).join(',');
})()`;
const waitColor = (app, fx, fy, c) => expect.poll(() => app.E(COLOR(fx, fy)), { timeout: 10_000 }).toBe(c);
const piece = (cl, s, e) => `{ kind: 'video', src: ${cl}, srcName: ${cl}.name, start: ${s}, end: ${e}, off: 0, rate: 1, vol: 0, x: 0, y: 0, zoom: 1, flip: false, rot: 0, tilt: 0 }`;

test('37. 클립 기본 편집: 그 클립의 조각 전부에 적용(조각 회전과 더해짐), 여러 클립 한 번에, 되돌리기, 랜덤 채우기, 목록 배지', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['halves.mp4', 'v1.mp4', 'v2.mp4']);   // halves: 왼쪽 빨강 · 오른쪽 파랑
  await app.E(`(() => { const h = S.clips[0]; S.set.fit = 'cover'; S.tracks[0] = [${piece('h', 0, 2)}, ${piece('h', 2, 4)}]; refreshTimeline(); seek(0.5); })()`);
  await page.locator('#clipList li').nth(0).click();
  await waitColor(app, 0.25, 0.5, 'red');

  // 클립 회전 90° → 두 조각 모두 위 빨강·아래 파랑
  await page.click('#fxRot button[data-rot="90"]');
  expect(await app.E('S.clips[0].fx.rot')).toBe(90);
  await waitColor(app, 0.5, 0.1, 'red'); await waitColor(app, 0.5, 0.7, 'blue');
  await app.E('seek(2.5)');
  await waitColor(app, 0.5, 0.1, 'red');
  await expect(page.locator('#clipList li').nth(0).locator('.badge', { hasText: '편집' })).toBeVisible();
  // 조각에 준 회전 90°가 더해져 180° → 왼쪽 파랑
  await app.E('S.tracks[0][1].rot = 90');
  await waitColor(app, 0.25, 0.5, 'blue');
  await app.E('S.tracks[0][1].rot = 0; seek(0.5)');

  // 되돌리기 → 회전 없음
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  expect(await app.E('S.clips[0].fx.rot')).toBe(0);
  await waitColor(app, 0.25, 0.5, 'red');
  await expect(page.locator('#fxRot button[data-rot="0"]')).toHaveClass(/on/);
  await page.keyboard.press('Control+Shift+z');
  expect(await app.E('S.clips[0].fx.rot')).toBe(90);

  // 자르기: 오른쪽 50% 잘라 내고 회전 0 → 빨강만 (양쪽 다 빨강)
  await page.click('#fxRot button[data-rot="0"]');
  await page.locator('#fxCropR').fill('45');
  await waitColor(app, 0.8, 0.5, 'red');
  // 채도 0 → 회색
  await page.locator('#fxSat').fill('0');
  await waitColor(app, 0.5, 0.5, 'gray');
  // 기본값으로
  await page.click('#fxReset');
  expect(await app.E('JSON.stringify(S.clips[0].fx)')).toBe(JSON.stringify({ rot: 0, flipH: false, flipV: false, crop: [0, 0, 0, 0], zoom: 1, bri: 100, con: 100, sat: 100, rate: 1 }));
  await waitColor(app, 0.75, 0.5, 'blue');

  // 여러 클립 한 번에: v1·v2 골라 좌우 반전·속도 2배
  await page.locator('#clipList li').nth(1).click();
  await page.locator('#clipList li').nth(2).click({ modifiers: ['Shift'] });
  await expect(page.locator('#fxTarget')).toHaveText('고른 클립 2개에 적용');
  await page.check('#fxFlipH');
  await page.selectOption('#fxRate', '2');
  expect(await app.E('S.clips.map(c => [c.fx.flipH, c.fx.rate])')).toEqual([[false, 1], [true, 2], [true, 2]]);

  // 속도 2배: 새로 넣는 조각 길이는 절반, 재생 위치는 2배로 감
  await app.E('S.tracks[0] = []; refreshTimeline(); seek(0)');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('a');
  const [len, dur] = await app.E('[S.tracks[0][0].end - S.tracks[0][0].start, S.clips[1].dur]');
  expect(len).toBeCloseTo(dur / 2, 1);
  await app.E('seek(1)');
  await expect.poll(() => app.E(`(() => { const v = [...document.querySelectorAll('#vids video')].find(v => v.src === S.clips[1].url); return v ? Math.round(v.currentTime * 10) / 10 : -1; })()`)).toBeCloseTo(2, 0);
  // 랜덤 채우기로 새로 생긴 조각에도 클립 편집이 그대로 (조각 자체 값은 기본)
  await page.keyboard.press('f');
  expect(await app.E('S.tracks[0].every(g => g.rot === 0 && !g.flip)')).toBe(true);
});

test('38. 클립 기본 편집 저장·불러오기 (기본값이면 파일에 안 넣음, 잘못된 값은 정리)', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4']);
  await app.E(`Object.assign(S.clips[0].fx, { rot: 270, flipV: true, crop: [0.1, 0, 0.2, 0], zoom: 1.5, bri: 120, con: 90, sat: 0, rate: 0.5 })`);
  const d = await app.E('projectData()');
  expect(d.trims[0].fx).toEqual({ rot: 270, flipH: false, flipV: true, crop: [0.1, 0, 0.2, 0], zoom: 1.5, bri: 120, con: 90, sat: 0, rate: 0.5 });
  expect(d.trims[1].fx).toBeUndefined();
  d.trims[1].fx = { rot: 30, crop: [2, -1], zoom: 99, bri: 'x', rate: 100 };    // 잘못된 값
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bmm-')), 'p.json'); fs.writeFileSync(f, JSON.stringify(d));
  const p2 = await page.context().newPage(); await page.close({ runBeforeUnload: false });
  await p2.goto(APP);
  await p2.setInputFiles('#fProj', f);
  await p2.setInputFiles('#fClips', ['v1.mp4', 'v2.mp4'].map(FX));
  await p2.waitForFunction(() => S.clips.length === 2 && S.clips.every(c => c.dur > 0));
  expect(await p2.evaluate('S.clips[0].fx')).toEqual(d.trims[0].fx);
  expect(await p2.evaluate('S.clips[1].fx')).toEqual({ rot: 0, flipH: false, flipV: false, crop: [0.45, 0, 0, 0], zoom: 3, bri: 100, con: 100, sat: 100, rate: 4 });
});
