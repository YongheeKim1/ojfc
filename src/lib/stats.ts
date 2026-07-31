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

export interface SlotStat {
  label: string;   // 포지션 라벨 (ST, CB ...)
  played: number;
  win: number;
  draw: number;
  loss: number;
  rate: number;    // 스무딩된 승점률 0~1
  rawRate: number; // 실제 승점률 (표시용)
}

export interface PairStat {
  partnerId: string;
  played: number;
  rate: number;    // 스무딩된 승점률
  rawRate: number;
}

export interface PlayerStats {
  playerId: string;
  totalPlayed: number;
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

// 쿼터 결과 → 승점 (승 1, 무 0.5, 패 0). 결과 없으면 null
function quarterPoint(m: Match, quarter: number): number | null {
  const r = (m.quarterResults || []).find(q => q.quarter === quarter);
  if (!r) return null;
  if (typeof r.us !== 'number' || typeof r.them !== 'number') return null;
  if (r.us > r.them) return 1;
  if (r.us < r.them) return 0;
  return 0.5;
}

// 매치의 쿼터에서 (playerId → 슬롯 라벨) 맵
function quarterPlayerSlots(m: Match, quarterIdx: number): Map<string, string> {
  const out = new Map<string, string>();
  const q = (m.quarters || [])[quarterIdx];
  if (!q) return out;
  const slots = FORMATIONS[m.formation] || FORMATIONS['4-2-3-1'];
  const labelById: Record<string, string> = {};
  slots.forEach(s => { labelById[s.id] = s.label; });
  for (const [slotId, pid] of Object.entries(q.playing || {})) {
    if (pid) out.set(pid, labelById[slotId] || slotId);
  }
  return out;
}

// 결과가 기록된 쿼터가 하나라도 있는 매치만 분석 대상
export function hasQuarterResults(m: Match): boolean {
  return (m.quarterResults || []).length > 0;
}

/** 한 선수의 포지션별 승률 + 페어 시너지 */
export function computePlayerStats(playerId: string, matches: Match[]): PlayerStats {
  const slotAgg = new Map<string, { played: number; win: number; draw: number; loss: number; pts: number }>();
  const pairAgg = new Map<string, { played: number; pts: number }>();
  let totalPlayed = 0, win = 0, draw = 0, loss = 0, totalPts = 0;

  for (const m of matches) {
    if (!hasQuarterResults(m)) continue;
    for (let qi = 0; qi < 4; qi++) {
      const pt = quarterPoint(m, qi + 1);
      if (pt === null) continue;
      const slotMap = quarterPlayerSlots(m, qi);
      const myLabel = slotMap.get(playerId);
      if (!myLabel) continue; // 그 쿼터에 안 뛰었음

      totalPlayed++;
      totalPts += pt;
      if (pt === 1) win++; else if (pt === 0) loss++; else draw++;

      const s = slotAgg.get(myLabel) || { played: 0, win: 0, draw: 0, loss: 0, pts: 0 };
      s.played++; s.pts += pt;
      if (pt === 1) s.win++; else if (pt === 0) s.loss++; else s.draw++;
      slotAgg.set(myLabel, s);

      // 같은 쿼터에 함께 뛴 선수들
      for (const otherId of slotMap.keys()) {
        if (otherId === playerId) continue;
        const p = pairAgg.get(otherId) || { played: 0, pts: 0 };
        p.played++; p.pts += pt;
        pairAgg.set(otherId, p);
      }
    }
  }

  const bySlot: SlotStat[] = Array.from(slotAgg.entries())
    .map(([label, s]) => ({
      label,
      played: s.played, win: s.win, draw: s.draw, loss: s.loss,
      rate: smooth(s.pts, s.played),
      rawRate: s.played ? s.pts / s.played : 0,
    }))
    .sort((a, b) => b.played - a.played);

  const pairs: PairStat[] = Array.from(pairAgg.entries())
    .map(([partnerId, p]) => ({
      partnerId,
      played: p.played,
      rate: smooth(p.pts, p.played),
      rawRate: p.played ? p.pts / p.played : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  return {
    playerId,
    totalPlayed, win, draw, loss,
    overallRate: smooth(totalPts, totalPlayed),
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

/** 두 선수 시너지 (기록 없으면 중립 0.5) */
export function pairRate(stats: PlayerStats | undefined, partnerId: string): number {
  if (!stats) return 0.5;
  const p = stats.pairs.find(x => x.partnerId === partnerId);
  return p ? p.rate : 0.5;
}

/** 이름 조회 헬퍼 (멤버 + 용병) */
export function playerName(id: string, members: Member[], guests: Guest[]): string {
  const m = members.find(x => x.id === id);
  if (m) return m.name;
  const g = guests.find(x => x.id === id);
  if (g) return g.name + ' (용병)';
  return '알 수 없음';
}
