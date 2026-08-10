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
  const rows = [];
  snap.forEach((d) => {
    const t = d.get('token') || d.id;
    if (t) rows.push({ token: t, memberId: d.get('memberId') || '' });
  });
  // 토큰 중복 제거
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.token) ? false : (seen.add(r.token), true)));
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
  const ICON = 'https://yongheekim1.github.io/ojfc/logo.png';
  // FCM 멀티캐스트는 최대 500개씩
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      // notification 페이로드 → 앱이 꺼져 있어도 FCM이 자동으로 알림 표시
      notification: {
        title: msg.title,
        body: msg.body,
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        notification: {
          icon: ICON,
          badge: ICON,
          tag: msg.tag,
        },
        fcmOptions: { link: msg.url },
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 한 번의 점검 사이클.
 * GitHub Actions 스케줄러는 실행 시각이 들쭉날쭉해서(5~30분 지연),
 * 한 번 실행될 때 여러 번 반복 점검해 "구간"을 커버하도록 합니다.
 */
async function runCycle(db, messaging) {
  const stateRef = db.collection('pushState').doc('global');
  const stateSnap = await stateRef.get();
  const isFirstRun = !stateSnap.exists;

  const matchesSnap = await db.collection('matches').get();
  const matches = [];
  matchesSnap.forEach((d) => matches.push({ id: d.id, ...d.data() }));

  const tokenRows = await loadTokens(db);
  const allTokens = tokenRows.map((r) => r.token);
  console.log(`매치 ${matches.length}건, 토큰 ${allTokens.length}개, 최초실행=${isFirstRun}`);

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
      const { sent, invalid } = await sendPush(messaging, allTokens, msg);
      invalid.forEach((t) => allInvalid.add(t));
      console.log(`[${match.title}] ${event} → ${sent}명 전송`);
    }

    // 보낸 이벤트 병합 기록
    const merged = Array.from(new Set([...pushed, ...newEvents]));
    await db.collection('matches').doc(match.id).update({ pushedEvents: merged });
  }

  // ── 감독 전체 공지 (announcements) → 전체 브로드캐스트 ──
  const annSnap = await db.collection('announcements').get();
  for (const d of annSnap.docs) {
    const a = { id: d.id, ...d.data() };
    if (a.pushed) continue;
    if (isFirstRun) {
      await db.collection('announcements').doc(a.id).update({ pushed: true });
      continue;
    }
    const msg = {
      title: '감독의 한마디',
      body: a.content || '',
      url: APP_URL + '#/coach',
      tag: 'announcement',
    };
    const { sent, invalid } = await sendPush(messaging, allTokens, msg);
    invalid.forEach((t) => allInvalid.add(t));
    await db.collection('announcements').doc(a.id).update({ pushed: true });
    console.log(`[공지] → ${sent}명 전송`);
  }

  // ── 개별 편지 (feedbacks) → 받는 사람 토큰에만 ──
  const fbSnap = await db.collection('feedbacks').get();
  for (const d of fbSnap.docs) {
    const f = { id: d.id, ...d.data() };
    if (f.pushed) continue;
    if (isFirstRun) {
      await db.collection('feedbacks').doc(f.id).update({ pushed: true });
      continue;
    }
    const targetTokens = tokenRows.filter((r) => r.memberId === f.memberId).map((r) => r.token);
    if (targetTokens.length > 0) {
      const msg = {
        title: '감독에게서 편지가 도착했습니다',
        body: f.content || '',
        url: APP_URL + '#/coach',
        tag: 'feedback-' + f.memberId,
      };
      const { sent, invalid } = await sendPush(messaging, targetTokens, msg);
      invalid.forEach((t) => allInvalid.add(t));
      console.log(`[편지→${f.memberName}] → ${sent}명 전송`);
    }
    await db.collection('feedbacks').doc(f.id).update({ pushed: true });
  }

  if (allInvalid.size > 0) {
    await pruneTokens(db, Array.from(allInvalid));
    console.log(`무효 토큰 ${allInvalid.size}개 삭제`);
  }

  if (isFirstRun) {
    await stateRef.set({ initialized: true, at: Date.now() });
    console.log('최초 실행 baseline 완료 (알림 미전송).');
  }

  // 사이클 종료
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const messaging = admin.messaging();

  // 한 번 실행될 때 여러 번 점검해서 커버 구간을 넓힙니다.
  // (GitHub 스케줄러 지연 때문에 "방금 놓친" 경우를 줄이는 목적)
  const rounds = Math.max(1, Number(process.env.POLL_ROUNDS || 1));
  const intervalSec = Math.max(10, Number(process.env.POLL_INTERVAL_SEC || 50));

  for (let i = 0; i < rounds; i++) {
    if (i > 0) await sleep(intervalSec * 1000);
    console.log(`--- 점검 ${i + 1}/${rounds} ---`);
    await runCycle(db, messaging);
  }
  console.log('전체 완료.');
}

main().catch((e) => {
  console.error('스크립트 오류:', e);
  process.exit(1);
});
