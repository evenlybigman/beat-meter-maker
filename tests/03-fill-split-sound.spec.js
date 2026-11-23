// 시나리오 6~8: 랜덤 채우기, 분할 화면, 비트 소리
const { test, expect, FX, SONG, loadMusic, loadClips, track } = require('./helpers');

async function setup(app) {
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await app.page.locator('body').click({ position: { x: 5, y: 5 } });
}

test('6. 랜덤 채우기: 빈틈 없음, 같은 클립 연속 없음, "빈 곳만"은 기존 조각 유지', async ({ app }) => {
  await setup(app);
  await app.page.keyboard.press('f');
  const t = await track(app);
  const dur = await app.E('projDur()');
  expect(t.length).toBeGreaterThan(3);
  expect(t[0][1]).toBe(0);
  expect(t.at(-1)[2]).toBeCloseTo(dur, 2);
  for (let i = 1; i < t.length; i++) {
    expect(t[i][1], `${i}번째 조각 앞 빈틈`).toBeCloseTo(t[i - 1][2], 3);
    expect(t[i][0], `${i}번째 조각 클립 연속`).not.toBe(t[i - 1][0]);
  }

  // 가운데 조각 2개를 지워 빈 곳을 만든 뒤 "빈 곳만" 채우기
  await app.E('S.tracks[0].splice(2, 2); refreshTimeline()');
  const kept = await track(app);
  await app.page.click('.tabs button[data-tab="tCut"]');
  await app.page.selectOption('#fillScope', 'empty');
  await app.page.click('#btnFill');
  const t2 = await track(app);
  for (const k of kept) expect(t2, '기존 조각 유지').toContainEqual(k);
  for (let i = 1; i < t2.length; i++) expect(t2[i][1]).toBeCloseTo(t2[i - 1][2], 3);
});

test('7. 3분할: 새 화면에 화면 1 배치가 복사되고, 같은 장면은 영상 하나를 공유', async ({ app }) => {
  await setup(app);
  await app.page.click('.tabs button[data-tab="tLay"]');
  await app.page.locator('#lays button', { hasText: '세로 3분할' }).click();
  expect(await app.E('S.tracks.length')).toBe(3);
  const t0 = await track(app, 0);
  expect(await track(app, 1)).toEqual(t0);
  expect(await track(app, 2)).toEqual(t0);
  expect(await app.E('(() => { const p = syncAll(2); return !!p[0].v && p[0].v === p[1].v && p[1].v === p[2].v; })()')).toBe(true);
  // 화면 2만 다른 클립으로 바꾸면 영상 요소가 달라짐
  await app.E('S.tracks[1][0].src = S.clips[2]; S.tracks[1][0].srcName = "v3.mp4"');
  expect(await app.E('(() => { const p = syncAll(2); return p[0].v !== p[1].v && p[0].v === p[2].v; })()')).toBe(true);
});

test('8. 비트 소리: 예약 시각 오차 5ms 이하, 위치 이동 후 재예약, 내 소리 추가', async ({ app }) => {
  await setup(app);
  await app.E('S.bpm = 120; S.offset = 0; S.beats = gridBeats(0, projDur(), 1); beatsChanged()');
  // 버퍼 재생 예약을 가로채 "예약된 음악 시각"을 기록
  await app.E(`(() => { window.__sched = []; const o = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (w, ...r) { if (this.buffer && this.buffer.duration < 1) __sched.push((w || actx.currentTime) - actx.currentTime + now()); return o.call(this, w, ...r); }; })()`);
  await app.page.click('#btnPlay');
  await app.page.waitForTimeout(2100);
  await app.page.click('#btnPlay');
  const s1 = await app.E('__sched.slice()');
  expect(s1.length).toBeGreaterThanOrEqual(4);
  for (const t of s1) expect(Math.abs(t - Math.round(t / 0.5) * 0.5) * 1000, `예약 ${t}`).toBeLessThanOrEqual(5);
  expect(s1.map(t => Math.round(t * 2) / 2).slice(0, 4)).toEqual([0, 0.5, 1, 1.5]);

  await app.E('__sched.length = 0; seek(10)');
  await app.page.click('#btnPlay');
  await app.page.waitForTimeout(1100);
  await app.page.click('#btnPlay');
  const s2 = await app.E('__sched.map(t => Math.round(t * 2) / 2)');
  expect(s2.slice(0, 3)).toEqual([10, 10.5, 11]);

  const n = await app.E('SND.list.length');
  await app.page.setInputFiles('#fSnd', FX('snap.wav'));
  await app.page.waitForFunction(n => SND.list.length === n + 1, n);
  expect(await app.E('curSnd().custom === true && S.set.beatSound === curSnd().id')).toBe(true);
});
