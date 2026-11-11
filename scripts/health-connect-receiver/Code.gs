/**
 * 오지FC 갤럭시 활동 기록 수신기 (구글 앱스 스크립트, 무료)
 *
 * 흐름: 삼성헬스 → Health Connect → Health Connect Webhook 앱 → 이 스크립트 → Firestore activities
 *
 * Health Connect Webhook 앱에 넣을 주소:  <이 웹 앱 주소>?m=<멤버ID>
 *   (멤버ID 가 들어간 주소는 오지FC 앱 '내 활동 기록' 화면에 표시됩니다)
 *
 * 서비스 계정 키를 쓰지 않습니다. 오지FC 앱과 같은 공개 웹 키로 Firestore REST 에 씁니다.
 */
const PROJECT_ID = 'azfc-a460e';
const API_KEY = 'AIzaSyB4D5SF3is411Wirbf67tLFVEc3AQmUINo';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
const DEFAULT_MATCH_MINUTES = 120;  // 킥오프 미기록 경기는 종료 2시간 전부터로 계산
const LOOKBACK_DAYS = 7;            // 이 기간 안에 끝난 경기만 대상

function doPost(e) {
  const memberId = (e && e.parameter && e.parameter.m) || '';
  if (!/^[\w-]{1,64}$/.test(memberId)) return reply_('member 파라미터가 없습니다');

  let payload;
  try { payload = JSON.parse(e.postData.contents); } catch (err) { return reply_('JSON 형식이 아닙니다'); }

  const member = getDoc_('members', memberId);
  if (!member) return reply_('등록되지 않은 멤버입니다');

  let saved = 0;
  recentMatches_(Date.now()).forEach(function (m) {
    const w = matchWindow_(m);
    if (!w) return;
    const s = summarize(payload, w.start, w.end);
    if (!s) return;

    const id = m.id + '_' + memberId;
    const existing = getDoc_('activities', id);
    // 직접 입력하거나 아이폰으로 넣은 기록은 덮어쓰지 않습니다
    if (existing && existing.source && existing.source !== 'android') return;

    patchDoc_('activities', id, mergeActivity(existing, s, {
      id: id, matchId: m.id, memberId: memberId, memberName: member.name || '',
      source: 'android', updatedAt: Date.now(),
    }));
    saved++;
  });
  return reply_('ok ' + saved);
}

function doGet() {
  return reply_('오지FC 활동 기록 수신기');
}

/* ───────── 계산 (외부 호출 없음, 테스트 가능) ───────── */

function matchWindow_(m) {
  const end = m.votingStartedAt || null;
  if (m.kickoffAt) return { start: m.kickoffAt, end: end || m.kickoffAt + DEFAULT_MATCH_MINUTES * 60000 };
  if (end) return { start: end - DEFAULT_MATCH_MINUTES * 60000, end: end };
  return null;
}

function midpoint_(r) {
  if (r.time) return Date.parse(r.time);
  const a = Date.parse(r.start_time), b = Date.parse(r.end_time);
  return isNaN(a) || isNaN(b) ? NaN : (a + b) / 2;
}

/** 경기 시간대에 해당하는 기록만 모아 거리·칼로리·심박·걸음 수를 냅니다 */
function summarize(payload, start, end) {
  const inWin = function (r) { const t = midpoint_(r); return t >= start && t <= end; };
  const list = function (k) { return Array.isArray(payload[k]) ? payload[k].filter(inWin) : []; };

  const exercise = list('exercise');
  const distance = list('distance');
  const kcal = list('active_calories');
  const steps = list('steps');
  const hr = list('heart_rate');

  const out = {};
  const exDist = exercise.reduce(function (s, x) { return s + (x.distance_meters || 0); }, 0);
  const dist = exDist || distance.reduce(function (s, x) { return s + (x.meters || 0); }, 0);
  if (dist > 0) out.distanceKm = Math.round(dist / 10) / 100;

  const cal = kcal.reduce(function (s, x) { return s + (x.calories || 0); }, 0);
  if (cal > 0) out.activeKcal = Math.round(cal);

  const exSteps = exercise.reduce(function (s, x) { return s + (x.steps || 0); }, 0);
  const st = exSteps || steps.reduce(function (s, x) { return s + (x.count || 0); }, 0);
  if (st > 0) out.steps = Math.round(st);

  // 심박: 개별 측정 {bpm} 또는 1분 묶음 {avg, max}
  const avgs = hr.map(function (x) { return x.avg || x.bpm; }).filter(function (v) { return v > 0; });
  const maxes = hr.map(function (x) { return x.max || x.bpm; }).filter(function (v) { return v > 0; });
  if (avgs.length) {
    out.avgHr = Math.round(avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length);
    out.maxHr = Math.round(Math.max.apply(null, maxes));
    out.hrSamples = avgs.length;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Webhook 앱은 새로 생긴 기록만 나눠서 보낼 수 있어서, 이전에 받은 값과 합칩니다.
 * 같은 기록을 다시 보내도 두 번 더해지지 않도록 큰 값을 남깁니다.
 */
function mergeActivity(existing, next, base) {
  const prev = existing || {};
  const out = Object.assign({}, prev, base);
  ['distanceKm', 'activeKcal', 'steps', 'maxHr'].forEach(function (k) {
    const v = Math.max(prev[k] || 0, next[k] || 0);
    if (v > 0) out[k] = v;
  });
  // 평균 심박은 측정 횟수가 더 많은 쪽을 씁니다
  if ((next.hrSamples || 0) >= (prev.hrSamples || 0) && next.avgHr) {
    out.avgHr = next.avgHr;
    out.hrSamples = next.hrSamples;
  }
  return out;
}

/* ───────── Firestore REST ───────── */

function fromValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  return undefined;
}

function toFields_(obj) {
  const fields = {};
  Object.keys(obj).forEach(function (k) {
    const v = obj[k];
    if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  });
  return fields;
}

function parseDoc_(d) {
  const out = { id: d.name.split('/').pop() };
  Object.keys(d.fields || {}).forEach(function (k) {
    const v = fromValue_(d.fields[k]);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

function getDoc_(col, id) {
  const res = UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id) + '?key=' + API_KEY, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return parseDoc_(JSON.parse(res.getContentText()));
}

function recentMatches_(now) {
  const url = BASE + '/matches?pageSize=300&key=' + API_KEY
    + '&mask.fieldPaths=kickoffAt&mask.fieldPaths=votingStartedAt&mask.fieldPaths=status';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  const docs = JSON.parse(res.getContentText()).documents || [];
  return docs.map(parseDoc_).filter(function (m) {
    const w = matchWindow_(m);
    return w && w.end >= now - LOOKBACK_DAYS * 86400000 && w.start <= now;
  });
}

function patchDoc_(col, id, data) {
  UrlFetchApp.fetch(BASE + '/' + col + '/' + encodeURIComponent(id) + '?key=' + API_KEY, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: toFields_(data) }),
    muteHttpExceptions: true,
  });
}

function reply_(msg) {
  return ContentService.createTextOutput(msg);
}
