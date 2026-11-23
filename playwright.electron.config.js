// 데스크톱 앱(Electron) 테스트. 리눅스에서 화면이 없으면 xvfb-run으로 실행하세요.
const { defineConfig } = require('@playwright/test');
// 로캘이 없는 리눅스(CI 등)에서는 Chrome이 한글 파일 이름을 'download'로 바꿔 버림 → UTF-8 지정
if (process.platform === 'linux' && !process.env.LC_ALL && !process.env.LANG) process.env.LC_ALL = 'C.UTF-8';
module.exports = defineConfig({
  testDir: './tests/electron',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
