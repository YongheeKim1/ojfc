import { db } from './firebase';
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy
} from 'firebase/firestore';
import { Member, Guest, Match, Position } from './types';

// ──────────────────────────────────────────
// 로컬 캐시 (동기 접근용) + Firestore 동기화
// ──────────────────────────────────────────

let membersCache: Member[] = [];
let guestsCache: Guest[] = [];
let matchesCache: Match[] = [];
let initialized = false;

type Listener = () => void;
const listeners: Set<Listener> = new Set();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() {
  listeners.forEach(fn => fn());
}

// Firestore 실시간 구독 시작
export function initFirestore() {
  if (initialized) return;
  initialized = true;

  // Members
  const membersRef = collection(db, 'members');
  onSnapshot(query(membersRef, orderBy('createdAt', 'asc')), (snap) => {
    membersCache = snap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
    notify();
  });

  // Guests
  const guestsRef = collection(db, 'guests');
  onSnapshot(query(guestsRef, orderBy('createdAt', 'asc')), (snap) => {
    guestsCache = snap.docs.map(d => ({ id: d.id, ...d.data() } as Guest));
    notify();
  });

  // Matches
  const matchesRef = collection(db, 'matches');
  onSnapshot(query(matchesRef, orderBy('date', 'desc')), (snap) => {
    matchesCache = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
    notify();
  });
}

// 초기 데이터 로드 (한 번만)
export async function loadInitialData() {
  const [membersSnap, guestsSnap, matchesSnap] = await Promise.all([
    getDocs(query(collection(db, 'members'), orderBy('createdAt', 'asc'))),
    getDocs(query(collection(db, 'guests'), orderBy('createdAt', 'asc'))),
    getDocs(query(collection(db, 'matches'), orderBy('date', 'desc'))),
  ]);
  membersCache = membersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
  guestsCache = guestsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guest));
  matchesCache = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Firestore 쓰기 에러 알림
async function safeWrite<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('Firestore 에러:', err);
    alert('저장에 실패했습니다. 네트워크를 확인해주세요.');
    throw err;
  }
}

// ──────────────────────────────────────────
// Current user (로컬만 - 기기별 로그인)
// ──────────────────────────────────────────

export function getCurrentUser(): Member | null {
  try {
    const raw = localStorage.getItem('ojifc_currentUser');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const SESSION_TIMEOUT = 60 * 60 * 1000; // 1시간

export function setCurrentUser(member: Member) {
  localStorage.setItem('ojifc_currentUser', JSON.stringify(member));
  localStorage.setItem('ojifc_lastActivity', Date.now().toString());
}

export function refreshActivity() {
  localStorage.setItem('ojifc_lastActivity', Date.now().toString());
}

export function isSessionExpired(): boolean {
  const last = localStorage.getItem('ojifc_lastActivity');
  if (!last) return true;
  return Date.now() - Number(last) > SESSION_TIMEOUT;
}

export function logout() {
  localStorage.removeItem('ojifc_currentUser');
  localStorage.removeItem('ojifc_lastActivity');
}

// ──────────────────────────────────────────
// 권한 체크: admin (DB에서 role 필드 직접 수정) / guest (기본)
// ──────────────────────────────────────────
export function isAdmin(): boolean {
  // 캐시에 반영된 최신 role 확인 (로그인 당시 스냅샷이 아닌 현재 상태)
  const user = getCurrentUser();
  if (!user) return false;
  const latest = membersCache.find(m => m.id === user.id);
  return (latest?.role ?? user.role) === 'admin';
}

// ──────────────────────────────────────────
// Members (Firestore)
// ──────────────────────────────────────────

export function getMembers(): Member[] {
  return membersCache;
}

export async function saveMember(member: Omit<Member, 'id' | 'pomCount' | 'createdAt'>): Promise<Member> {
  const newMember: Member = {
    ...member,
    password: member.password || '',
    id: genId(),
    pomCount: 0,
    createdAt: Date.now(),
  };
  await safeWrite(() => setDoc(doc(db, 'members', newMember.id), newMember));
  return newMember;
}

export async function updateMember(id: string, updates: Partial<Member>) {
  await safeWrite(() => updateDoc(doc(db, 'members', id), updates as Record<string, never>));
}

export async function deleteMember(id: string) {
  await deleteDoc(doc(db, 'members', id));
}

// ──────────────────────────────────────────
// Guests (Firestore)
// ──────────────────────────────────────────

export function getGuests(): Guest[] {
  return guestsCache;
}

export function getGuestsByMatch(matchId: string): Guest[] {
  // 직접 매칭
  const direct = guestsCache.filter(g => g.matchId === matchId);
  if (direct.length > 0) return direct;

  // 같은 날짜 매치의 용병도 포함 (매치가 삭제/변경된 경우)
  const match = matchesCache.find(m => m.id === matchId);
  if (!match) return [];
  const matchDate = new Date(match.date).toDateString();
  const sameDateMatchIds = matchesCache
    .filter(m => new Date(m.date).toDateString() === matchDate)
    .map(m => m.id);
  return guestsCache.filter(g => sameDateMatchIds.includes(g.matchId));
}

export async function saveGuest(guest: { name: string; phone: string; positions: Position[]; matchId: string }): Promise<Guest> {
  const newGuest: Guest = {
    id: 'guest_' + genId(),
    name: guest.name,
    phone: guest.phone,
    positions: guest.positions,
    matchId: guest.matchId,
    ratings: [],
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'guests', newGuest.id), newGuest);
  return newGuest;
}

export async function addGuestRating(guestId: string, score: number, comment: string) {
  const guest = guestsCache.find(g => g.id === guestId);
  if (guest) {
    const ratings = [...guest.ratings, { score, comment, date: Date.now() }];
    await updateDoc(doc(db, 'guests', guestId), { ratings });
  }
}

export async function updateGuest(id: string, updates: Partial<Guest>) {
  await updateDoc(doc(db, 'guests', id), updates as Record<string, never>);
}

export async function deleteGuest(id: string) {
  await deleteDoc(doc(db, 'guests', id));
}

// ──────────────────────────────────────────
// Matches (Firestore)
// ──────────────────────────────────────────

export function getMatches(): Match[] {
  return matchesCache;
}

export async function saveMatch(match: Omit<Match, 'id'>): Promise<Match> {
  const newMatch: Match = { ...match, id: genId() };
  await safeWrite(() => setDoc(doc(db, 'matches', newMatch.id), newMatch));
  return newMatch;
}

export async function updateMatch(id: string, updates: Partial<Match>) {
  await safeWrite(() => updateDoc(doc(db, 'matches', id), updates as Record<string, never>));
}

export async function deleteMatch(id: string) {
  await deleteDoc(doc(db, 'matches', id));
}

export async function toggleAttendance(matchId: string, memberId: string) {
  const match = matchesCache.find(m => m.id === matchId);
  if (!match) return;
  const attendees = match.attendees || [];
  const isAttending = attendees.includes(memberId);
  const newAttendees = isAttending
    ? attendees.filter(id => id !== memberId)
    : [...attendees, memberId];
  await updateDoc(doc(db, 'matches', matchId), { attendees: newAttendees });
}

// ──────────────────────────────────────────
// Formation & Lineup (로컬 로직 - 변경 없음)
// ──────────────────────────────────────────

export interface FormationSlot {
  id: string;
  label: string;
  x: number;
  y: number;
}

export const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-3-3': [
    { id: 'GK', label: 'GK', x: 50, y: 92 },
    { id: 'LB', label: 'LB', x: 15, y: 75 },
    { id: 'CB1', label: 'CB', x: 38, y: 78 },
    { id: 'CB2', label: 'CB', x: 62, y: 78 },
    { id: 'RB', label: 'RB', x: 85, y: 75 },
    { id: 'CM1', label: 'CM', x: 30, y: 55 },
    { id: 'CM2', label: 'CM', x: 50, y: 50 },
    { id: 'CM3', label: 'CM', x: 70, y: 55 },
    { id: 'LW', label: 'LW', x: 15, y: 28 },
    { id: 'ST', label: 'ST', x: 50, y: 22 },
    { id: 'RW', label: 'RW', x: 85, y: 28 },
  ],
  '4-4-2': [
    { id: 'GK', label: 'GK', x: 50, y: 92 },
    { id: 'LB', label: 'LB', x: 15, y: 75 },
    { id: 'CB1', label: 'CB', x: 38, y: 78 },
    { id: 'CB2', label: 'CB', x: 62, y: 78 },
    { id: 'RB', label: 'RB', x: 85, y: 75 },
    { id: 'LM', label: 'LM', x: 15, y: 52 },
    { id: 'CM1', label: 'CM', x: 38, y: 55 },
    { id: 'CM2', label: 'CM', x: 62, y: 55 },
    { id: 'RM', label: 'RM', x: 85, y: 52 },
    { id: 'ST1', label: 'ST', x: 38, y: 25 },
    { id: 'ST2', label: 'ST', x: 62, y: 25 },
  ],
  '3-5-2': [
    { id: 'GK', label: 'GK', x: 50, y: 92 },
    { id: 'CB1', label: 'CB', x: 25, y: 78 },
    { id: 'CB2', label: 'CB', x: 50, y: 80 },
    { id: 'CB3', label: 'CB', x: 75, y: 78 },
    { id: 'LM', label: 'LM', x: 10, y: 52 },
    { id: 'CM1', label: 'CM', x: 30, y: 58 },
    { id: 'CAM', label: 'CAM', x: 50, y: 45 },
    { id: 'CM2', label: 'CM', x: 70, y: 58 },
    { id: 'RM', label: 'RM', x: 90, y: 52 },
    { id: 'ST1', label: 'ST', x: 38, y: 25 },
    { id: 'ST2', label: 'ST', x: 62, y: 25 },
  ],
  '4-2-3-1': [
    { id: 'GK', label: 'GK', x: 50, y: 92 },
    { id: 'LB', label: 'LB', x: 15, y: 75 },
    { id: 'CB1', label: 'CB', x: 38, y: 78 },
    { id: 'CB2', label: 'CB', x: 62, y: 78 },
    { id: 'RB', label: 'RB', x: 85, y: 75 },
    { id: 'CDM1', label: 'CDM', x: 38, y: 60 },
    { id: 'CDM2', label: 'CDM', x: 62, y: 60 },
    { id: 'LW', label: 'LW', x: 18, y: 38 },
    { id: 'CAM', label: 'CAM', x: 50, y: 42 },
    { id: 'RW', label: 'RW', x: 82, y: 38 },
    { id: 'ST', label: 'ST', x: 50, y: 22 },
  ],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 포지션 그룹: 같은 그룹 안에서만 배치 가능
const POSITION_GROUPS: Record<string, string[]> = {
  'GK': ['GK'],
  'DF': ['RB', 'LB', 'CB'],
  'MF': ['CAM', 'CDM', 'CM', 'LM', 'RM'],
  'FW': ['LW', 'RW', 'ST', 'CF'],
};

// 슬롯의 그룹 찾기
function getSlotGroup(slotLabel: string): string[] {
  for (const positions of Object.values(POSITION_GROUPS)) {
    if (positions.includes(slotLabel)) return positions;
  }
  return [];
}

// 카테고리 값을 실제 포지션으로 확장 (이전 데이터 호환)
const CATEGORY_TO_POSITIONS: Record<string, string[]> = {
  'GK': ['GK'],
  'DF': ['RB', 'LB', 'CB'],
  'MF': ['CAM', 'CDM', 'CM', 'LM', 'RM'],
  'FW': ['LW', 'RW', 'ST', 'CF'],
};

// 선수의 선호 포지션을 확장 (FW → [LW, RW, ST, CF] 포함)
function expandPositions(positions: Position[]): string[] {
  const expanded = new Set<string>();
  for (const pos of positions) {
    expanded.add(pos);
    // 카테고리 값이면 해당 그룹의 모든 포지션 추가
    if (CATEGORY_TO_POSITIONS[pos]) {
      CATEGORY_TO_POSITIONS[pos].forEach(p => expanded.add(p));
    }
  }
  return Array.from(expanded);
}

// 선수의 선호 포지션이 해당 그룹에 속하는지
function playerMatchesGroup(playerPositions: Position[], group: string[]): boolean {
  const expanded = expandPositions(playerPositions);
  return expanded.some(pos => group.includes(pos));
}

export function getPlayerInfo(id: string): { name: string; positions: Position[] } | null {
  const member = membersCache.find(m => m.id === id);
  if (member) return { name: member.name, positions: member.positions || [] };
  const guest = guestsCache.find(g => g.id === id);
  if (guest) return { name: guest.name + ' (용병)', positions: guest.positions || [] };
  return null;
}

export function autoAssignLineup(
  playerIds: string[],
  formation: string
): Record<string, string> {
  const slots = FORMATIONS[formation] || FORMATIONS['4-2-3-1'];
  const players = shuffle(playerIds.map(id => {
    const info = getPlayerInfo(id);
    return info ? { id, ...info } : null;
  }).filter(Boolean) as { id: string; name: string; positions: Position[] }[]);

  const assignment: Record<string, string> = {};
  const used = new Set<string>();

  // Pass 1: 정확 매치 (선호 포지션 = 슬롯 포지션, 카테고리 확장 포함)
  for (const slot of slots) {
    const exact = players.find(p => !used.has(p.id) && expandPositions(p.positions).includes(slot.label));
    if (exact) { assignment[slot.id] = exact.id; used.add(exact.id); }
  }

  // Pass 2: 같은 그룹 내 매치 (GK/수비/미드/공격)
  for (const slot of slots) {
    if (assignment[slot.id]) continue;
    const group = getSlotGroup(slot.label);
    const match = players.find(p => !used.has(p.id) && playerMatchesGroup(p.positions, group));
    if (match) { assignment[slot.id] = match.id; used.add(match.id); }
  }

  // Pass 3 없음: 그룹 밖 배치 금지. 빈 슬롯은 빈 채로 유지.
  return assignment;
}

export function generateQuarterLineups(
  playerIds: string[],
  formation: string
): { playing: Record<string, string>; resting: string[] }[] {
  const total = playerIds.length;

  // 11명 이하: 전원 출전, 배치 못 하면 휴식
  if (total <= 11) {
    return [0, 1, 2, 3].map(() => {
      const playing = autoAssignLineup(playerIds, formation);
      const assignedIds = new Set(Object.values(playing));
      const resting = playerIds.filter(id => !assignedIds.has(id));
      return { playing, resting };
    });
  }

  // 12명 이상: 쿼터별 11명 필드 + 나머지 휴식, 공평 분배
  const minQ = (total * 3 <= 44) ? 3 : 2; // 최소 출전 쿼터

  const playCounts: Record<string, number> = {};
  playerIds.forEach(id => { playCounts[id] = 0; });

  const quarterAssignments: string[][] = [[], [], [], []];

  // Greedy: 출전 적은 선수 우선
  for (let qi = 0; qi < 4; qi++) {
    const sorted = shuffle([...playerIds]).sort((a, b) => playCounts[a] - playCounts[b]);
    const selected = sorted.slice(0, 11);
    quarterAssignments[qi] = selected;
    selected.forEach(id => { playCounts[id]++; });
  }

  // 보정: 최소 쿼터 미달 선수 수정
  for (const pid of playerIds) {
    while (playCounts[pid] < minQ) {
      const missingQ = [0, 1, 2, 3].find(qi => !quarterAssignments[qi].includes(pid));
      if (missingQ === undefined) break;
      const overPlayed = [...quarterAssignments[missingQ]]
        .sort((a, b) => playCounts[b] - playCounts[a]);
      const swapTarget = overPlayed.find(id => playCounts[id] > minQ);
      if (!swapTarget) break;
      const idx = quarterAssignments[missingQ].indexOf(swapTarget);
      quarterAssignments[missingQ][idx] = pid;
      playCounts[pid]++;
      playCounts[swapTarget]--;
    }
  }

  // 포지션 배치: 선택된 11명 → autoAssign, 나머지 전부 휴식
  return quarterAssignments.map(selected => {
    const playing = autoAssignLineup(selected, formation);
    // 필드에 배치된 선수 ID
    const assignedIds = new Set(Object.values(playing));
    // 필드에 안 들어간 모든 선수 = 휴식 (선택됐지만 그룹 불일치 + 아예 선택 안 된 선수)
    const resting = playerIds.filter(id => !assignedIds.has(id));
    return { playing, resting };
  });
}
