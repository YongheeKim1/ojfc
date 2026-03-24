import { Member, Guest, Match, Position, POSITIONS } from './types';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`ojifc_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T) {
  localStorage.setItem(`ojifc_${key}`, JSON.stringify(data));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Current user (login)
export function getCurrentUser(): Member | null {
  return load<Member | null>('currentUser', null);
}

export function setCurrentUser(member: Member) {
  save('currentUser', member);
}

export function logout() {
  localStorage.removeItem('ojifc_currentUser');
}

// Members
export function getMembers(): Member[] {
  return load<Member[]>('members', []);
}

export function saveMember(member: Omit<Member, 'id' | 'pomCount' | 'createdAt'>): Member {
  const members = getMembers();
  const newMember: Member = {
    ...member,
    id: genId(),
    pomCount: 0,
    createdAt: Date.now(),
  };
  members.push(newMember);
  save('members', members);
  return newMember;
}

export function updateMember(id: string, updates: Partial<Member>) {
  const members = getMembers();
  const idx = members.findIndex(m => m.id === id);
  if (idx !== -1) {
    members[idx] = { ...members[idx], ...updates };
    save('members', members);
  }
  return members;
}

export function deleteMember(id: string) {
  const members = getMembers().filter(m => m.id !== id);
  save('members', members);
  return members;
}

// Guests (용병)
export function getGuests(): Guest[] {
  return load<Guest[]>('guests', []);
}

export function getGuestsByMatch(matchId: string): Guest[] {
  return getGuests().filter(g => g.matchId === matchId);
}

export function saveGuest(guest: { name: string; phone: string; positions: Position[]; matchId: string }): Guest {
  const guests = getGuests();
  const newGuest: Guest = {
    id: 'guest_' + genId(),
    name: guest.name,
    phone: guest.phone,
    positions: guest.positions,
    matchId: guest.matchId,
    ratings: [],
    createdAt: Date.now(),
  };
  guests.push(newGuest);
  save('guests', guests);
  return newGuest;
}

export function addGuestRating(guestId: string, score: number, comment: string) {
  const guests = getGuests();
  const guest = guests.find(g => g.id === guestId);
  if (guest) {
    guest.ratings.push({ score, comment, date: Date.now() });
    save('guests', guests);
  }
  return guests;
}

export function deleteGuest(id: string) {
  const guests = getGuests().filter(g => g.id !== id);
  save('guests', guests);
  return guests;
}

// Matches
export function getMatches(): Match[] {
  return load<Match[]>('matches', []);
}

export function saveMatch(match: Omit<Match, 'id'>) {
  const matches = getMatches();
  const newMatch: Match = { ...match, id: genId() };
  matches.unshift(newMatch);
  save('matches', matches);
  return newMatch;
}

export function updateMatch(id: string, updates: Partial<Match>) {
  const matches = getMatches();
  const idx = matches.findIndex(m => m.id === id);
  if (idx !== -1) {
    matches[idx] = { ...matches[idx], ...updates };
    save('matches', matches);
  }
  return matches;
}

// Formation templates
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

// 포지션 카테고리 가져오기
function getPosCategory(pos: Position): string {
  return POSITIONS.find(p => p.value === pos)?.category || 'MF';
}

// 슬롯 라벨의 카테고리
function getSlotCategory(slotLabel: string): string {
  if (slotLabel === 'GK') return 'GK';
  if (['CB', 'LB', 'RB'].includes(slotLabel)) return 'DF';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(slotLabel)) return 'MF';
  if (['LW', 'RW', 'ST', 'CF'].includes(slotLabel)) return 'FW';
  return 'MF';
}

// 선호 포지션 매칭 우선순위
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

// 멤버+용병을 포지션 정보로 가져오기
export function getPlayerInfo(id: string): { name: string; positions: Position[] } | null {
  const member = getMembers().find(m => m.id === id);
  if (member) return { name: member.name, positions: member.positions || [] };
  const guest = getGuests().find(g => g.id === id);
  if (guest) return { name: guest.name + ' (용병)', positions: guest.positions || [] };
  return null;
}

// 선호 포지션 기반 라인업 자동 배치
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

  // Pass 1: 정확한 포지션 매치 (선호 포지션 중 하나가 슬롯과 일치)
  for (const slot of slots) {
    const exact = players.find(p => !used.has(p.id) && p.positions.includes(slot.label as Position));
    if (exact) {
      assignment[slot.id] = exact.id;
      used.add(exact.id);
    }
  }

  // Pass 2: 같은 카테고리 내에서 매치 (공격↔공격, 수비↔수비)
  for (const slot of slots) {
    if (assignment[slot.id]) continue;
    const preferred = slotPreference[slot.label] || [];
    const match = players.find(p => !used.has(p.id) && p.positions.some(pos => preferred.includes(pos)));
    if (match) {
      assignment[slot.id] = match.id;
      used.add(match.id);
    }
  }

  // Pass 3: 같은 라인(카테고리)에서 매치
  for (const slot of slots) {
    if (assignment[slot.id]) continue;
    const slotCat = getSlotCategory(slot.label);
    const match = players.find(p => !used.has(p.id) && p.positions.some(pos => getPosCategory(pos) === slotCat));
    if (match) {
      assignment[slot.id] = match.id;
      used.add(match.id);
    }
  }

  // Pass 4: 아무나 배치
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

// 4쿼터 라인업 생성 (로테이션)
export function generateQuarterLineups(
  playerIds: string[],
  formation: string
): { playing: Record<string, string>; resting: string[] }[] {
  const total = playerIds.length;
  const perQuarter = Math.min(11, total);

  return [0, 1, 2, 3].map((qi) => {
    // 로테이션: 쿼터마다 다른 11명이 뛰도록
    const offset = Math.floor((qi * perQuarter) / 2) % total;
    const rotated = [...playerIds.slice(offset), ...playerIds.slice(0, offset)];
    const shuffledRotated = shuffle(rotated);
    const playingIds = shuffledRotated.slice(0, perQuarter);
    const restingIds = shuffledRotated.slice(perQuarter);

    const playing = autoAssignLineup(playingIds, formation);
    return { playing, resting: restingIds };
  });
}
