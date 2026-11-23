# 함께 들어가는 프로그램 (Third-Party Notices)

Beat Meter Maker는 Juke가 만들었고 GPL-3.0-or-later로 배포합니다 (`LICENSE`).
웹 버전(`dist/index.html`)에는 이 프로젝트의 코드와 아래 "포함된 소리"만 들어 있습니다.
데스크톱 설치본에는 아래 프로그램이 함께 들어갑니다. 각 프로그램은 자기 라이선스를 따릅니다.

## 포함된 소리
### 하우스 킥 (DWSD) — `src/sounds/house-kick.wav`
- 만든 사람: Dan Wray (DWSD, Jackpot Recordings) — <https://freesound.org/people/DWSD/>
- 라이선스: Creative Commons Attribution 3.0 (CC BY 3.0) — <https://creativecommons.org/licenses/by/3.0/>
- 바꾼 점: 24비트 스테레오(좌우가 거의 같음)를 16비트 모노로 바꾸고, 파일 안의 정보 태그를 지움. 소리는 그대로
- 출처 메모: 파일에는 "(c) dan wray free samples" 표시가 있었습니다. Dan Wray는 같은 하우스 드럼 샘플 시리즈의 데모(jhd_bd_*)를 Freesound에 CC BY 3.0으로 공개했습니다
  (예: <https://freesound.org/people/DWSD/sounds/191619/>). 이 파일과 정확히 같은 Freesound 원본은 확인하지 못했습니다.
  권리자가 다른 조건을 알려 오면 이 소리를 빼거나 바꿉니다.

틱·킥·클랩 기본 소리는 코드로 합성하므로(`src/beatsound.ts`) 이 프로젝트 라이선스(GPL)를 따릅니다.

## FFmpeg
- 용도: 영상 내보내기(인코딩·소리 섞기), 영상 조각 디코딩, 영상에서 소리 꺼내기
- 라이선스: GPL-3.0-or-later (`--enable-gpl --enable-version3`으로 빌드된 정적 실행 파일)
- 포함 방식: npm 패키지 [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static)이 설치할 때 운영체제에 맞는 실행 파일을 받습니다.
  설치본에서는 `resources/app.asar.unpacked/node_modules/ffmpeg-static/` 안에 있고, 같은 폴더에
  `ffmpeg.LICENSE`(라이선스 전문)와 `ffmpeg.README`(빌드 정보·포함 라이브러리 목록)가 함께 들어갑니다.
- 소스 코드: <https://ffmpeg.org/download.html>. 정확한 버전은 앱의 진단 정보(`env.ffmpeg`)나 `ffmpeg -version`으로 확인할 수 있습니다.
  GitHub 릴리스에는 들어간 ffmpeg 버전의 소스 묶음(`ffmpeg-<버전>.tar.xz`)을 함께 올립니다 (`.github/workflows/release.yml`).
- 실행 파일 안에 함께 빌드된 라이브러리(x264, x265, libvpx, libopus, LAME 등)는 각자의 라이선스를 따르며, 목록은 `ffmpeg.README`에 있습니다.

## ffmpeg-static
- 용도: 위 FFmpeg 실행 파일 위치를 알려 주는 npm 패키지
- 라이선스: GPL-3.0-or-later — <https://github.com/eugeneware/ffmpeg-static>

## Electron (Chromium, Node.js 포함)
- 용도: 데스크톱 앱 실행 환경
- 라이선스: Electron은 MIT — <https://github.com/electron/electron/blob/main/LICENSE>
- Chromium과 Node.js 및 그 구성 요소의 라이선스는 설치본 폴더의 `LICENSE.electron.txt`, `LICENSES.chromium.html`에 있습니다 (electron-builder가 자동으로 넣음).

## 개발·빌드에만 쓰는 도구 (설치본에 들어가지 않음)
Vite, vite-plugin-singlefile (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0), electron-builder (MIT)
