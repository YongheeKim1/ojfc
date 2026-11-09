import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Images, Upload, X, Trash2, Send, MessageCircle, Loader2, ChevronLeft, ChevronRight, Heart,
} from 'lucide-react';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { Photo, PhotoComment } from '../lib/types';
import {
  preparePhoto, uploadPhoto, fetchPhotos, fetchPhotoData, fetchPhotoCount, deletePhoto, canDeletePhoto,
  subscribeComments, addComment, deleteComment, canDeleteComment, toggleCommentLike,
  formatBytes, MAX_PHOTOS, type PreparedPhoto,
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
  const [count, setCount] = useState<number | null>(null);

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
      setCount(await fetchPhotoCount());
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
    // 1,500장을 넘기면 올릴 수 없습니다
    if (count !== null && count + pending.length > MAX_PHOTOS) {
      const left = Math.max(0, MAX_PHOTOS - count);
      setError(left === 0
        ? `사진은 최대 ${MAX_PHOTOS.toLocaleString()}장까지 올릴 수 있습니다. 오래된 사진을 삭제해주세요.`
        : `${left}장만 더 올릴 수 있습니다. 선택한 사진을 줄여주세요.`);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const created: Photo[] = [];
      for (const p of pending) created.push(await uploadPhoto(p, caption));
      setPhotos(prev => [...created.reverse(), ...prev]);
      setCount(prev => (prev === null ? prev : prev + created.length));
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
      setCount(prev => (prev === null ? prev : Math.max(0, prev - 1)));
      setOpenIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
  };

  const isFull = count !== null && count >= MAX_PHOTOS;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
        <h1 className="text-xl font-bold tracking-tight">오지FC 사진첩</h1>
        <p className="text-blue-200 text-sm mt-1">
          {count === null ? '불러오는 중...' : `사진 ${count.toLocaleString()} / ${MAX_PHOTOS.toLocaleString()}장`}
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
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
            disabled={preparing || uploading || isFull}
            className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {preparing
              ? <><Loader2 size={15} className="animate-spin" /> 사진 줄이는 중...</>
              : isFull
                ? <>사진첩이 가득 찼습니다</>
                : <><Upload size={15} /> 사진 올리기</>}
          </button>
          {isFull && (
            <p className="text-[11px] text-red-600 font-medium mt-2 text-center">
              최대 {MAX_PHOTOS.toLocaleString()}장까지 올릴 수 있습니다. 오래된 사진을 삭제한 뒤 올려주세요.
            </p>
          )}

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
// 사진 확대: 두 손가락 벌리기 / 두 번 탭 / PC 휠, 확대 중엔 드래그로 이동
// ──────────────────────────────────────────

const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;

type ZoomState = { scale: number; x: number; y: number };

function ZoomableImage({
  src, alt, onZoomChange,
}: {
  src: string;
  alt: string;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  // 포인터 이벤트마다 최신 값을 읽어야 해서 ref 에도 둡니다
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);

  // 사진이 화면 밖으로 빠져나가지 않게 이동 범위를 제한합니다
  const clamp = (next: ZoomState): ZoomState => {
    const scale = Math.min(MAX_ZOOM, Math.max(1, next.scale));
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img || scale === 1) return { scale, x: 0, y: 0 };
    const maxX = Math.max(0, (img.offsetWidth * scale - box.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * scale - box.clientHeight) / 2);
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const apply = (next: ZoomState) => {
    const v = clamp(next);
    viewRef.current = v;
    setView(v);
    onZoomChange(v.scale > 1);
  };

  // 화면의 한 점을 기준으로 배율을 바꿉니다 (그 점이 손가락 아래 그대로 남도록)
  const zoomAt = (clientX: number, clientY: number, scale: number) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const px = clientX - r.left - r.width / 2;
    const py = clientY - r.top - r.height / 2;
    const cur = viewRef.current;
    const nextScale = Math.min(MAX_ZOOM, Math.max(1, scale));
    const k = nextScale / cur.scale;
    apply({ scale: nextScale, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k });
  };

  const pinchInfo = () => {
    const [a, b] = Array.from(pointers.current.values());
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = false;
    if (pointers.current.size === 2) pinch.current = pinchInfo();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) > 2) moved.current = true;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const now = pinchInfo();
      zoomAt(now.mid.x, now.mid.y, viewRef.current.scale * (now.dist / pinch.current.dist));
      // 두 손가락을 같이 움직이면 사진도 따라 이동
      const after = viewRef.current;
      apply({ ...after, x: after.x + now.mid.x - pinch.current.mid.x, y: after.y + now.mid.y - pinch.current.mid.y });
      pinch.current = now;
      return;
    }
    if (pointers.current.size === 1 && viewRef.current.scale > 1) {
      const cur = viewRef.current;
      apply({ ...cur, x: cur.x + e.clientX - prev.x, y: cur.y + e.clientY - prev.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinching = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (wasPinching || moved.current) return;

    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (viewRef.current.scale > 1) apply({ scale: 1, x: 0, y: 0 });
      else zoomAt(e.clientX, e.clientY, DOUBLE_TAP_ZOOM);
    } else {
      lastTap.current = now;
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.clientX, e.clientY, viewRef.current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  return (
    <div
      ref={boxRef}
      data-testid="zoom-box"
      className="w-full h-full flex items-center justify-center overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
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
  const [zoomed, setZoomed] = useState(false);

  // 사진을 넘기면 확대 상태도 초기화됩니다 (ZoomableImage 가 새로 만들어짐)
  useEffect(() => { setZoomed(false); }, [photo.id]);

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
        <ZoomableImage key={photo.id} src={src} alt={photo.caption || ''} onZoomChange={setZoomed} />
        {hasPrev && !zoomed && (
          <button onClick={onPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center">
            <ChevronLeft size={20} />
          </button>
        )}
        {hasNext && !zoomed && (
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
                  {(() => {
                    const likes = c.likes || [];
                    const liked = likes.includes(meId);
                    return (
                      <button
                        onClick={() => toggleCommentLike(c)}
                        aria-label={liked ? '좋아요 취소' : '좋아요'}
                        className={`flex items-center gap-0.5 shrink-0 text-[11px] font-bold px-1 ${liked ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}
                      >
                        <Heart size={14} className={liked ? 'fill-red-500' : ''} />
                        {likes.length > 0 && <span>{likes.length}</span>}
                      </button>
                    );
                  })()}
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
