// 시나리오 29: 영상 회전(90도 단위)과 기울기 — 버튼·단축키 O·되돌리기·미리보기 화면
const { test, expect, SONG, loadMusic, loadClips } = require('./helpers');

// 미리보기 캔버스의 (가로 비율, 세로 비율) 위치 색 → 'red' | 'blue' | 'black' | 기타
const COLOR = (fx, fy) => `(() => {
  const c = document.getElementById('view'), d = c.getContext('2d').getImageData(Math.round(c.width * ${fx}), Math.round(c.height * ${fy}), 1, 1).data;
  const hi = v => v > 150, lo = v => v < 90;
  return hi(d[0]) && lo(d[1]) && lo(d[2]) ? 'red' : lo(d[0]) && lo(d[1]) && hi(d[2]) ? 'blue' : lo(d[0]) && lo(d[1]) && lo(d[2]) ? 'black' : d.slice(0, 3).join(',');
})()`;
const waitColor = (app, fx, fy, c) => expect.poll(() => app.E(COLOR(fx, fy)), { timeout: 10_000 }).toBe(c);

test('29. 회전 버튼·단축키 O·기울기 슬라이더, 되돌리기, 미리보기에 반영 (기울인 귀퉁이는 검게)', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['halves.mp4']);   // 왼쪽 빨강 · 오른쪽 파랑
  await app.E(`S.set.fit = 'cover'; seek(1)`);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('a');          // 현재 위치에 추가 → 선택됨
  await page.click('.tabs button[data-tab="tCut"]');
  expect(await app.E('[S.selItem.kind, S.selItem.rot, S.selItem.tilt]')).toEqual(['video', 0, 0]);
  await app.E(`seek(S.selItem.start + 0.5)`);
  await waitColor(app, 0.25, 0.5, 'red');  // 돌리기 전: 왼쪽 빨강, 오른쪽 파랑
  await waitColor(app, 0.75, 0.5, 'blue');

  // 90도 버튼 → 위 빨강, 아래 파랑 (시계 방향)
  await page.click('#segRot button[data-rot="90"]');
  expect(await app.E('S.selItem.rot')).toBe(90);
  await expect(page.locator('#segRot button[data-rot="90"]')).toHaveClass(/on/);
  await waitColor(app, 0.5, 0.1, 'red');
  await waitColor(app, 0.5, 0.7, 'blue');   // 아래쪽 끝은 비트 바가 겹쳐서 피함

  // 단축키 O → 180도: 왼쪽 파랑, 오른쪽 빨강
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('o');
  expect(await app.E('S.selItem.rot')).toBe(180);
  await waitColor(app, 0.25, 0.5, 'blue');
  // 되돌리기 → 90도
  await page.keyboard.press('Control+z');
  expect(await app.E('S.selItem.rot')).toBe(90);
  await expect(page.locator('#segRot button[data-rot="90"]')).toHaveClass(/on/);

  // 기울기 슬라이더: 0도로 되돌린 뒤 15도 → 귀퉁이 검정, 가운데는 영상
  await page.click('#segRot button[data-rot="0"]');
  await waitColor(app, 0.02, 0.03, 'red');                     // 안 기울이면 귀퉁이도 영상
  await page.locator('#segTilt').fill('15');
  expect(await app.E('S.selItem.tilt')).toBe(15);
  await expect(page.locator('#vTilt')).toHaveText('15°');
  await waitColor(app, 0.02, 0.03, 'black');
  await waitColor(app, 0.25, 0.5, 'red');

  // 위치 초기화 → 회전·기울기도 0
  await page.click('#btnSegReset');
  expect(await app.E('[S.selItem.rot, S.selItem.tilt]')).toEqual([0, 0]);
  // 저장 형식에 들어감 (예전 파일에 없으면 0)
  await app.E('S.selItem.rot = 270; S.selItem.tilt = -7');
  const f = await app.E('projectData().tracks[0][S.tracks[0].indexOf(S.selItem)]');
  expect([f.rot, f.tilt]).toEqual([270, -7]);
});
