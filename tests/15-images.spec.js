// 시나리오 41: 이미지 클립 — 불러오기(GIF는 첫 장면, HEIC는 안내), 타임라인·미리보기, 기본 길이, 영상 전용 칸 숨김, 클립 편집, 저장
const { test, expect, SONG, loadMusic } = require('./helpers');
const { FX } = require('./helpers');

const COLOR = (fx, fy) => `(() => {
  const c = document.getElementById('view'), d = c.getContext('2d').getImageData(Math.round(c.width * ${fx}), Math.round(c.height * ${fy}), 1, 1).data;
  const hi = v => v > 150, lo = v => v < 90;
  return hi(d[0]) && lo(d[1]) && lo(d[2]) ? 'red' : lo(d[0]) && lo(d[1]) && hi(d[2]) ? 'blue' : lo(d[0]) && hi(d[1]) && lo(d[2]) ? 'green' : d.slice(0, 3).join(',');
})()`;
const waitColor = (app, fx, fy, c) => expect.poll(() => app.E(COLOR(fx, fy)), { timeout: 10_000 }).toBe(c);

test('41. 이미지 클립: 불러오기·자동 배치·미리보기, GIF 첫 장면, HEIC 안내, 기본 길이, 영상 전용 칸 숨김, 클립 편집, 저장', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await page.setInputFiles('#fClips', ['halves.png', 'green.jpg', 'anim.gif', 'photo.heic', 'v1.mp4'].map(FX));
  await expect(page.locator('#toast')).toContainText('HEIC');
  await page.waitForFunction(() => S.clips.length === 4 && S.clips.every(c => c.dur > 0));
  expect(await app.E('S.clips.map(c => [c.name, !!c.image, c.dur])')).toEqual([['halves.png', true, 2], ['green.jpg', true, 2], ['anim.gif', true, 2], ['v1.mp4', false, await app.E('S.clips[3].dur')]]);
  await expect(page.locator('#clipList li').nth(0).locator('.badge', { hasText: '이미지' })).toBeVisible();
  // 빈 타임라인이면 순서대로 자동 배치: 이미지는 기본 길이 2초씩
  expect(await app.E('S.tracks[0].slice(0, 3).map(g => [g.srcName, g.start, g.end])')).toEqual([['halves.png', 0, 2], ['green.jpg', 2, 4], ['anim.gif', 4, 6]]);

  // 미리보기: PNG 왼쪽 빨강·오른쪽 파랑, JPG 초록, GIF는 시간이 지나도 첫 장면(빨강)
  await app.E(`S.set.fit = 'cover'; seek(0.5)`);
  await waitColor(app, 0.25, 0.5, 'red'); await waitColor(app, 0.75, 0.5, 'blue');
  await app.E('seek(2.5)'); await waitColor(app, 0.5, 0.5, 'green');
  await app.E('seek(4.2)'); await waitColor(app, 0.5, 0.5, 'red');
  await page.waitForTimeout(700);
  expect(await app.E(COLOR(0.5, 0.5))).toBe('red');

  // 소스 탭: 이미지면 사용 구간 대신 기본 길이, 속도 칸 숨김
  await page.locator('#clipList li').nth(0).click();
  await expect(page.locator('#imgLen')).toBeVisible();
  await expect(page.locator('#trimIn')).toBeHidden();
  await expect(page.locator('#trimVid')).toBeHidden();
  await expect(page.locator('#fxRate')).toBeHidden();
  await page.fill('#imgLen', '3.5'); await page.locator('#imgLen').blur();
  expect(await app.E('S.clips[0].dur')).toBe(3.5);
  await expect(page.locator('#clipList li').nth(0).locator('.d')).toHaveText('3.5초');
  // A로 넣으면 3.5초
  await app.E('seek(20)');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('a');
  expect(await app.E('[S.selItem.srcName, +(S.selItem.end - S.selItem.start).toFixed(2)]')).toEqual(['halves.png', 3.5]);
  // 조각 편집: 원본 시작·소리·속도 칸 숨김, 위치·회전은 보임
  await page.click('.tabs button[data-tab="tCut"]');
  await expect(page.locator('#segOff')).toBeHidden();
  await expect(page.locator('#segVol')).toBeHidden();
  await expect(page.locator('#segRate')).toBeHidden();
  await expect(page.locator('#segRot')).toBeVisible();
  // 이미지 조각은 앞쪽으로도 마음대로 늘릴 수 있음 (영상은 원본 맨 앞까지)
  await page.fill('#segStart', '19'); await page.locator('#segStart').blur();
  expect(await app.E('S.selItem.start')).toBe(19);

  // 클립 기본 편집(회전 90°)이 이미지에도 → 위 빨강·아래 파랑
  await page.click('.tabs button[data-tab="tSrc"]');
  await page.click('#fxRot button[data-rot="90"]');
  await app.E('seek(0.5)');
  await waitColor(app, 0.5, 0.1, 'red'); await waitColor(app, 0.5, 0.7, 'blue');

  // 저장: 이미지 기본 길이·편집
  const d = await app.E('projectData()');
  expect(d.trims.find(t => t.name === 'halves.png')).toMatchObject({ len: 3.5, fx: { rot: 90 } });
  expect(d.trims.find(t => t.name === 'v1.mp4').len).toBeUndefined();

  // 랜덤 채우기에도 이미지가 쓰임
  await page.click('.tabs button[data-tab="tCut"]');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('f');
  expect(await app.E('S.tracks[0].some(g => g.src && g.src.image)')).toBe(true);
});
