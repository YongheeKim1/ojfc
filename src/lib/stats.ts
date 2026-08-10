// 쿼터별 결과 기반 선수 분석
// - 포지션별 승점률 (그 자리에서 얼마나 잘했나)
// - 페어 시너지 (누구와 같이 뛸 때 잘했나)
//
// 승점률 = (승 + 0.5*무) / 경기수  → 0~1
// 표본이 적을 때 극단값(0% / 100%)이 나오는 걸 막기 위해
// 사전확률 0.5로 스무딩: (점수 + PRIOR_W*0.5) / (판수 + PRIOR_W)

import type { Match, Guest, Member } from './types';
import { FORMATIONS } from './store';

const PRIOR_W = 4; // 스무딩 강도 (가상 4경기를 5할로 친 셈)

// 페어(케미) 판단 최소 표본: 같이 뛴 쿼터 5개 미만이면 "모름(중립)" 취급
// 근거: Bransen & Van Haaren(2020) 등 실제 축구 케미 연구도 소표본 페어는 분산이 커서 제외함
export const MIN_PAIR_SAMPLE = 5;

// 케미 유효 가중 표본 하한 (포지션 연관도 × 표본 신뢰도의 합).
// 매치 추정치(0.25)만으로 채우려면 가까운 자리에서 상당히 많이 붙어 뛰어야 통과합니다.
export const MIN_PAIR_WEIGHTED = 1.2;

// ── 포지션 연관도 (피치 좌표 거리 기반) ──
// 같은 측면 풀백↔윙어, 투톱, 더블 볼란치처럼 "가까운 자리"끼리만 케미가 크게 반영되고,
// 반대편 끝(LW↔RB)처럼 먼 자리는 0에 수렴합니다. (JDI의 존 기반 책임 개념의 단순화)
function slotCoord(formation: string, slotId: string): { x: number; y: number } | null {
  const slots = FORMATIONS[formation] || FORMATIONS['4-2-3-1'];
  const s = slots.find(v => v.id === slotId);
  return s ? { x: s.x, y: s.y } : null;
}

const VERT_SCALE = 0.8;  // 세로(라인 간) 거리 완화 계수 — 같은 측면 상하 연결 보존
const LINK_RANGE = 48;   // 이 거리를 넘으면 연관도 0

/**
 * 피치 좌표 → 포지션 라벨 자동 판정.
 * 전술판에서 선수를 끌어다 놓으면 놓인 위치에 따라 포지션이 바뀝니다.
 * y: 0(상대 골문/공격) ~ 100(우리 골문/수비), x: 0(왼쪽) ~ 100(오른쪽)
 */
export function labelFromCoord(x: number, y: number): string {
  if (y >= 85) return 'GK';
  if (y >= 65) return x < 28 ? 'LB' : x > 72 ? 'RB' : 'CB';   // 수비 라인
  if (y >= 54) return x < 25 ? 'LM' : x > 75 ? 'RM' : 'CDM';  // 수비형 미드
  if (y >= 44) return x < 25 ? 'LM' : x > 75 ? 'RM' : 'CM';   // 중앙 미드
  if (y >= 32) return x < 28 ? 'LW' : x > 72 ? 'RW' : 'CAM';  // 공격형 미드
  return x < 28 ? 'LW' : x > 72 ? 'RW' : 'ST';                // 최전방
}

/** 두 좌표의 연관 가중치 (케미 계산용). GK는 수비 라인하고만 연결. */
export function coordLinkWeight(
  a: { x: number; y: number; label: string },
  b: { x: number; y: number; label: string }
): number {
  if (a.label === 'GK' && !GK_LINKABLE.includes(b.label)) return 0;
  if (b.label === 'GK' && !GK_LINKABLE.includes(a.label)) return 0;
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * VERT_SCALE;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, 1 - d / LINK_RANGE);
}

// 골키퍼는 수비 라인·홀딩 미드와만 연결. (윙어/공격수와의 "케미"는 실제로 의미 없음)
const GK_LINKABLE = ['GK', 'CB', 'LB', 'RB', 'CDM'];

function slotLabel(formation: string, slotId: string): string {
  const slots = FORMATIONS[formation] || FORMATIONS['4-2-3-1'];
  return slots.find(v => v.id === slotId)?.label || slotId;
}

/** 두 슬롯의 연관 가중치 0~1. 가까울수록 1, 멀면 0. */
export function slotLinkWeight(formation: string, slotIdA: string, slotIdB: string): number {
  const a = slotCoord(formation, slotIdA);
  const b = slotCoord(formation, slotIdB);
  if (!a || !b) return 0;

  // GK 예외 규칙: 수비 라인 밖과는 케미를 잡지 않음
  const la = slotLabel(formation, slotIdA);
  const lb = slotLabel(formation, slotIdB);
  if (la === 'GK' && !GK_LINKABLE.includes(lb)) return 0;
  if (lb === 'GK' && !GK_LINKABLE.includes(la)) return 0;

  const dx = a.x - b.x;
  const dy = (a.y - b.y) * VERT_SCALE;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, 1 - d / LINK_RANGE);
}

export interface SlotStat {
  label: string;   // 포지션 라벨 (ST, CB ...)
  played: number;  // 실제 뛴 쿼터 수 (표시용)
  effN: number;    // 표본 가중치 반영 유효 표본 (추정 데이터는 0.25로 계산)
  win: number;
  draw: number;
  loss: number;
  rate: number;    // 스무딩된 승점률 0~1
  rawRate: number; // 가중 승점률 (표시용)
}

export interface PairStat {
  partnerId: string;
  played: number;         // 같이 뛴 쿼터 수 (표본 판단)
  weightedPlayed: number; // 포지션 연관도 가중 쿼터 수 (케미 유효 표본)
  rate: number;           // 스무딩된 케미 승점률
  rawRate: number;
}

export interface PlayerStats {
  playerId: string;
  totalPlayed: number;      // 실제 뛴 쿼터 수
  totalEffN: number;        // 유효 표본 (추정 데이터 0.25 반영)
  exactQuarters: number;    // 쿼터 결과가 실제 입력된 쿼터 수 (0이면 전부 추정치)
  win: number;
  draw: number;
  loss: number;
  overallRate: number;      // 전체 승점률(스무딩)
  bySlot: SlotStat[];       // 포지션별 (played 내림차순)
  pairs: PairStat[];        // 페어 (rate 내림차순)
}

function smooth(points: number, played: number): number {
  if (played <= 0) return 0.5;
  return (points + PRIOR_W * 0.5) / (played + PRIOR_W);
}

// 매치 총점이 실제로 입력됐는지 (0:0은 미입력으로 간주 — 기본값이 0이라 구분 불가)
function hasMatchScore(m: Match): boolean {
  if (m.status !== 'done') return false;
  const a = m.scoreA || 0, b = m.scoreB || 0;
  return !(a === 0 && b === 0);
}

function toPoint(us: number, them: number): number {
  if (us > them) return 1;
  if (us < them) return 0;
  return 0.5;
}

/**
 * 한 쿼터의 승점 + 표본 가중치.
 * - 쿼터 결과가 입력돼 있으면: 그 쿼터의 실제 승패, 가중치 1 (정확)
 * - 없으면: 매치 총점 결과를 물려받되 가중치 0.25 (추정)
 *   한 경기의 4쿼터가 전부 같은 결과라 독립 표본 4개가 아니라 사실상 1개이기 때문입니다.
 *   이렇게 하면 표본 수가 4배로 부풀려져 최소 표본 기준이 무의미해지는 걸 막습니다.
 */
function quarterPoint(m: Match, quarter: number): { pt: number; w: number } | null {
  const r = (m.quarterResults || []).find(q => q.quarter === quarter);
  if (r && typeof r.us === 'number' && typeof r.them === 'number') {
    return { pt: toPoint(r.us, r.them), w: 1 };
  }
  if (hasMatchScore(m)) {
    return { pt: toPoint(m.scoreA || 0, m.scoreB || 0), w: 0.25 };
  }
  return null;
}

// 매치의 쿼터에서 (playerId → {slotId, label, x, y}) 맵
// 전술판에서 자유 이동한 슬롯은 그 좌표로 포지션을 다시 판정합니다.
function quarterPlayerSlots(
  m: Match,
  quarterIdx: number
): Map<string, { slotId: string; label: string; x: number; y: number }> {
  const out = new Map<string, { slotId: string; label: string; x: number; y: number }>();
  const q = (m.quarters || [])[quarterIdx];
  if (!q) return out;
  const slots = FORMATIONS[m.formation] || FORMATIONS['4-2-3-1'];
  const byId: Record<string, { x: number; y: number; label: string }> = {};
  slots.forEach(s => { byId[s.id] = { x: s.x, y: s.y, label: s.label }; });

  for (const [slotId, pid] of Object.entries(q.playing || {})) {
    if (!pid) continue;
    const custom = q.slotPos?.[slotId];
    const base = byId[slotId];
    if (custom) {
      // 자유 이동된 위치 → 좌표로 포지션 재판정
      out.set(pid, { slotId, label: labelFromCoord(custom.x, custom.y), x: custom.x, y: custom.y });
    } else if (base) {
      out.set(pid, { slotId, label: base.label, x: base.x, y: base.y });
    } else {
      out.set(pid, { slotId, label: slotId, x: 50, y: 50 });
    }
  }
  return out;
}

// 결과가 기록된 쿼터가 하나라도 있는 매치
export function hasQuarterResults(m: Match): boolean {
  return (m.quarterResults || []).length > 0;
}

// 분석에 쓸 수 있는 매치: 쿼터 결과가 있거나, 최소한 매치 총점이라도 있는 경우
export function isAnalyzable(m: Match): boolean {
  return hasQuarterResults(m) || hasMatchScore(m);
}

/** 한 선수의 포지션별 승률 + 페어 시너지 */
export function computePlayerStats(playerId: string, matches: Match[]): PlayerStats {
  // played: 실제 뛴 쿼터 수(표시용) / effN·pts: 표본 가중치 반영 합(승률 계산용)
  const slotAgg = new Map<string, { played: number; effN: number; win: number; draw: number; loss: number; pts: number }>();
  // played: 같이 뛴 쿼터 수 / wPlayed·wPts: (표본 가중치 × 포지션 연관도) 가중 합
  const pairAgg = new Map<string, { played: number; wPlayed: number; wPts: number }>();
  let totalPlayed = 0, totalEffN = 0, win = 0, draw = 0, loss = 0, totalPts = 0;
  let exactQuarters = 0; // 쿼터 결과가 실제로 입력된 쿼터 수

  for (const m of matches) {
    if (!isAnalyzable(m)) continue;
    for (let qi = 0; qi < 4; qi++) {
      const res = quarterPoint(m, qi + 1);
      if (res === null) continue;
      const { pt, w } = res;
      const slotMap = quarterPlayerSlots(m, qi);
      const mine = slotMap.get(playerId);
      if (!mine) continue; // 그 쿼터에 안 뛰었음

      totalPlayed++;
      totalEffN += w;
      totalPts += w * pt;
      if (w === 1) exactQuarters++;
      if (pt === 1) win++; else if (pt === 0) loss++; else draw++;

      const s = slotAgg.get(mine.label) || { played: 0, effN: 0, win: 0, draw: 0, loss: 0, pts: 0 };
      s.played++; s.effN += w; s.pts += w * pt;
      if (pt === 1) s.win++; else if (pt === 0) s.loss++; else s.draw++;
      slotAgg.set(mine.label, s);

      // 같은 쿼터에 함께 뛴 선수들 — 피치에서 가까운 자리일수록 케미 가중치↑
      for (const [otherId, other] of slotMap.entries()) {
        if (otherId === playerId) continue;
        const link = coordLinkWeight(mine, other); // 실제 배치 좌표 기준
        const ww = link * w; // 포지션 연관도 × 표본 신뢰도
        const p = pairAgg.get(otherId) || { played: 0, wPlayed: 0, wPts: 0 };
        p.played++;
        p.wPlayed += ww;
        p.wPts += ww * pt;
        pairAgg.set(otherId, p);
      }
    }
  }

  const bySlot: SlotStat[] = Array.from(slotAgg.entries())
    .map(([label, s]) => ({
      label,
      played: s.played, effN: s.effN, win: s.win, draw: s.draw, loss: s.loss,
      rate: smooth(s.pts, s.effN),
      rawRate: s.effN ? s.pts / s.effN : 0,
    }))
    .sort((a, b) => b.played - a.played);

  const pairs: PairStat[] = Array.from(pairAgg.entries())
    .map(([partnerId, p]) => ({
      partnerId,
      played: p.played,
      weightedPlayed: p.wPlayed,
      rate: smooth(p.wPts, p.wPlayed),
      rawRate: p.wPlayed ? p.wPts / p.wPlayed : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  return {
    playerId,
    totalPlayed, totalEffN, exactQuarters, win, draw, loss,
    overallRate: smooth(totalPts, totalEffN),
    bySlot,
    pairs,
  };
}

/** 여러 선수 통계를 한 번에 (라인업 알고리즘용) */
export function computeAllStats(playerIds: string[], matches: Match[]): Map<string, PlayerStats> {
  const map = new Map<string, PlayerStats>();
  for (const id of playerIds) {
    map.set(id, computePlayerStats(id, matches));
  }
  return map;
}

/** 특정 슬롯 라벨에서의 승점률 (기록 없으면 전체 승점률로 대체) */
export function slotRate(stats: PlayerStats | undefined, label: string): number {
  if (!stats) return 0.5;
  const s = stats.bySlot.find(x => x.label === label);
  if (s) return s.rate;
  return stats.overallRate;
}

/**
 * 두 선수 시너지. 유효 표본이 기준 미만이면 중립 0.5.
 * (한 번 이겼다고 100%가 되거나, 매치 추정치로 표본이 부풀려지는 걸 막습니다)
 */
export function pairRate(stats: PlayerStats | undefined, partnerId: string): number {
  if (!stats) return 0.5;
  const p = stats.pairs.find(x => x.partnerId === partnerId);
  if (!p || !isPairReliable(p)) return 0.5;
  return p.rate;
}

/** 케미를 신뢰할 수 있는 페어인지: 같이 뛴 쿼터 5회 이상 + 유효 가중 표본 확보 */
export function isPairReliable(p: PairStat): boolean {
  return p.played >= MIN_PAIR_SAMPLE && p.weightedPlayed >= MIN_PAIR_WEIGHTED;
}

/** 이름 조회 헬퍼 (멤버 + 용병) */
export function playerName(id: string, members: Member[], guests: Guest[]): string {
  const m = members.find(x => x.id === id);
  if (m) return m.name;
  const g = guests.find(x => x.id === id);
  if (g) return g.name + ' (용병)';
  return '알 수 없음';
}
