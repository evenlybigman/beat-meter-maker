// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 화면 캔버스 참조 (미리보기, 타임라인). 타입을 붙여 두어 그리기 함수 오타를 검사기가 잡게 함
// 두 캔버스는 index.html에 고정으로 있으므로 그리기 도구(2d)는 항상 있음 → null 아님(!)으로 둠
export const cv = document.getElementById('view') as HTMLCanvasElement, cx = cv.getContext('2d')!;
export const strip = document.getElementById('strip') as HTMLCanvasElement, sx = strip.getContext('2d')!;
