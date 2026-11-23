// 설치된 Chrome으로 테스트합니다. 다른 경로의 Chrome을 쓰려면 CHROME_PATH 환경 변수를 지정하세요.
const { defineConfig } = require('@playwright/test');
// 로캘이 없는 리눅스(CI 등)에서는 Chrome이 한글 파일 이름을 'download'로 바꿔 버림 → UTF-8 지정
if (process.platform === 'linux' && !process.env.LC_ALL && !process.env.LANG) process.env.LC_ALL = 'C.UTF-8';
module.exports = defineConfig({
  testDir: './tests',
  testIgnore: 'electron/**',   // 데스크톱 앱 테스트는 playwright.electron.config.js
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    viewport: { width: 1366, height: 768 },
    acceptDownloads: true,
    ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH, args: ['--autoplay-policy=no-user-gesture-required'] } }
                                : { channel: 'chrome', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } }),
  },
});
