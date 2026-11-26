import { useEffect, useRef, useState } from 'react';
import { X, Camera, Trash2, Loader2 } from 'lucide-react';
import { getMemberAvatar, fetchAvatarLarge, getCurrentUser, setMyAvatar } from '../lib/store';
import { makeAvatar } from '../lib/avatar';

// 어디서든 openAvatar(멤버ID, 이름)를 부르면 앱 전체에 하나뿐인 크게 보기 창이 열립니다
type Target = { memberId: string; name: string };
let listener: ((t: Target | null) => void) | null = null;

export function openAvatar(memberId: string, name: string) {
  listener?.({ memberId, name });
}

/** 프로필 사진 크게 보기 (내 사진이면 변경·삭제도 여기서) */
export default function AvatarViewer() {
  const [target, setTarget] = useState<Target | null>(null);
  const [large, setLarge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listener = setTarget;
    return () => { listener = null; };
  }, []);

  // 큰 사진은 열 때만 받아옵니다 (그동안은 작은 사진을 보여줌)
  useEffect(() => {
    setLarge(null);
    if (!target) return;
    let alive = true;
    fetchAvatarLarge(target.memberId).then(url => { if (alive) setLarge(url); }).catch(() => {});
    return () => { alive = false; };
  }, [target]);

  if (!target) return null;
  const small = getMemberAvatar(target.memberId);
  const src = large ?? small;
  const isMe = getCurrentUser()?.id === target.memberId;
  const close = () => setTarget(null);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const { small: s, large: l } = await makeAvatar(file);
      await setMyAvatar(s, l);
      setLarge(l);
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진을 저장하지 못했습니다');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDelete = async () => {
    if (!confirm('프로필 사진을 삭제할까요?')) return;
    await setMyAvatar(null);
    close();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" onClick={close}>
      <div
        className="flex items-center justify-between px-4 pb-3 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <span className="text-base font-bold">{target.name}</span>
        <button onClick={close} aria-label="닫기" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        {src ? (
          <img
            src={src}
            alt={target.name}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm aspect-square rounded-2xl object-cover"
          />
        ) : (
          <p className="text-white/60 text-sm">프로필 사진이 없습니다</p>
        )}
      </div>

      {isMe && (
        <div
          className="flex gap-2 px-6 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          onClick={e => e.stopPropagation()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex-1 py-3 rounded-xl bg-white text-[#1e3a5f] text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} 사진 변경
          </button>
          {src && (
            <button
              onClick={onDelete}
              className="px-4 py-3 rounded-xl bg-white/10 text-red-300 text-sm font-bold flex items-center gap-1.5"
            >
              <Trash2 size={15} /> 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
