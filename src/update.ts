// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 자동 업데이트 알림 (데스크톱 설치본만). 새 버전을 다 받으면 화면 아래에 바를 띄움
//  - 지금 재시작: 자동 저장을 한 번 하고 재시작하며 설치
//  - 나중에: 바만 닫음 → 앱을 끌 때 설치됨
import { desk } from './desktop';
import { autosaveTick } from './project';
import { S } from './state';
import { $, toast } from './util';

export function initUpdate() {
  const U = desk()?.update;
  if (!U) return;
  U.onReady(({ version }) => {
    $('#updVer').textContent = 'v' + version;
    $('#updBar').style.display = 'flex';
  });
  $('#updNow').onclick = async () => {
    if (S.exporting) { toast('내보내기가 끝난 뒤에 다시 눌러 주세요'); return; }
    await autosaveTick();
    await U.install();
  };
  $('#updLater').onclick = () => {
    $('#updBar').style.display = 'none';
    toast('앱을 끌 때 새 버전이 설치됩니다');
  };
}
