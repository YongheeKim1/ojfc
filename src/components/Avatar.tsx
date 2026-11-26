import { useEffect, useState } from 'react';
import { getMemberAvatar, subscribe } from '../lib/store';
import { openAvatar } from './AvatarViewer';

/**
 * 프로필 사진 (없으면 이름 첫 글자).
 * 멤버 목록이 바뀌면 다시 그려서, 누가 사진을 바꿔도 모든 화면에 바로 반영됩니다.
 * zoomable 이면 사진을 눌렀을 때 크게 보여줍니다 (사진이 있을 때만).
 */
export default function Avatar({
  memberId, name, size, className = 'bg-[#1e3a5f] text-white', zoomable = false,
}: {
  memberId?: string | null;
  name: string;
  size: number;          // px
  className?: string;    // 사진이 없을 때 배경·글자색
  zoomable?: boolean;
}) {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick(t => t + 1)), []);

  const src = memberId ? getMemberAvatar(memberId) : null;
  const style = { width: size, height: size };

  if (src) {
    const img = <img src={src} alt={name} style={style} className="rounded-full object-cover shrink-0" draggable={false} />;
    if (!zoomable || !memberId) return img;
    return (
      <span
        role="button"
        aria-label={`${name} 프로필 사진 크게 보기`}
        className="shrink-0 rounded-full cursor-zoom-in"
        onClick={e => { e.stopPropagation(); openAvatar(memberId, name); }}
      >
        {img}
      </span>
    );
  }
  return (
    <div
      style={{ ...style, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
    >
      {name.charAt(0)}
    </div>
  );
}
