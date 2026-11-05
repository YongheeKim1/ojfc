import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Images, Upload, X, Trash2, Send, MessageCircle, Loader2, HardDrive, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { Photo, PhotoComment } from '../lib/types';
import {
  preparePhoto, uploadPhoto, fetchPhotos, fetchPhotoData, fetchUsage, deletePhoto, canDeletePhoto,
  subscribeComments, addComment, deleteComment, canDeleteComment,
  formatBytes, PHOTO_BUDGET_BYTES, type PreparedPhoto,
} from '../lib/photos';
import { getCurrentUser } from '../lib/store';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

export default function PhotosPage() {
  const me = getCurrentUser();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [usage, setUsage] = useState<{ bytes: number; count: number } | null>(null);

  // 업로드
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PreparedPhoto[]>([]);
  const [caption, setCaption] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // 사진 보기
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPhotos();
      setPhotos(page.photos);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setUsage(await fetchUsage());
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPhotos(cursor);
      setPhotos(prev => [...prev, ...page.photos]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleFiles = async (files: FileList) => {
    setError('');
    setPreparing(true);
    try {
      const list: PreparedPhoto[] = [];
      for (const file of Array.from(files).slice(0, 10)) {
        try { list.push(await preparePhoto(file)); }
        catch (err) { setError(err instanceof Error ? err.message : '이미지를 처리하지 못했습니다'); }
      }
      setPending(prev => [...prev, ...list]);
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (pending.length === 0) return;
    const addBytes = pending.reduce((s, p) => s + p.bytes, 0);
    if (usage && usage.bytes + addBytes > PHOTO_BUDGET_BYTES) {
      setError('저장 공간이 부족합니다. 오래된 사진을 정리해주세요.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const created: Photo[] = [];
      for (const p of pending) created.push(await uploadPhoto(p, caption));
      setPhotos(prev => [...created.reverse(), ...prev]);
      setUsage(prev => prev ? { bytes: prev.bytes + addBytes, count: prev.count + created.length } : prev);
      setPending([]);
      setCaption('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: Photo) => {
    if (!confirm('이 사진을 삭제할까요? 댓글도 함께 삭제됩니다.')) return;
    try {
      await deletePhoto(photo);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      setUsage(prev => prev ? { bytes: Math.max(0, prev.bytes - photo.bytes), count: prev.count - 1 } : prev);
      setOpenIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
  };

  const usedPct = usage ? Math.min(100, (usage.bytes / PHOTO_BUDGET_BYTES) * 100) : 0;
  // 지금까지 올린 사진의 평균 용량으로 남은 장수를 추정합니다.
  const avgBytes = usage && usage.count > 0 ? usage.bytes / usage.count : 260 * 1024;
  const remaining = usage ? Math.max(0, Math.floor((PHOTO_BUDGET_BYTES - usage.bytes) / avgBytes)) : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Images size={20} /> 오지FC 사진첩
        </h1>
        <p className="text-blue-200 text-sm mt-1">
          {usage ? `사진 ${usage.count}장` : '불러오는 중...'}
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* 저장 공간 */}
        {usage && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <HardDrive size={13} className="text-[#1e3a5f]" /> 저장 공간
              </span>
              <span className="text-[11px] text-gray-500 font-medium">
                {formatBytes(usage.bytes)} / {formatBytes(PHOTO_BUDGET_BYTES)}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${usedPct > 85 ? 'bg-red-500' : 'bg-[#16a34a]'}`}
                style={{ width: `${Math.max(1, usedPct)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              앞으로 약 {remaining?.toLocaleString()}장 더 올릴 수 있습니다 · 무료 요금제 한도 안에서 운영됩니다
            </p>
          </div>
        )}

        {/* 업로드 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={preparing || uploading}
            className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {preparing
              ? <><Loader2 size={15} className="animate-spin" /> 사진 줄이는 중...</>
              : <><Upload size={15} /> 사진 올리기</>}
          </button>

          {pending.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pending.map((p, i) => (
                  <div key={i} className="relative shrink-0">
                    <img src={p.thumb} alt="" className="w-16 h-16 object-cover rounded-lg" />
                    <button
                      onClick={() => setPending(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <input
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="사진 설명 (선택)"
                maxLength={100}
                className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
              />
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-2 w-full py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-bold disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                {uploading
                  ? <><Loader2 size={15} className="animate-spin" /> 올리는 중...</>
                  : <>{pending.length}장 올리기 · {formatBytes(pending.reduce((s, p) => s + p.bytes, 0))}</>}
              </button>
            </div>
          )}

          {error && <p className="text-[11px] text-red-600 font-medium mt-2">{error}</p>}
        </div>

        {/* 사진 그리드 */}
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 size={24} className="animate-spin text-gray-300 mx-auto" />
          </div>
        ) : photos.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <Images size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500 font-medium">아직 사진이 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">첫 사진을 올려보세요!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setOpenIndex(i)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                >
                  <img src={photo.thumb} alt={photo.caption || ''} className="w-full h-full object-cover" loading="lazy" />
                  {!!photo.commentCount && (
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold">
                      <MessageCircle size={9} /> {photo.commentCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600"
              >
                {loadingMore ? '불러오는 중...' : '더 보기'}
              </button>
            )}
          </>
        )}
      </div>

      {openIndex !== null && photos[openIndex] && (
        <PhotoViewer
          photo={photos[openIndex]}
          hasPrev={openIndex > 0}
          hasNext={openIndex < photos.length - 1}
          onPrev={() => setOpenIndex(i => (i === null ? i : Math.max(0, i - 1)))}
          onNext={() => setOpenIndex(i => (i === null ? i : Math.min(photos.length - 1, i + 1)))}
          onClose={() => setOpenIndex(null)}
          onDelete={handleDelete}
          onCommentChange={(photoId, delta) =>
            setPhotos(prev => prev.map(p =>
              p.id === photoId ? { ...p, commentCount: Math.max(0, (p.commentCount || 0) + delta) } : p
            ))
          }
          meId={me?.id ?? ''}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// 사진 보기 + 댓글
// ──────────────────────────────────────────

function PhotoViewer({
  photo, hasPrev, hasNext, onPrev, onNext, onClose, onDelete, onCommentChange, meId,
}: {
  photo: Photo;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDelete: (photo: Photo) => void;
  onCommentChange: (photoId: string, delta: number) => void;
  meId: string;
}) {
  const [src, setSrc] = useState<string>(photo.thumb);
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // 원본은 열었을 때만 받아옵니다 (목록에서는 썸네일만 씁니다)
  useEffect(() => {
    let alive = true;
    setSrc(photo.thumb);
    fetchPhotoData(photo.id).then(data => { if (alive && data) setSrc(data); });
    return () => { alive = false; };
  }, [photo.id, photo.thumb]);

  // 댓글은 이 사진을 보고 있는 동안만 구독합니다
  useEffect(() => subscribeComments(photo.id, setComments), [photo.id]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(photo.id, body);
      onCommentChange(photo.id, 1);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (c: PhotoComment) => {
    await deleteComment(c);
    onCommentChange(photo.id, -1);
  };

  return (
    // 하단 탭바(z-50)와 상단 헤더(z-40)보다 위에 떠야 댓글 입력창이 가려지지 않습니다
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col">
      {/* 상단 바 */}
      <div
        className="flex items-center justify-between px-4 pb-3 text-white shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10">
          <X size={20} />
        </button>
        <div className="text-center min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{photo.uploaderName}</p>
          <p className="text-[11px] text-white/60">{timeAgo(photo.createdAt)}</p>
        </div>
        {canDeletePhoto(photo) ? (
          <button
            onClick={() => onDelete(photo)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-red-400"
          >
            <Trash2 size={18} />
          </button>
        ) : <div className="w-9" />}
      </div>

      {/* 사진 */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <img src={src} alt={photo.caption || ''} className="max-w-full max-h-full object-contain" />
        {hasPrev && (
          <button onClick={onPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center">
            <ChevronLeft size={20} />
          </button>
        )}
        {hasNext && (
          <button onClick={onNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center">
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {/* 설명 + 댓글 */}
      <div className="bg-white rounded-t-2xl shrink-0 max-h-[52vh] flex flex-col">
        {photo.caption && (
          <p className="px-4 pt-3 text-sm text-gray-800 font-medium">{photo.caption}</p>
        )}
        <div className="px-4 py-2 text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
          <MessageCircle size={12} /> 댓글 {comments.length}
        </div>

        <div className="flex-1 overflow-y-auto px-4 min-h-[60px]">
          {comments.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">첫 댓글을 남겨보세요</p>
          ) : (
            <div className="space-y-2.5 pb-2">
              {comments.map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#1e3a5f] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className={`font-bold ${c.memberId === meId ? 'text-[#16a34a]' : 'text-gray-800'}`}>
                        {c.name}
                      </span>
                      <span className="text-gray-400 ml-1.5 text-[10px]">{timeAgo(c.createdAt)}</span>
                    </p>
                    <p className="text-sm text-gray-700 break-words">{c.text}</p>
                  </div>
                  {canDeleteComment(c) && (
                    <button onClick={() => removeComment(c)} className="text-gray-300 hover:text-red-500 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="flex gap-2 px-4 pt-2 border-t border-gray-100"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="댓글 달기..."
            maxLength={500}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="px-4 bg-[#1e3a5f] text-white rounded-xl disabled:bg-gray-300 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
