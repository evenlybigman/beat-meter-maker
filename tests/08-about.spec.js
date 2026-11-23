// 시나리오 24: 정보 창 — 저작자·버전·라이선스, 비어 있는 링크는 숨김, https 주소만 링크로
const { test, expect } = require('./helpers');

test('24. 정보 창: Juke·버전·GPL 안내, 소스 저장소 링크, 후원 링크는 설정했을 때만 (https만)', async ({ app }) => {
  const { page } = app;
  await page.click('#btnAbout');
  const box = page.locator('#about');
  await expect(box).toBeVisible();
  await expect(page.locator('#aboutAuthor')).toHaveText('Juke');
  await expect(page.locator('#aboutVer')).toHaveText('v' + require('../package.json').version);
  await expect(page.locator('#aboutLicense')).toContainText('GNU 일반 공중 사용 허가서');
  await expect(page.locator('#aboutLicense')).toContainText('어떠한 보증도 하지 않습니다');
  await expect(page.locator('#aboutDonate')).toHaveCount(0);      // 아직 정하지 않은 링크는 숨김
  await expect(page.locator('#aboutSource a')).toHaveAttribute('href', 'https://github.com/evenlybigman/beat-meter-maker');
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();

  // 링크를 채우면 나타남, 새 창으로 열림
  await app.E(`Object.assign(APP_INFO, { sourceUrl: 'https://github.com/juke/beat-meter-maker', donateUrl: 'https://example.com/juke' })`);
  await page.click('#btnAbout');
  await expect(page.locator('#aboutDonate')).toHaveAttribute('href', 'https://example.com/juke');
  await expect(page.locator('#aboutDonate')).toHaveAttribute('target', '_blank');
  await expect(page.locator('#aboutSource a')).toHaveAttribute('href', 'https://github.com/juke/beat-meter-maker');
  await expect(page.locator('#about a', { hasText: '함께 들어가는 프로그램 안내' })).toHaveAttribute('href', 'https://github.com/juke/beat-meter-maker/blob/main/THIRD_PARTY_NOTICES.md');
  await page.click('#aboutClose');

  // https가 아닌 주소(javascript: 등)는 링크로 만들지 않음
  await app.E(`Object.assign(APP_INFO, { sourceUrl: 'javascript:alert(1)', donateUrl: 'http://example.com' })`);
  await app.E('openAbout()');
  await expect(page.locator('#aboutDonate')).toHaveCount(0);
  await expect(page.locator('#aboutSource')).toHaveCount(0);
  await page.locator('#about').click({ position: { x: 5, y: 5 } });   // 바깥을 누르면 닫힘
  await expect(box).toBeHidden();
});
