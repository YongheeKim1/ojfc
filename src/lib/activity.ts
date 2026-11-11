// 경기별 활동 기록 (거리·칼로리·심박·걸음 수)
//
// 건강 앱 데이터는 웹앱이 직접 읽을 수 없어서
//  - 아이폰: 단축어가 경기 시간대의 건강 데이터를 모아 이 앱 주소로 넘겨줍니다
//  - 갤럭시: Health Connect Webhook 앱 → 구글 앱스 스크립트 → 여기 저장 (scripts/health-connect-receiver)
//  - 모두: 직접 입력
// 어느 경로든 activities/{매치ID}_{멤버ID} 문서 하나에 저장합니다.
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore';
import type { Activity, Match } from './types';

/** 아이폰에 만들어 둘 단축어 이름 (앱이 이 이름으로 실행합니다) */
export const SHORTCUT_NAME = '오지FC 기록';

/**
 * 갤럭시 수신기(구글 앱스 스크립트 웹 앱) 주소.
 * scripts/health-connect-receiver 를 배포한 뒤 넣습니다. 비어 있으면 갤럭시는 직접 입력만 안내합니다.
 */
export const HEALTH_RECEIVER_URL: string = '';

/** 킥오프 시각을 기록하지 않은 경기는 종료 시각 기준 이만큼을 경기 시간으로 봅니다 */
export const DEFAULT_MATCH_MINUTES = 120;

export interface MatchWindow {
  start: number;
  end: number;
  estimatedStart: boolean; // 킥오프 미기록 → 종료 2시간 전부터로 추정
  ongoing: boolean;        // 아직 경기 종료 전
}

/** 이 경기의 활동 기록을 모을 시간대 */
export function matchWindow(m: Match, now = Date.now()): MatchWindow | null {
  const ended = m.votingStartedAt ?? null;
  if (m.kickoffAt) {
    return { start: m.kickoffAt, end: ended ?? now, estimatedStart: false, ongoing: !ended };
  }
  if (ended) {
    return { start: ended - DEFAULT_MATCH_MINUTES * 60000, end: ended, estimatedStart: true, ongoing: false };
  }
  return null;
}

/**
 * 단축어 실행 주소.
 * 단축어는 날짜 글자를 해석하기 까다로워서, "몇 분 전에 시작해서 몇 분 동안"인지 숫자로 넘깁니다.
 */
export function shortcutRunUrl(m: Match, now = Date.now()): string | null {
  const w = matchWindow(m, now);
  if (!w) return null;
  const minutesAgo = Math.max(0, Math.round((now - w.start) / 60000));
  const duration = Math.max(1, Math.round((w.end - w.start) / 60000));
  const input = `${m.id},${minutesAgo},${duration}`;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(input)}`;
}

/**
 * 단축어가 넘긴 숫자를 읽습니다.
 * 기기 언어에 따라 "1,234" 처럼 쉼표가 붙거나 "6.2 km" 처럼 단위가 붙을 수 있습니다.
 */
export function parseHealthNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function activityId(matchId: string, memberId: string): string {
  return `${matchId}_${memberId}`;
}

export async function fetchActivity(matchId: string, memberId: string): Promise<Activity | null> {
  const snap = await getDoc(doc(db, 'activities', activityId(matchId, memberId)));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as Activity) : null;
}

export async function fetchMyActivities(memberId: string): Promise<Activity[]> {
  const snap = await getDocs(query(collection(db, 'activities'), where('memberId', '==', memberId)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Activity);
}

export type ActivityValues = Pick<Activity, 'distanceKm' | 'activeKcal' | 'avgHr' | 'maxHr' | 'steps'>;

export async function saveActivity(
  match: Match, memberId: string, memberName: string,
  values: ActivityValues, source: Activity['source'],
): Promise<void> {
  const id = activityId(match.id, memberId);
  const data: Record<string, unknown> = {
    id, matchId: match.id, memberId, memberName, source, updatedAt: Date.now(),
  };
  // 비운 칸은 저장하지 않습니다 (Firestore 는 undefined 를 받지 않음)
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'number' && Number.isFinite(v)) data[k] = v;
  }
  await setDoc(doc(db, 'activities', id), data);
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
