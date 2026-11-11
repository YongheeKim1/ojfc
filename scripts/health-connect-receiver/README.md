# 갤럭시 활동 기록 수신기 (시범)

삼성헬스 → Health Connect → [Health Connect Webhook](https://github.com/mcnaveen/health-connect-webhook) 앱 → 구글 앱스 스크립트 → Firestore `activities`

비용은 없고, 서비스 계정 키도 쓰지 않습니다. 실제 갤럭시 기기로는 아직 시험하지 않았습니다.

## 1. 수신기 배포 (운영진 1회)

1. <https://script.google.com> → 새 프로젝트
2. `Code.gs` 내용을 통째로 붙여넣고 저장
3. 배포 → 새 배포 → 유형: **웹 앱**
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
4. 나온 웹 앱 주소(`https://script.google.com/macros/s/.../exec`)를
   `src/lib/activity.ts` 의 `HEALTH_RECEIVER_URL` 에 넣고 앱을 다시 배포

## 2. 갤럭시 멤버 설정 (각자 1회)

1. 삼성헬스 → 설정 → Health Connect 와 데이터 공유 켜기
2. 플레이스토어에서 **Health Connect Webhook** 설치
3. 오지FC 앱 → 내 페이지 → 경기 선택 → '갤럭시 자동 연동' 에 보이는 주소를 복사해 Webhook 주소로 등록
4. 보낼 항목: 운동, 거리, 활동 칼로리, 심박수, 걸음 수
5. 동기화 주기: 15분 (경기 후 바로 보고 싶으면 '지금 동기화')

## 동작

- 최근 7일 안에 끝난 경기 중, 기록 시간이 그 경기 시간대(킥오프~경기 종료)에 들어가는 것만 저장합니다.
- 킥오프 시각이 없으면 경기 종료 2시간 전부터로 계산합니다.
- 직접 입력하거나 아이폰으로 넣은 기록은 덮어쓰지 않습니다.
- Webhook 앱은 새 기록만 나눠서 보내므로, 같은 경기 기록은 큰 값을 남기는 방식으로 합칩니다.
