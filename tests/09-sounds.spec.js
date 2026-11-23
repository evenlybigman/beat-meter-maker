// 시나리오 27: 기본 비트 소리 '하우스 킥 (DWSD)' — 목록·재생·프로젝트 저장·저작자 표시
const { test, expect, SONG, loadMusic } = require('./helpers');

test('27. 기본 소리에 하우스 킥: 목록에 있고 고르면 재생, 프로젝트에는 따로 저장 안 됨, 정보 창에 저작자 표시', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);                     // 오디오가 준비되면 기본 소리가 만들어짐
  await page.click('[data-tab="tBeat"]');
  await expect(page.locator('#sndSel optgroup[label="기본 소리"] option[value="housekick"]')).toHaveText('하우스 킥 (DWSD)');
  const info = await app.E(`(() => { const s = SND.list.find(x => x.id === 'housekick'); return s && { ch: s.buf.numberOfChannels, sr: s.buf.sampleRate, dur: Math.round(s.buf.duration * 100) / 100, peak: Math.max(...s.buf.getChannelData(0).map(Math.abs)), custom: !!s.custom }; })()`);
  expect(info).toEqual({ ch: 1, sr: 44100, dur: 0.48, peak: expect.any(Number), custom: false });
  expect(info.peak).toBeGreaterThan(0.8);                // 소리가 실제로 들어 있음 (빈 버퍼 아님)
  await page.selectOption('#sndSel', 'housekick');
  expect(await app.E('S.set.beatSound')).toBe('housekick');
  expect(await app.E('curSnd().id')).toBe('housekick');
  await expect(page.locator('#sndDel')).toBeDisabled();  // 기본 소리는 지울 수 없음
  await page.click('#sndPlay');                          // 미리 듣기 (오류 없이)
  const d = await app.E('projectData()');
  expect(d.set.beatSound).toBe('housekick');
  expect(d.sounds.map(x => x.id)).not.toContain('housekick');   // 기본 소리라 파일에 넣지 않음
  await page.click('#btnAbout');
  await expect(page.locator('#aboutCredits')).toContainText('Dan Wray');
  await expect(page.locator('#aboutCredits a', { hasText: 'CC BY 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0/');
});
