export type Position =
  | 'GK'
  | 'CB' | 'LB' | 'RB'
  | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM'
  | 'LW' | 'RW' | 'ST' | 'CF';

export const POSITIONS: { value: Position; label: string; category: string }[] = [
  { value: 'GK', label: '골키퍼', category: 'GK' },
  { value: 'CB', label: '센터백', category: 'DF' },
  { value: 'LB', label: '왼쪽 풀백', category: 'DF' },
  { value: 'RB', label: '오른쪽 풀백', category: 'DF' },
  { value: 'CDM', label: '수비형 미드필더', category: 'MF' },
  { value: 'CM', label: '중앙 미드필더', category: 'MF' },
  { value: 'CAM', label: '공격형 미드필더', category: 'MF' },
  { value: 'LM', label: '왼쪽 미드필더', category: 'MF' },
  { value: 'RM', label: '오른쪽 미드필더', category: 'MF' },
  { value: 'LW', label: '왼쪽 윙', category: 'FW' },
  { value: 'RW', label: '오른쪽 윙', category: 'FW' },
  { value: 'ST', label: '스트라이커', category: 'FW' },
  { value: 'CF', label: '센터 포워드', category: 'FW' },
];

export function getPositionColor(pos: Position): string {
  const p = POSITIONS.find(p => p.value === pos);
  if (!p) return 'bg-gray-100 text-gray-700';
  switch (p.category) {
    case 'GK': return 'bg-yellow-100 text-yellow-800';
    case 'DF': return 'bg-blue-100 text-blue-800';
    case 'MF': return 'bg-green-100 text-green-800';
    case 'FW': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
}

export interface Member {
  id: string;
  name: string;
  password: string; // 간단한 비밀번호 (4자리 PIN)
  positions: Position[]; // 선호 포지션 (다중 선택)
  pomCount: number;
  createdAt: number;
}

// 용병: 특정 매치에만 참여하는 선수
export interface Guest {
  id: string;
  name: string;
  phone: string;
  positions: Position[]; // 선호 포지션 (다중 선택)
  matchId: string; // 참여하는 매치 ID
  ratings: GuestRating[];
  createdAt: number;
}

export interface GuestRating {
  score: number;
  comment: string;
  date: number;
}

// 쿼터별 라인업: 11명 출전 + 나머지 휴식
export interface QuarterLineup {
  quarter: 1 | 2 | 3 | 4;
  playing: Record<string, string>; // positionSlot -> memberId or guestId (11명)
  resting: string[]; // 휴식 멤버/용병 IDs
}

export interface GoalRecord {
  playerId: string;
  quarter: number;
}

export interface Match {
  id: string;
  title: string;
  date: number;
  location: string;
  formation: string;
  quarters: QuarterLineup[];
  scoreA: number;
  scoreB: number;
  opponentName: string; // B팀 이름 (빈값이면 "상대팀")
  goals: GoalRecord[]; // 골 기록
  pomId: string | null;
  voters: string[];
  votes: Record<string, string>;
  attendees: string[]; // 참석 확인한 멤버 IDs
  votingStartedAt?: number; // 투표 시작 시간
  status: 'scheduled' | 'lineup' | 'playing' | 'voting' | 'done';
}
