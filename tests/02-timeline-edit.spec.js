// 시나리오 4~5: 타임라인 키보드 편집, 마우스 편집
const { test, expect, SONG, loadMusic, loadClips, track } = require('./helpers');

async function setup(app) {
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await app.page.locator('body').click({ position: { x: 5, y: 5 } }); // 입력칸 밖에 포커스
}
const key = (app, k) => app.page.keyboard.press(k);

test('4. A·E·Q 추가, C 자르기, D 복제, Del 삭제, Ctrl+Z 되돌리기', async ({ app }) => {
  await setup(app);
  const t0 = await track(app);
  expect(t0.length).toBe(3);

  // Q: 맨 앞에 추가, 기존 조각은 그 길이만큼 뒤로
  await app.E("selectClip(S.clips[2])");
  await key(app, 'q');
  const tq = await track(app);
  expect(tq.length).toBe(4);
  expect(tq[0]).toEqual(['v3.mp4', 0, 8]);
  expect(tq.slice(1).map(x => x[1])).toEqual(t0.map(x => +(x[1] + 8).toFixed(3)));
  await key(app, 'Control+z');
  expect(await track(app)).toEqual(t0);

  // E: 마지막 조각 바로 뒤에 붙음
  await key(app, 'e');
  const te = await track(app);
  expect(te.length).toBe(4);
  expect(te.at(-1)[1]).toBeCloseTo(t0.at(-1)[2], 3);

  // A: 현재 위치(가까운 비트에 붙음)에 추가
  await app.E('seek(30)');
  await key(app, 'a');
  const ta = await track(app);
  const added = await app.E('[S.selItem.start, S.beats.slice()]');
  expect(ta.length).toBe(5);
  expect(Math.abs(added[0] - 30)).toBeLessThan(0.16);
  expect(added[1].some(b => Math.abs(b - added[0]) < 1e-6) || added[0] === 30).toBe(true);

  // C: 선택한 조각 가운데서 자르면 두 조각이 맞붙음
  const sel = await app.E('[S.selItem.start, S.selItem.end]');
  const mid = (sel[0] + sel[1]) / 2;
  await app.E(`seek(${mid})`);
  await key(app, 'c');
  const tc = await track(app);
  expect(tc.length).toBe(6);
  const parts = tc.filter(x => Math.abs(x[2] - mid) < 0.002 || Math.abs(x[1] - mid) < 0.002);
  expect(parts.length).toBe(2);

  // D: 복제는 선택한 조각 바로 뒤에
  const s2 = await app.E('[S.selItem.start, S.selItem.end]');
  await key(app, 'd');
  expect((await track(app)).length).toBe(7);
  expect(await app.E('S.selItem.start')).toBeCloseTo(s2[1], 3);

  // Del: 선택한 조각 삭제
  await key(app, 'Delete');
  expect((await track(app)).length).toBe(6);

  // Ctrl+Z 4번 → E 직후 상태로
  for (let i = 0; i < 4; i++) await key(app, 'Control+z');
  expect(await track(app)).toEqual(te);
});

test('5. 조각을 마우스로 끌어 옮기고, 오른쪽 끝을 끌어 줄이면 비트·조각 끝에 붙음', async ({ app }) => {
  await setup(app);
  await app.E('S.zoom = projDur()');                         // 곡 전체가 보이게
  await app.page.waitForTimeout(100);
  const box = await app.page.locator('#strip').boundingBox();
  const g = await app.E('({ dur: S.zoom, name: S.tracks[0][1].srcName, s: S.tracks[0][1].start, e: S.tracks[0][1].end })');
  const X = t => box.x + t / g.dur * box.width;
  const laneY = box.y + 64 + 26 + 16;                       // 파형 64 + 음악 줄 26 + 화면1 줄 가운데
  const snapPts = async () => app.E('[...S.beats, ...S.tracks.flat().flatMap(x => [x.start, x.end]), ...S.audio.flatMap(x => [x.start, x.end]), 0]');

  // 두 번째 조각을 오른쪽으로 약 2초 이동 (클립 배치 순서는 알려진 버그로 매번 다를 수 있어 이름을 읽어 둠)
  await app.page.mouse.move(X((g.s + g.e) / 2), laneY);
  await app.page.mouse.down();
  await app.page.mouse.move(X((g.s + g.e) / 2 + 2), laneY, { steps: 8 });
  await app.page.mouse.up();
  const moved = await app.E(`S.tracks[0].find(x => x.srcName === "${g.name}")`);
  expect(Math.abs(moved.start - (g.s + 2))).toBeLessThan(0.35);
  expect(moved.end - moved.start).toBeCloseTo(g.e - g.s, 3);      // 길이는 그대로
  const pts = await snapPts();
  const near = v => pts.some(p => Math.abs(p - v) < 1e-6);
  expect(near(moved.start) || near(moved.end), '비트나 다른 조각 끝에 붙음').toBe(true);

  // 맨 앞 조각의 오른쪽 끝을 약 1.5초 왼쪽으로 (다른 조각과 겹치지 않는 조각을 고름)
  const first = await app.E('({ name: S.tracks[0][0].srcName, s: S.tracks[0][0].start, e: S.tracks[0][0].end })');
  await app.page.mouse.move(X(first.e) - 3, laneY);
  await app.page.mouse.down();
  await app.page.mouse.move(X(first.e - 1.5), laneY, { steps: 8 });
  await app.page.mouse.up();
  const trimmed = await app.E(`S.tracks[0].find(x => x.srcName === "${first.name}")`);
  expect(trimmed.start).toBeCloseTo(first.s, 3);                  // 시작은 그대로
  expect(Math.abs(trimmed.end - (first.e - 1.5))).toBeLessThan(0.35);
  expect((await snapPts()).some(p => Math.abs(p - trimmed.end) < 1e-6), '비트나 다른 조각 끝에 붙음').toBe(true);

  // 되돌리기 2번이면 원래 위치
  await app.page.locator('body').click({ position: { x: 5, y: 5 } });
  await app.page.keyboard.press('Control+z');
  await app.page.keyboard.press('Control+z');
  const back = await app.E('S.tracks[0].map(x => [x.srcName, x.start, x.end])');
  expect(back).toContainEqual([g.name, g.s, g.e]);
  expect(back).toContainEqual([first.name, first.s, first.e]);
});
