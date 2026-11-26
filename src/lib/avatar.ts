// 프로필 사진: 가운데를 정사각형으로 잘라 두 가지 크기로 만듭니다.
//  - small: 멤버 정보에 함께 저장 → 모든 멤버가 앱을 열 때마다 받으므로 아주 작게(160px, 약 10KB)
//  - large: 따로 저장 → 사진을 눌러 크게 볼 때만 불러옴(720px)
import { loadImage, dataUrlBytes } from './photos';

const SMALL_PX = 160;
const SMALL_MAX_BYTES = 14 * 1024;
const LARGE_PX = 720;
const LARGE_MAX_BYTES = 180 * 1024;

function squareJpeg(img: HTMLImageElement, px: number, maxBytes: number): string {
  const side = Math.min(img.width, img.height);
  const out = Math.min(px, side); // 원본보다 크게 늘리지 않음
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 쓸 수 없습니다');
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (dataUrlBytes(url) <= maxBytes) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.3);
}

export async function makeAvatar(file: File): Promise<{ small: string; large: string }> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다');
  const img = await loadImage(file);
  return {
    small: squareJpeg(img, SMALL_PX, SMALL_MAX_BYTES),
    large: squareJpeg(img, LARGE_PX, LARGE_MAX_BYTES),
  };
}
