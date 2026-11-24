// 시나리오 31~32: 여러 개 선택 — 클립 목록, 타임라인 조각
const { test, expect, SONG, loadMusic, loadClips } = require('./helpers');

const names = app => app.E('S.clips.filter(c => S.selClips.includes(c)).map(c => c.name)');
const items = app => app.E('S.tracks[0].map(g => [g.srcName, +g.start.toFixed(3), +g.end.toFixed(3)])');
const selIdx = app => app.E('S.tracks[0].map((g, i) => (S.selItems.length > 1 && S.selItems.includes(S.selItem) ? S.selItems : [S.selItem]).includes(g) ? i : -1).filter(i => i >= 0)');
const key = async (app, k) => { await app.page.locator('body').click({ position: { x: 5, y: 5 } }); await app.page.keyboard.press(k); };

test('31. 클립 여러 개 선택: Ctrl·Shift 클릭, A·E로 순서대로 한 번에 넣기, 되돌리기 한 번, 랜덤 채우기에 선택한 클립만, 한꺼번에 삭제', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  const li = i => page.locator('#clipList li').nth(i);
  await expect(page.locator('#clipSelTxt')).toContainText('Ctrl+클릭');   // 안내

  await li(0).click();
  await li(2).click({ modifiers: ['Control'] });
  expect(await names(app)).toEqual(['v1.mp4', 'v3.mp4']);
  await expect(page.locator('#clipList li.sel')).toHaveCount(2);
  await expect(page.locator('#clipSelTxt')).toContainText('클립 2개 선택');
  await li(2).click({ modifiers: ['Control'] });                            // 다시 누르면 빠짐
  expect(await names(app)).toEqual(['v1.mp4']);
  await li(2).click({ modifiers: ['Shift'] });                              // 범위
  expect(await names(app)).toEqual(['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await expect(page.locator('#fillClips option[value="sel"]')).toHaveText('선택한 클립만 (3개)');

  // A: 현재 위치부터 목록 순서대로 이어서, 되돌리기 한 번에 전부
  await app.E('S.tracks[0] = []; refreshTimeline(); seek(2)');
  await key(app, 'a');
  const t = await items(app);
  expect(t.map(x => x[0])).toEqual(['v1.mp4', 'v2.mp4', 'v3.mp4']);
  expect(t[0][1]).toBeCloseTo(2, 0);
  expect(t[1][1]).toBeCloseTo(t[0][2], 3); expect(t[2][1]).toBeCloseTo(t[1][2], 3);
  expect(await selIdx(app)).toEqual([0, 1, 2]);                              // 넣은 조각이 선택됨
  await key(app, 'Control+z');
  expect(await items(app)).toEqual([]);

  // E: 끝에 이어서
  await key(app, 'e');
  expect((await items(app)).map(x => x[0])).toEqual(['v1.mp4', 'v2.mp4', 'v3.mp4']);
  expect((await items(app))[0][1]).toBe(0);

  // 랜덤 채우기: 선택한 클립만
  await li(1).click();                                                       // v2만
  await page.click('.tabs button[data-tab="tCut"]');
  await page.selectOption('#fillClips', 'sel');
  await key(app, 'f');
  await page.click('.tabs button[data-tab="tSrc"]');
  const srcs = await app.E('[...new Set(S.tracks[0].map(g => g.srcName))]');
  expect(srcs).toEqual(['v2.mp4']);

  // 고른 클립 한꺼번에 삭제 (타임라인에 쓰였으면 확인 창)
  await li(0).click(); await li(2).click({ modifiers: ['Control'] });
  page.once('dialog', d => d.accept());
  await page.click('#clipSelDel');
  expect(await app.E('S.clips.map(c => c.name)')).toEqual(['v2.mp4']);
  await expect(page.locator('#clipSelClear')).toBeHidden();
});

test('32. 조각 여러 개 선택: Ctrl·Shift 클릭, 같이 옮기기, 설정 일괄 적용, 복제·삭제, 사각형 선택, Esc·Ctrl+A, 되돌리면 선택도 복원', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  // 짧은 조각 3개를 띄엄띄엄, 화면에 전체가 보이게
  await app.E(`(() => {
    const [a, b, c] = S.clips;
    S.tracks[0] = [[a, 2, 3], [b, 5, 6], [c, 8, 9]].map(([cl, s, e]) => ({ kind: 'video', src: cl, srcName: cl.name, start: s, end: e, off: 0, rate: 1, vol: 0, x: 0, y: 0, zoom: 1, flip: false, rot: 0, tilt: 0 }));
    S.zoom = 20; seek(0.01); refreshTimeline();
  })()`);
  await page.click('.tabs button[data-tab="tCut"]');
  const box = await page.locator('#strip').boundingBox();
  const X = t => box.x + t / 20 * box.width, Y0 = box.y + 64 + 26 + 16;      // 화면 1 트랙 가운데
  await page.waitForTimeout(100);

  await page.mouse.click(X(2.5), Y0);
  expect(await selIdx(app)).toEqual([0]);
  await page.keyboard.down('Control'); await page.mouse.click(X(8.5), Y0); await page.keyboard.up('Control');
  expect(await selIdx(app)).toEqual([0, 2]);
  await expect(page.locator('#segSelInfo')).toContainText('조각 2개 선택');
  await page.keyboard.down('Shift'); await page.mouse.click(X(2.5), Y0); await page.keyboard.up('Shift');   // 기준(8~9)부터 2~3까지
  expect(await selIdx(app)).toEqual([0, 1, 2]);

  // 하나를 끌면 셋 다 같은 만큼
  await page.mouse.move(X(5.5), Y0); await page.mouse.down(); await page.mouse.move(X(6.5), Y0, { steps: 5 }); await page.mouse.up();
  let t = await items(app);
  expect(t.map(x => x[1])).toEqual([t[0][1], t[0][1] + 3, t[0][1] + 6]);
  expect(t[0][1]).toBeGreaterThan(2.5);
  expect(await selIdx(app)).toEqual([0, 1, 2]);                              // 끌고 나도 선택 유지
  await key(app, 'Control+z');
  expect((await items(app)).map(x => x[1])).toEqual([2, 5, 8]);
  expect(await selIdx(app)).toEqual([0, 1, 2]);                              // 되돌려도 선택 복원

  // 설정은 고른 조각 모두에: 회전(O), 기울기, 좌우 반전
  await key(app, 'o');
  expect(await app.E('S.tracks[0].map(g => g.rot)')).toEqual([90, 90, 90]);
  await page.locator('#segTilt').fill('10');
  await page.check('#segFlip');
  expect(await app.E('S.tracks[0].map(g => [g.tilt, g.flip])')).toEqual([[10, true], [10, true], [10, true]]);
  // 시작 시간을 바꾸면 간격을 유지한 채 이동 (기준 조각 기준)
  const base = await app.E('S.tracks[0].indexOf(S.selItem)');
  await page.fill('#segStart', String([2, 5, 8][base] + 1)); await page.locator('#segStart').blur();
  expect((await items(app)).map(x => x[1])).toEqual([3, 6, 9]);
  await key(app, 'Control+z');

  // 복제: 묶음째로 바로 뒤에, 간격 그대로 / 삭제: 한 번에
  await key(app, 'd');
  t = await items(app);
  expect(t.map(x => x[1])).toEqual([2, 5, 8, 9, 12, 15]);
  expect(await selIdx(app)).toEqual([3, 4, 5]);
  await key(app, 'Delete');
  expect((await items(app)).map(x => x[1])).toEqual([2, 5, 8]);
  await key(app, 'Control+z');
  expect((await items(app)).length).toBe(6);
  await key(app, 'Control+z');

  // Esc: 선택 해제, Ctrl+A: 이 화면 모두
  await key(app, 'Escape');
  expect(await app.E('S.selItem')).toBe(null);
  await key(app, 'Control+a');
  expect(await selIdx(app)).toEqual([0, 1, 2]);

  // 빈 곳에서 끌어 사각형으로: 4초~10초 → 2·3번째 조각
  await page.mouse.click(X(11), Y0);                                         // 빈 곳 클릭 = 해제
  expect(await app.E('S.selItem')).toBe(null);
  await page.mouse.move(X(4), Y0 - 8); await page.mouse.down(); await page.mouse.move(X(10), Y0 + 8, { steps: 5 }); await page.mouse.up();
  expect(await selIdx(app)).toEqual([1, 2]);
  // Ctrl을 누른 채 끌면 더하기
  await page.keyboard.down('Control');
  await page.mouse.move(X(1), Y0); await page.mouse.down(); await page.mouse.move(X(3.5), Y0, { steps: 4 }); await page.mouse.up();
  await page.keyboard.up('Control');
  expect(await selIdx(app)).toEqual([0, 1, 2]);
  // 고른 것 중 하나를 그냥 클릭(끌지 않음)하면 그것만
  await page.mouse.click(X(5.5), Y0);
  expect(await selIdx(app)).toEqual([1]);
});
