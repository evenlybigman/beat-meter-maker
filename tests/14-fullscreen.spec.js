// 시나리오 40: 미리보기 전체 화면 — 버튼·Ctrl+F·더블클릭으로 열고 닫기, 막대 자동 숨김, 전체 화면에서 재생·재생 바
const { test, expect, SONG, loadMusic, loadClips } = require('./helpers');

const full = app => app.E('document.fullscreenElement ? document.fullscreenElement.id : null');

test('40. 미리보기 전체 화면: 버튼·Ctrl+F·더블클릭, 재생·재생 바·나가기, 2초 지나면 막대 숨김', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4']);
  await expect(page.locator('#fsBar')).toBeHidden();

  // 버튼으로 열기 → 막대 보임, 캔버스가 화면을 채움
  await page.click('#btnFull');
  await expect.poll(() => full(app)).toBe('stage');
  await expect(page.locator('#fsBar')).toBeVisible();
  const [cw, vw] = await app.E('[document.getElementById("view").getBoundingClientRect().width, innerWidth]');
  expect(cw).toBeGreaterThan(vw * 0.9);

  // 전체 화면에서 Space로 재생, 시간·재생 버튼이 따라옴
  await page.mouse.move(200, 200);
  await page.keyboard.press('Space');
  await expect(page.locator('#fsPlay')).toContainText('정지');
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await expect(page.locator('#fsTime')).not.toHaveText(/^0:00\.00/);
  // 재생 바로 이동
  await page.locator('#fsSeek').fill('500');
  expect(await app.E('Math.abs(now() - projDur() / 2) < 0.5')).toBe(true);

  // 2초 동안 마우스를 안 움직이면 막대·커서 숨김, 움직이면 다시
  await page.waitForTimeout(2300);
  await expect(page.locator('#stage')).toHaveClass(/idle/);
  await page.mouse.move(300, 300);
  await expect(page.locator('#stage')).not.toHaveClass(/idle/);

  // 나가기 버튼
  await page.click('#fsExit');
  await expect.poll(() => full(app)).toBe(null);
  await expect(page.locator('#fsBar')).toBeHidden();

  // Ctrl+F로 열고 닫기 (랜덤 채우기 F는 그대로)
  const before = await app.E('S.tracks[0].length');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+f');
  await expect.poll(() => full(app)).toBe('stage');
  expect(await app.E('S.tracks[0].length')).toBe(before);   // 채우기 안 됨
  await page.keyboard.press('Control+f');
  await expect.poll(() => full(app)).toBe(null);

  // 미리보기 더블클릭으로 열고 닫기
  await page.locator('#view').dblclick();
  await expect.poll(() => full(app)).toBe('stage');
  await page.locator('#view').dblclick();
  await expect.poll(() => full(app)).toBe(null);
});
