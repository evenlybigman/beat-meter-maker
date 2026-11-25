"""테스트용 미디어 생성 (재현용). 결과 파일은 tests/fixtures에 이미 포함되어 있음.
필요: python3, ffmpeg"""
import math, random, struct, subprocess, wave, os
D = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(D, exist_ok=True)
SR = 22050

def beat_song(name, bpm, sil, dur):
    random.seed(bpm)
    n = int(SR * dur); d = [0.0] * n
    t = sil
    while t < dur:
        i = int(t * SR)
        for j in range(int(SR * 0.03)):
            if i + j < n: d[i + j] += math.sin(j * 0.25) * math.exp(-j / 120)
        t += 60 / bpm
    for i in range(int(sil * SR), n): d[i] += (random.random() - .5) * 0.02
    wav = os.path.join(D, name + '.wav')
    with wave.open(wav, 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x * 0.8)) * 32767)) for x in d))
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libopus', '-b:a', '48k', os.path.join(D, name + '.ogg')], check=True)
    os.remove(wav)

beat_song('bpm097_5_sil7_4', 97.5, 7.4, 40)
beat_song('bpm128_sil3_2', 128, 3.2, 40)
beat_song('bpm140_sil1_5', 140, 1.5, 40)
ff = lambda *a: subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *a], check=True)
for i, src in enumerate(['testsrc', 'testsrc2', 'smptebars'], 1):
    ff('-f', 'lavfi', '-i', f'{src}=size=320x180:rate=30', '-t', '8', '-pix_fmt', 'yuv420p', '-b:v', '150k', os.path.join(D, f'v{i}.mp4'))
ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100',
   '-t', '8', '-pix_fmt', 'yuv420p', '-b:v', '150k', '-c:a', 'aac', '-b:a', '64k', '-shortest', os.path.join(D, 'va_sound.mp4'))
ff('-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-t', '0.1', os.path.join(D, 'snap.wav'))
# 1초마다 색이 바뀌는 영상 (빨강·초록·파랑·흰색·노랑·자홍) — 내보내기 프레임 정확도 검사용
cols = ['red', 'lime', 'blue', 'white', 'yellow', 'magenta']
ins = sum([['-f', 'lavfi', '-i', f'color=c={c}:s=160x90:r=30:d=1'] for c in cols], [])
ff(*ins, '-filter_complex', ''.join(f'[{i}]' for i in range(6)) + 'concat=n=6:v=1:a=0', '-pix_fmt', 'yuv420p', '-g', '15', '-b:v', '100k', os.path.join(D, 'colors.mp4'))
# 왼쪽 절반 빨강, 오른쪽 절반 파랑 (3초) — 회전 검사용 (90도 돌리면 위 빨강·아래 파랑)
ff('-f', 'lavfi', '-i', 'color=c=red:s=160x180:r=30:d=3', '-f', 'lavfi', '-i', 'color=c=blue:s=160x180:r=30:d=3',
   '-filter_complex', '[0][1]hstack', '-pix_fmt', 'yuv420p', '-b:v', '100k', os.path.join(D, 'halves.mp4'))
# 서로 다른 클립 10개 (10초, 작은 크기) — 클립이 많을 때 미리보기 재생 검사용
for i in range(1, 11):
    ff('-f', 'lavfi', '-i', f'testsrc2=s=320x180:r=30:d=10', '-vf', f'hue=h={i * 36}', '-pix_fmt', 'yuv420p', '-g', '30', '-b:v', '50k', os.path.join(D, f'm{i}.mp4'))
# 이미지 클립 검사용: 왼쪽 빨강·오른쪽 파랑 PNG, 초록 JPG, 빨강→파랑 움직이는 GIF(첫 장면 빨강), 읽을 수 없는 HEIC
from PIL import Image
im = Image.new('RGB', (320, 180), (255, 0, 0)); im.paste((0, 0, 255), (160, 0, 320, 180)); im.save(os.path.join(D, 'halves.png'))
Image.new('RGB', (200, 200), (0, 200, 0)).save(os.path.join(D, 'green.jpg'), quality=90)
Image.new('RGB', (64, 64), (255, 0, 0)).save(os.path.join(D, 'anim.gif'), save_all=True, append_images=[Image.new('RGB', (64, 64), (0, 0, 255))], duration=300, loop=0)
open(os.path.join(D, 'photo.heic'), 'wb').write(b'\x00\x00\x00\x18ftypheic' + b'\x00' * 64)
print('ok')
