# Beat Meter Maker

비트 동기화 리듬 영상 편집기. 음악의 BPM을 감지해 비트를 만들고, 영상 조각을 타임라인에 배치해 비트 바 오버레이가 들어간 영상으로 내보냅니다.

## 실행

- **바로 쓰기:** `npm run build` 후 `dist/index.html`을 Chrome으로 엽니다 (파일 하나에 모두 들어 있음).
- **개발 서버:** `npm run dev` (코드를 고치면 바로 반영)
- **데스크톱 앱:** `npm run app` (Electron). 웹 버전과 화면은 같고, 아래가 다릅니다.
  - 내보내기가 실시간 재생에 묶이지 않음 → 프레임이 빠지지 않고 MP4(H.264 + AAC)로 저장. 저장 위치를 직접 고름
  - 프로젝트에 음악·영상 파일 경로를 저장 → 다시 열거나 자동 복구할 때 파일을 다시 넣을 필요 없음 (옮겨진 파일만 알려 줌)
- **설치 파일 만들기:** `npm run dist` → `release/` (Windows는 Windows에서, macOS는 macOS에서 실행)

## 바로 써 보기 (웹 버전)
`npm run build` 하면 폴더 맨 위에 **`Beat Meter Maker.html`** 이 생깁니다. 이 파일 하나만 Chrome으로 열면 됩니다. (`index.html`은 개발용 원본이라 바로 열면 화면이 깨져 보입니다.)

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm install` | 처음 한 번, 의존성 설치 |
| `npm run dev` | 개발 서버 |
| `npm run build` | `dist/index.html` 한 파일로 빌드 |
| `npm run typecheck` | TypeScript 검사 |
| `npm test` | 빌드 후 자동 테스트 (Playwright, 설치된 Chrome 사용) |
| `npm run app` | 데스크톱 앱 실행 |
| `npm run test:app` | 데스크톱 앱 테스트 |
| `npm run dist` | 설치 파일 만들기 (electron-builder) |
| `npm run check` | 타입 검사 + 빌드 + 웹·데스크톱 테스트 전부 |

## 구조 (`src/`)

| 파일 | 내용 |
| --- | --- |
| `main.ts` | 진입점: 모든 모듈을 불러오고 초기화, 그리기 루프 시작 |
| `types.ts` | 핵심 데이터 타입 (클립, 곡, 영상·음악 조각, 프로젝트 파일 형식) |
| `state.ts` | 앱 전체 상태 `S`와 기본 설정 `DEFAULTS` |
| `util.ts`, `dom.ts` | 공통 도구, 캔버스 참조 |
| `audio.ts` | 오디오 컨텍스트, 재생 시계, 영상 길이, 음악 재생 예약 |
| `songs.ts` | 음악 불러오기, 파형, 무음 감지, BPM 감지 |
| `beats.ts` | 비트 편집, 탭 템포, 녹음, 패턴 |
| `history.ts` | 편집 기록: `commit()`·`record()`/`afterEdit()`, 되돌리기·다시 실행 |
| `itemTypes.ts` | 조각 종류(영상·음악)별 동작 표, 조각 만들기, 파일 변환 |
| `beatsound.ts` | 비트 소리 합성·예약·사용자 소리·음악에서 소리 따기 |
| `timeline.ts` | 타임라인 모델과 조각 편집 |
| `fill.ts` | 랜덤 자동 채우기 |
| `clips.ts` | 영상 클립 불러오기와 목록 |
| `render.ts` | 화면 분할, 영상 동기화(video 요소는 화면당 2개까지 돌려 씀), 미리보기·오버레이·타임라인 그리기 |
| `player.ts` | 그리기 루프, 재생·정지, 내보내기 (웹: 화면 녹화) |
| `exportFF.ts` | 데스크톱 내보내기: 프레임 단위 합성 → 내장 H.264(없으면 ffmpeg x264) → MP4 |
| `desktop.ts` | 데스크톱 기능 연결 (`window.bmm`), 경로로 파일 다루기 |
| `diag.ts` | 오류 기록, 진단 정보 파일 만들기 (폴더 경로 지움) |
| `appInfo.ts` | 저작자·라이선스·**소스 코드 링크·후원 링크** (정보 창) |
| `project.ts` | 프로젝트 저장·불러오기·검증(v4), 예전 형식 변환, 자동 저장 |
| `settings.ts` | 설정 입력칸, 출력 해상도 |
| `events.ts`, `timelineInput.ts`, `windowUi.ts` | 버튼·마우스·창 이벤트 |

## 데스크톱 앱 (`electron/`)

| 파일 | 내용 |
| --- | --- |
| `main.js` | 창, `app://` 주소(앱 화면과 내 컴퓨터 미디어 파일, 영상 탐색용 구간 요청 지원), 저장 위치 대화상자 |
| `preload.js` | 화면에 `window.bmm` 제공 |
| `ff.js` | ffmpeg 실행: 조각별 프레임 디코딩, 인코딩·소리 섞기. 화면과 같은 프로세스에서 돌아 프레임 복사가 적음 |

ffmpeg는 `ffmpeg-static` 패키지로 앱에 같이 들어갑니다(설치본에서는 `app.asar.unpacked`). `BMM_FFMPEG` 환경 변수로 다른 ffmpeg를 쓸 수 있습니다.

## 타입 검사
`tsconfig.json`은 엄격 모드(`strict`)입니다. `any`는 형식을 알 수 없는 곳(예전 프로젝트 파일 읽기, 진단용 오류 수집)과 DOM 조회 `$()`에만 씁니다.

## 진단 정보
출력 탭의 "진단 정보 저장"이 버전·환경·메모리·마지막 내보내기 통계·프로젝트 요약(파일 이름 없이 확장자·길이만)·최근 오류 200건을 JSON 파일 하나로 저장합니다. 폴더 경로는 지웁니다. 데스크톱 앱은 앱 기록(`사용자 폴더/logs/main.log`) 마지막 50줄과 프로세스별 메모리도 넣습니다.

## 편집 규칙
모든 편집은 `history.ts`의 `commit('이름', () => {...})`을 거칩니다. 그래야 되돌리기(Ctrl+Z)·다시 실행(Ctrl+Shift+Z / Ctrl+Y)과 화면 갱신이 빠지지 않습니다. 끌기·슬라이더는 시작할 때 `record()`, 끝날 때 `afterEdit()`.

## 프로젝트 파일
현재 형식은 v4입니다. v1~v3 파일은 열 때 자동 변환됩니다. v4 파일은 이전 버전 앱에서 열리지 않습니다.
데스크톱 앱은 `paths`(파일 이름 → 경로)를 추가로 저장합니다. 웹 버전은 이 값을 무시하고, 같은 프로젝트를 웹과 데스크톱 양쪽에서 열 수 있습니다.

테스트 자세한 내용은 [TESTING.md](TESTING.md).

## 소스 코드·후원 링크 넣기
`src/appInfo.ts`의 `sourceUrl`(GitHub 저장소 주소)과 `donateUrl`(후원 페이지)을 채우면 정보 창에 나타납니다.
비어 있으면 그 줄은 보이지 않습니다. `https://` 주소만 링크가 됩니다. 데스크톱 앱에서는 기본 브라우저로 열립니다.

## 설치 파일 배포 (GitHub Actions)
- `.github/workflows/ci.yml`: main에 올리거나 PR을 열면 리눅스·Windows에서 타입 검사와 웹·데스크톱 테스트
- `.github/workflows/release.yml`: `v`로 시작하는 태그를 올리면 Windows(.exe)·macOS(.dmg, Apple Silicon)·Linux(.AppImage) 설치 파일을 만들어 GitHub 릴리스 **초안**에 올림. 확인한 뒤 GitHub에서 Publish
  ```
  git tag v1.0.0
  git push --tags
  ```
- 버전은 `package.json`의 `version`을 같이 올려 주세요 (앱 정보 창·진단 정보에 표시)
- 코드 서명은 하지 않습니다. Windows는 처음 실행할 때 "Windows의 PC 보호" 창에서 "추가 정보 → 실행", macOS는 처음 한 번 Finder에서 우클릭 → 열기가 필요합니다
- 아이콘: `build/icon.png` (electron-builder가 각 운영체제 형식으로 바꿈)

## 라이선스
Copyright (C) 2026 Juke

이 프로그램은 자유 소프트웨어입니다. GNU 일반 공중 사용 허가서(GPL) 3판 또는 그 이후 판의 조건에 따라 다시 배포하거나 고칠 수 있습니다. 어떠한 보증도 하지 않습니다. 전문은 [`LICENSE`](LICENSE)를 보세요.

데스크톱 설치본에 함께 들어가는 FFmpeg(GPL), Electron(MIT) 등의 라이선스는 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)에 정리했습니다.
