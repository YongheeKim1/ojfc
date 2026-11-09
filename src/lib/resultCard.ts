// 경기 결과를 이미지 한 장으로 만들어 카톡 등에 공유합니다.
// 외부 라이브러리 없이 캔버스로 직접 그립니다.

export interface ResultCardInput {
  title: string;
  dateText: string;
  location?: string;
  teamName: string;
  opponentName: string;
  scoreA: number;
  scoreB: number;
  goals: string[];       // 예: "1Q 김용희"
  pomNames: string[];    // 확정된 POM
  showVote: boolean;     // POM 미정 + 투표 진행 중이면 투표 안내 표시
}

const W = 1080;
const H = 1080;
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 가운데 정렬 텍스트. 폭을 넘으면 글자 크기를 줄입니다. */
function centerText(
  ctx: CanvasRenderingContext2D,
  text: string, y: number, size: number, weight: string, color: string, maxWidth = W - 120,
) {
  let s = size;
  ctx.fillStyle = color;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth || s <= 18) break;
    s -= 2;
  } while (true);
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, y);
  return s;
}

export async function buildResultCard(input: ResultCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 쓸 수 없습니다');

  // 배경
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1e3a5f');
  bg.addColorStop(1, '#0f2238');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 잔디 느낌의 아래쪽 띠
  const grass = ctx.createLinearGradient(0, H - 220, 0, H);
  grass.addColorStop(0, 'rgba(22,163,74,0)');
  grass.addColorStop(1, 'rgba(22,163,74,0.30)');
  ctx.fillStyle = grass;
  ctx.fillRect(0, H - 220, W, 220);

  // 헤더
  centerText(ctx, '오지FC', 110, 40, '800', 'rgba(255,255,255,0.65)');
  centerText(ctx, input.title, 180, 52, '800', '#ffffff');
  const sub = [input.dateText, input.location].filter(Boolean).join(' · ');
  centerText(ctx, sub, 232, 30, '500', 'rgba(255,255,255,0.55)');

  // 스코어 박스
  const boxY = 290;
  const boxH = 300;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, 70, boxY, W - 140, boxH, 40);
  ctx.fill();

  const leftX = 70 + (W - 140) * 0.27;
  const rightX = 70 + (W - 140) * 0.73;

  ctx.textAlign = 'center';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(input.teamName, leftX, boxY + 86);
  ctx.fillText(input.opponentName, rightX, boxY + 86);

  ctx.font = `900 150px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(input.scoreA), leftX, boxY + 232);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(String(input.scoreB), rightX, boxY + 232);

  ctx.font = `800 46px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(':', W / 2, boxY + 215);

  // 결과 한 줄 (승/무/패)
  const verdict = input.scoreA > input.scoreB ? '승리' : input.scoreA < input.scoreB ? '패배' : '무승부';
  const verdictColor = input.scoreA > input.scoreB ? '#4ade80' : input.scoreA < input.scoreB ? '#f87171' : '#fbbf24';
  centerText(ctx, verdict, boxY + boxH + 62, 38, '800', verdictColor);

  // 득점자
  let y = boxY + boxH + 130;
  if (input.goals.length > 0) {
    centerText(ctx, '득점', y, 28, '700', 'rgba(255,255,255,0.45)');
    y += 52;
    // 한 줄에 두 명씩 묶어 너무 길어지지 않게 합니다.
    const rows: string[] = [];
    for (let i = 0; i < input.goals.length; i += 2) {
      rows.push(input.goals.slice(i, i + 2).join('   ·   '));
    }
    for (const row of rows.slice(0, 5)) {
      centerText(ctx, row, y, 36, '600', '#ffffff');
      y += 50;
    }
    if (rows.length > 5) {
      centerText(ctx, `외 ${input.goals.length - 10}골`, y, 28, '500', 'rgba(255,255,255,0.5)');
      y += 46;
    }
  } else {
    centerText(ctx, '득점 기록 없음', y, 30, '500', 'rgba(255,255,255,0.4)');
    y += 52;
  }

  // 하단 안내
  if (input.pomNames.length > 0) {
    const label = input.pomNames.length > 1 ? '공동 POM' : 'POM';
    centerText(ctx, `⭐ ${label} · ${input.pomNames.join(', ')}`, H - 120, 40, '800', '#fde047');
  } else if (input.showVote) {
    const pillW = 440;
    const pillH = 92;
    ctx.fillStyle = '#16a34a';
    roundRect(ctx, (W - pillW) / 2, H - 180, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('POM 투표하기', W / 2, H - 120);
  }
  centerText(ctx, '오지FC 앱에서 확인하세요', H - 50, 26, '500', 'rgba(255,255,255,0.4)');

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다'))), 'image/png');
  });
}

/**
 * 이미지와 글을 함께 공유합니다.
 * 이미지 공유를 지원하지 않는 환경에서는 글만 공유하고, 그것도 안 되면 복사합니다.
 */
export async function shareResult(blob: Blob, text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const file = new File([blob], 'ojfc-result.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
    }
  }

  // 공유 기능이 없으면 이미지를 내려받고 글은 복사합니다.
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ojfc-result.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch { /* 복사 실패는 넘어감 */ }
  return 'copied';
}
