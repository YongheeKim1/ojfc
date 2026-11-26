// 프로필 사진: 가운데를 정사각형으로 잘라 작게 줄입니다.
// 멤버 정보에 함께 저장되어 모든 멤버가 앱을 열 때마다 받으므로 아주 작게(약 10KB) 만듭니다.
import { loadImage, dataUrlBytes } from './photos';

const AVATAR_PX = 160;          // 화면에서는 최대 56px 정도로 쓰여 2~3배 선명도면 충분
const AVATAR_MAX_BYTES = 14 * 1024;

export async function makeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다');
  const img = await loadImage(file);
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 쓸 수 없습니다');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);

  for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (dataUrlBytes(url) <= AVATAR_MAX_BYTES) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.3);
}
