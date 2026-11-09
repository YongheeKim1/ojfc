/**
 * 어떤 알림을 보낼지 결정하는 규칙.
 * GitHub Actions(notify.mjs)와 Cloudflare Worker(push-worker)가 함께 씁니다.
 */
export const APP_URL = 'https://yongheekim1.github.io/ojfc/';

// 이보다 오래된 일은 알림을 보내지 않고 처리된 것으로만 기록합니다.
// (서버가 한동안 멈췄다가 다시 돌 때 옛날 알림이 한꺼번에 쏟아지는 것을 막습니다)
export const STALE_MS = 3 * 24 * 60 * 60 * 1000;

// 매치 상태 → 발생했어야 할 이벤트 (진행 순서대로)
export function computeEvents(match) {
  const events = ['new'];
  const s = match.status;
  if (['lineup', 'playing', 'voting', 'done'].includes(s)) events.push('lineup');
  if (['voting', 'done'].includes(s)) events.push('voting');
  if (s === 'done') events.push('done');
  return events;
}

/**
 * 이 매치에서 지금 보낼 알림 하나를 고릅니다.
 * 밀린 이벤트가 여러 개면 가장 최근 것만 보냅니다 (new+lineup+voting 3연속 알림 방지).
 * @returns event: 보낼 이벤트(없으면 null), pushedEvents: 저장할 값(변화 없으면 null)
 */
export function decideMatchPush(match, now = Date.now()) {
  const applicable = computeEvents(match);
  const pushed = Array.isArray(match.pushedEvents) ? match.pushedEvents : [];
  const pending = applicable.filter((e) => !pushed.includes(e));
  if (pending.length === 0) return { event: null, pushedEvents: null };

  const pushedEvents = Array.from(new Set([...pushed, ...pending]));
  const stale = Number(match.date || 0) < now - STALE_MS;
  return { event: stale ? null : pending[pending.length - 1], pushedEvents };
}

export function isStaleRecord(record, now = Date.now()) {
  return Number(record.createdAt || 0) < now - STALE_MS;
}

function dateStr(ts) {
  if (!ts) return '';
  // GitHub·Cloudflare 서버는 UTC 라서 한국 시간으로 맞춰 표시합니다
  const d = new Date(Number(ts) + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 이벤트별 알림 문구 + 이동 경로
export function buildMatchMessage(event, match) {
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
        url: APP_URL + `#/match?vote=${match.id}`,
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

export function buildAnnouncementMessage(a) {
  return {
    title: '감독의 한마디',
    body: a.content || '',
    url: APP_URL + '#/coach',
    tag: 'announcement',
  };
}

export function buildFeedbackMessage(f) {
  return {
    title: '감독에게서 편지가 도착했습니다',
    body: f.content || '',
    url: APP_URL + '#/coach',
    tag: 'feedback-' + f.memberId,
  };
}
