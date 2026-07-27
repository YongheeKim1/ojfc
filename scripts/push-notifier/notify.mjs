/**
 * 오지FC 무료 푸시 알림 서버 (GitHub Actions에서 5분마다 실행)
 *
 * 동작:
 *  1) Firestore matches 컬렉션을 읽는다
 *  2) 각 매치의 현재 상태로 "발생해야 할 이벤트"를 계산 (new/lineup/voting/done)
 *  3) 매치 문서의 pushedEvents 배열과 비교 → 새 이벤트만 FCM 푸시
 *  4) 보낸 이벤트를 pushedEvents에 기록 (중복 방지)
 *  5) 최초 실행(pushState/global 없음)은 baseline만 잡고 아무것도 보내지 않음
 *     → 기존 과거 매치들이 한꺼번에 알림 폭탄이 되는 것을 방지
 *
 * 필요 시크릿: FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 전체)
 */
import admin from 'firebase-admin';

const APP_URL = 'https://yongheekim1.github.io/ojfc/';

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT 시크릿이 없습니다.');
    process.exit(1);
  }
  let svc;
  try {
    svc = JSON.parse(raw);
  } catch (e) {
    console.error('서비스 계정 JSON 파싱 실패:', e.message);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

// 매치 상태 → 발생해야 할 이벤트 목록
function computeEvents(match) {
  const events = ['new'];
  const s = match.status;
  if (['lineup', 'playing', 'voting', 'done'].includes(s)) events.push('lineup');
  if (['voting', 'done'].includes(s)) events.push('voting');
  if (s === 'done') events.push('done');
  return events;
}

function dateStr(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 이벤트별 알림 문구 + 이동 경로
function buildMessage(event, match) {
  const title = match.title || '오지FC';
  switch (event) {
    case 'new':
      return {
        title: '새 매치가 등록되었습니다',
        body: `${title} · ${dateStr(match.date)} · ${match.location || ''}`.trim(),
        url: APP_URL + '#/match',
        tag: 'match-new',
      };
    case 'lineup':
      return {
        title: '라인업이 나왔습니다',
        body: `${title} · 축구장에서 확인하세요`,
        url: APP_URL + `#/lineup?matchId=${match.id}`,
        tag: 'lineup',
      };
    case 'voting':
      return {
        title: 'POM 투표가 시작되었습니다',
        body: `${title} · 이번 경기 MVP를 뽑아주세요`,
        url: APP_URL + '#/',
        tag: 'voting',
      };
    case 'done':
      return {
        title: '매치가 종료되었습니다',
        body: `${title} · 결과 ${match.scoreA ?? 0} : ${match.scoreB ?? 0}`,
        url: APP_URL + '#/match',
        tag: 'done',
      };
    default:
      return null;
  }
}

async function loadTokens(db) {
  const snap = await db.collection('pushTokens').get();
  const tokens = [];
  snap.forEach((d) => {
    const t = d.get('token') || d.id;
    if (t) tokens.push(t);
  });
  return [...new Set(tokens)];
}

// 무효 토큰 정리
async function pruneTokens(db, invalidTokens) {
  await Promise.all(
    invalidTokens.map((t) => db.collection('pushTokens').doc(t).delete().catch(() => {}))
  );
}

async function sendPush(messaging, tokens, msg) {
  if (tokens.length === 0) return { sent: 0, invalid: [] };
  const invalid = [];
  let sent = 0;
  // FCM 멀티캐스트는 최대 500개씩
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      data: {
        title: msg.title,
        body: msg.body,
        url: msg.url,
        tag: msg.tag,
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
      },
    });
    res.responses.forEach((r, idx) => {
      if (r.success) {
        sent++;
      } else {
        const code = r.error?.errorInfo?.code || r.error?.code || '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token') ||
          code.includes('invalid-argument')
        ) {
          invalid.push(batch[idx]);
        }
      }
    });
  }
  return { sent, invalid };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const messaging = admin.messaging();

  const stateRef = db.collection('pushState').doc('global');
  const stateSnap = await stateRef.get();
  const isFirstRun = !stateSnap.exists;

  const matchesSnap = await db.collection('matches').get();
  const matches = [];
  matchesSnap.forEach((d) => matches.push({ id: d.id, ...d.data() }));

  if (matches.length === 0) {
    if (isFirstRun) await stateRef.set({ initialized: true, at: Date.now() });
    console.log('매치 없음. 종료.');
    return;
  }

  const tokens = await loadTokens(db);
  console.log(`매치 ${matches.length}건, 토큰 ${tokens.length}개, 최초실행=${isFirstRun}`);

  const allInvalid = new Set();

  for (const match of matches) {
    const applicable = computeEvents(match);
    const pushed = Array.isArray(match.pushedEvents) ? match.pushedEvents : [];

    if (isFirstRun) {
      // baseline: 현재 상태를 이미 보낸 것으로 기록, 전송은 하지 않음
      await db.collection('matches').doc(match.id).update({ pushedEvents: applicable });
      continue;
    }

    const newEvents = applicable.filter((e) => !pushed.includes(e));
    if (newEvents.length === 0) continue;

    for (const event of newEvents) {
      const msg = buildMessage(event, match);
      if (!msg) continue;
      const { sent, invalid } = await sendPush(messaging, tokens, msg);
      invalid.forEach((t) => allInvalid.add(t));
      console.log(`[${match.title}] ${event} → ${sent}명 전송`);
    }

    // 보낸 이벤트 병합 기록
    const merged = Array.from(new Set([...pushed, ...newEvents]));
    await db.collection('matches').doc(match.id).update({ pushedEvents: merged });
  }

  if (allInvalid.size > 0) {
    await pruneTokens(db, Array.from(allInvalid));
    console.log(`무효 토큰 ${allInvalid.size}개 삭제`);
  }

  if (isFirstRun) {
    await stateRef.set({ initialized: true, at: Date.now() });
    console.log('최초 실행 baseline 완료 (알림 미전송).');
  }

  console.log('완료.');
}

main().catch((e) => {
  console.error('스크립트 오류:', e);
  process.exit(1);
});
