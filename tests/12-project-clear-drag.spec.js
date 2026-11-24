// 시나리오 34~36: 새 프로젝트, 조각 전체 삭제, 클립 목록 끌어서 여러 개 선택·타임라인에 놓기
const { test, expect, SONG, loadMusic, loadClips } = require('./helpers');

test('34. 새 프로젝트: 확인 후 음악·클립·비트·조각·설정·편집 기록을 모두 비움, 취소하면 그대로', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4']);
  await app.E('S.set.layout = "2h"; S.set.beatVol = 0.3');
  expect(await app.E('S.beats.length')).toBeGreaterThan(10);
  page.once('dialog', d => d.dismiss());                       // 취소
  await page.click('#btnNew');
  expect(await app.E('S.clips.length')).toBe(2);
  page.once('dialog', d => d.accept());
  await page.click('#btnNew');
  expect(await app.E('[S.songs.length, S.clips.length, S.beats.length, S.audio.length, S.tracks.flat().length, S.set.layout, S.set.beatVol, S.selItem]'))
    .toEqual([0, 0, 0, 0, 0, '1', 0.8, null]);
  await expect(page.locator('#clipList li')).toHaveCount(0);
  await expect(page.locator('#tlUndo')).toBeDisabled();         // 편집 기록도 비움
  // 빈 상태에서는 묻지 않고 바로
  let asked = false; page.once('dialog', d => { asked = true; d.accept(); });
  await page.click('#btnNew');
  expect(asked).toBe(false);
  // 새 프로젝트에 다시 불러오기 정상
  await loadClips(app, ['v3.mp4']);
  expect(await app.E('S.clips.map(c => c.name)')).toEqual(['v3.mp4']);
});

test('35. 전체 삭제: 모든 화면의 영상 조각을 지우고 음악은 그대로, Ctrl+Z로 복원 / 편집 탭의 추가 버튼·설명 없음', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await page.click('.tabs button[data-tab="tLay"]');
  await page.locator('#lays button', { hasText: '좌우 2분할' }).click();
  const n = await app.E('S.tracks.flat().length');
  expect(n).toBeGreaterThan(3);
  await page.click('#tlClear');
  expect(await app.E('[S.tracks.length, S.tracks.flat().length, S.audio.length]')).toEqual([2, 0, 1]);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  expect(await app.E('S.tracks.flat().length')).toBe(n);
  // 편집 탭: A·Q·E 추가 버튼과 긴 설명은 없앰 (타임라인 도구 막대에 있음)
  await page.click('.tabs button[data-tab="tCut"]');
  await expect(page.locator('#tCut')).not.toContainText('끝에 이어 붙이기');
  await expect(page.locator('#tCut')).not.toContainText('클립 목록에서 타임라인으로 끌어다');
  await expect(page.locator('#tlAppend')).toBeVisible();
});

test('36. 클립 목록 끌기: 위아래로 끌면 여러 개 선택(Ctrl이면 더하기), 고른 클립을 끌어 타임라인에 놓으면 그 자리에 순서대로', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await app.E('S.tracks[0] = []; S.zoom = 40; seek(0.01); refreshTimeline()');
  const li = i => page.locator('#clipList li').nth(i);
  const mid = async i => { const b = await li(i).boundingBox(); return [b.x + b.width * 0.35, b.y + b.height / 2]; };
  const names = () => app.E('S.clips.filter(c => S.selClips.includes(c)).map(c => c.name)');

  // 1번에서 3번까지 끌기 → 셋 다
  let [x, y] = await mid(0); await page.mouse.move(x, y); await page.mouse.down();
  [x, y] = await mid(2); await page.mouse.move(x, y, { steps: 6 }); await page.mouse.up();
  expect(await names()).toEqual(['v1.mp4', 'v2.mp4', 'v3.mp4']);
  // 끝난 뒤 클릭으로 바뀌지 않음, 그냥 클릭하면 하나만
  await li(1).click();
  expect(await names()).toEqual(['v2.mp4']);
  // Ctrl을 누른 채 끌면 더하기: v2 + (v3)
  [x, y] = await mid(2); await page.keyboard.down('Control'); await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 12, { steps: 3 }); await page.mouse.up(); await page.keyboard.up('Control');
  expect(await names()).toEqual(['v2.mp4', 'v3.mp4']);

  // 고른 것 중 하나를 끌어 타임라인 10초 자리에 놓기 → v2, v3가 이어서
  const sb = await page.locator('#strip').boundingBox();
  [x, y] = await mid(1); await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 64 + 26 + 16, { steps: 10 });
  await expect(page.locator('#clipGhost')).toHaveText('클립 2개');
  await page.mouse.move(sb.x + sb.width * 10 / 40, sb.y + 64 + 26 + 16, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#clipGhost')).toBeHidden();
  const t = await app.E('S.tracks[0].map(g => [g.srcName, +g.start.toFixed(2), +g.end.toFixed(2)])');
  expect(t.map(r => r[0])).toEqual(['v2.mp4', 'v3.mp4']);
  expect(Math.abs(t[0][1] - 10)).toBeLessThan(0.2);
  expect(t[1][1]).toBeCloseTo(t[0][2], 2);
  expect(await names()).toEqual(['v2.mp4', 'v3.mp4']);        // 옮길 때 선택은 그대로

  // 타임라인 밖에 놓으면 아무것도 안 넣음
  [x, y] = await mid(1); await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(700, 120, { steps: 8 }); await page.mouse.up();
  expect(await app.E('S.tracks[0].length')).toBe(2);
});
