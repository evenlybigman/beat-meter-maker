// 시나리오 1~3: 음악·클립 불러오기, BPM 감지 정확도
const { test, expect, SONG, loadMusic, loadClips, track } = require('./helpers');

test('1. 음악 2개를 불러오면 순서대로 이어 붙고, 영상 길이는 두 곡의 합', async ({ app }) => {
  await loadMusic(app, [SONG.s128, SONG.s97]);
  const a = await app.E('S.audio.map(g => [g.srcName, g.start, g.end])');
  const durs = await app.E('S.songs.map(s => s.dur)');
  expect(a.length).toBe(2);
  expect(a[0][1]).toBe(0);
  expect(a[1][1]).toBeCloseTo(a[0][2], 6);              // 빈틈 없이 이어짐
  expect(await app.E('projDur()')).toBeCloseTo(durs[0] + durs[1], 3);
  expect(await app.E('S.beats.length')).toBeGreaterThan(0); // 불러오면 비트 자동 생성
});

// 정답: [파일, BPM, 첫 소리 시각]
const CASES = [[SONG.s97, 97.5, 7.4], [SONG.s128, 128, 3.2], [SONG.s140, 140, 1.5]];
for (const [file, bpm, sil] of CASES) {
  test(`2. BPM 감지 ${bpm} BPM (앞 무음 ${sil}초)`, async ({ app }) => {
    await loadMusic(app, [file]);
    const r = await app.E('({ bpm: S.songs[0].bpm, start: S.musicStart, beats: S.beats.slice(), dur: projDur() })');
    expect(Math.abs(r.bpm - bpm), `감지 BPM ${r.bpm}`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.start - sil), `음악 시작 ${r.start}`).toBeLessThanOrEqual(0.03);
    const p = 60 / bpm;
    const err = t => { const k = Math.round((t - sil) / p); return Math.abs(t - (sil + k * p)); };
    expect(err(r.beats[0]) * 1000, `첫 비트 ${r.beats[0]}`).toBeLessThanOrEqual(10);
    expect(Math.abs(r.beats[0] - sil) * 1000, '첫 비트가 첫 소리 위치').toBeLessThanOrEqual(10);
    expect(err(r.beats.at(-1)) * 1000, `마지막 비트 ${r.beats.at(-1)}`).toBeLessThanOrEqual(10);
    expect(r.beats.every(t => t >= sil - 0.04), '무음 구간에는 비트 없음').toBe(true);
  });
}

test('3. 영상 클립을 불러오면 자동 배치되고 소리는 켜진 상태', async ({ app }) => {
  await loadClips(app, ['v1.mp4', 'v2.mp4']);
  const t = await track(app);
  expect(t.map(x => x[0]).sort()).toEqual(['v1.mp4', 'v2.mp4']);
  expect(t[0][1]).toBe(0);
  expect(t[1][1]).toBeCloseTo(t[0][2], 3);
  expect(await app.E('S.tracks[0].every(g => g.vol === 1)')).toBe(true);
  expect(await app.E('projDur()')).toBeCloseTo(t[1][2], 3); // 음악 없으면 영상 끝까지가 길이
});

// 2단계에서 고친 버그: 예전에는 "먼저 읽힌 순서"로 배치됨. 읽기 속도가 다른 파일 순서를 여러 조합으로 확인
for (const order of [['v1.mp4', 'v2.mp4', 'v3.mp4'], ['v3.mp4', 'v1.mp4', 'v2.mp4'], ['v2.mp4', 'va_sound.mp4', 'v3.mp4', 'v1.mp4']]) {
  test(`3-1. 여러 클립을 한 번에 넣으면 선택한 순서대로 배치 (${order.join(', ')})`, async ({ app }) => {
    await loadClips(app, order);
    const t = await track(app);
    expect(t.map(x => x[0])).toEqual(order);
    for (let i = 1; i < t.length; i++) expect(t[i][1]).toBeCloseTo(t[i - 1][2], 3);
  });
}
