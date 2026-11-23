// 빌드 결과는 HTML 파일 하나(dist/index.html). JS·CSS가 모두 안에 들어가서 더블클릭으로 바로 열림.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFileSync, readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig({
  plugins: [viteSingleFile(), {
    // 완성본을 폴더 맨 위에도 복사: 압축을 풀고 이 파일만 Chrome으로 열면 됨 (index.html은 개발용 원본)
    name: 'copy-standalone',
    closeBundle() { copyFileSync(new URL('./dist/index.html', import.meta.url), new URL('./Beat Meter Maker.html', import.meta.url)); },
  }],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },   // 진단 정보에 들어가는 버전
  build: { outDir: 'dist', target: 'es2022', minify: false },
});
