import { db } from './firebase';
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy
} from 'firebase/firestore';
import { Member, Guest, Match, Position, POSITIONS } from './types';

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

// ──────────────────────────────────────────
// Current user (로컬만 - 기기별 로그인)
// ──────────────────────────────────────────

export function getCurrentUser(): Member | null {
  try {
    const raw = localStorage.getItem('ojifc_currentUser');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setCurrentUser(member: Member) {
  localStorage.setItem('ojifc_currentUser', JSON.stringify(member));
}

export function logout() {
  localStorage.removeItem('ojifc_currentUser');
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
  await setDoc(doc(db, 'members', newMember.id), newMember);
  return newMember;
}

export async function updateMember(id: string, updates: Partial<Member>) {
  await updateDoc(doc(db, 'members', id), updates as Record<string, never>);
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
  return guestsCache.filter(g => g.matchId === matchId);
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
  await setDoc(doc(db, 'matches', newMatch.id), newMatch);
  return newMatch;
}

export async function updateMatch(id: string, updates: Partial<Match>) {
  await updateDoc(doc(db, 'matches', id), updates as Record<string, never>);
}

export async function deleteMatch(id: string) {
  await deleteDoc(doc(db, 'matches', id));
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

function getPosCategory(pos: Position): string {
  return POSITIONS.find(p => p.value === pos)?.category || 'MF';
}

function getSlotCategory(slotLabel: string): string {
  if (slotLabel === 'GK') return 'GK';
  if (['CB', 'LB', 'RB'].includes(slotLabel)) return 'DF';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(slotLabel)) return 'MF';
  if (['LW', 'RW', 'ST', 'CF'].includes(slotLabel)) return 'FW';
  return 'MF';
}

const slotPreference: Record<string, string[]> = {
  'GK': ['GK'],
  'LB': ['LB', 'CB', 'LM'],
  'RB': ['RB', 'CB', 'RM'],
  'CB': ['CB', 'LB', 'RB', 'CDM'],
  'CDM': ['CDM', 'CM', 'CB'],
  'CM': ['CM', 'CDM', 'CAM'],
  'CAM': ['CAM', 'CM', 'CF'],
  'LM': ['LM', 'LW', 'CM', 'LB'],
  'RM': ['RM', 'RW', 'CM', 'RB'],
  'LW': ['LW', 'LM', 'ST', 'CF'],
  'RW': ['RW', 'RM', 'ST', 'CF'],
  'ST': ['ST', 'CF', 'CAM', 'LW', 'RW'],
  'CF': ['CF', 'ST', 'CAM'],
};

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
  const slots = FORMATIONS[formation] || FORMATIONS['4-3-3'];
  const players = playerIds.map(id => {
    const info = getPlayerInfo(id);
    return info ? { id, ...info } : null;
  }).filter(Boolean) as { id: string; name: string; positions: Position[] }[];

  const assignment: Record<string, string> = {};
  const used = new Set<string>();

  for (const slot of slots) {
    const exact = players.find(p => !used.has(p.id) && p.positions.includes(slot.label as Position));
    if (exact) { assignment[slot.id] = exact.id; used.add(exact.id); }
  }

  for (const slot of slots) {
    if (assignment[slot.id]) continue;
    const preferred = slotPreference[slot.label] || [];
    const match = players.find(p => !used.has(p.id) && p.positions.some(pos => preferred.includes(pos)));
    if (match) { assignment[slot.id] = match.id; used.add(match.id); }
  }

  for (const slot of slots) {
    if (assignment[slot.id]) continue;
    const slotCat = getSlotCategory(slot.label);
    const match = players.find(p => !used.has(p.id) && p.positions.some(pos => getPosCategory(pos) === slotCat));
    if (match) { assignment[slot.id] = match.id; used.add(match.id); }
  }

  const remaining = shuffle(players.filter(p => !used.has(p.id)));
  let ri = 0;
  for (const slot of slots) {
    if (!assignment[slot.id] && ri < remaining.length) {
      assignment[slot.id] = remaining[ri].id;
      ri++;
    }
  }

  return assignment;
}

export function generateQuarterLineups(
  playerIds: string[],
  formation: string
): { playing: Record<string, string>; resting: string[] }[] {
  const total = playerIds.length;
  const perQuarter = Math.min(11, total);

  return [0, 1, 2, 3].map((qi) => {
    const offset = Math.floor((qi * perQuarter) / 2) % total;
    const rotated = [...playerIds.slice(offset), ...playerIds.slice(0, offset)];
    const shuffledRotated = shuffle(rotated);
    const playingIds = shuffledRotated.slice(0, perQuarter);
    const restingIds = shuffledRotated.slice(perQuarter);
    const playing = autoAssignLineup(playingIds, formation);
    return { playing, resting: restingIds };
  });
}
