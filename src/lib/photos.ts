import { db } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot,
  query, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, increment, updateDoc,
  getCountFromServer,
} from 'firebase/firestore';
import type { Photo, PhotoComment } from './types';
import { getCurrentUser, isAdmin } from './store';

// ──────────────────────────────────────────
// 장수 한도
//
// 무료(Spark) 요금제의 저장 용량은 1 GiB 입니다.
// 사진 한 장이 최대 약 430 KB 이므로 1,500장이면 넉넉히 한도 안에 들어옵니다.
// 용량을 따지지 않고 장수로만 막아, 한도를 넘길 일이 없게 합니다.
// ──────────────────────────────────────────
export const MAX_PHOTOS = 1500;

/** Firestore 문서 하나의 최대 크기는 1 MiB — 여유를 두고 자릅니다 */
const MAX_DOC_BYTES = 900 * 1024;

const FULL_MAX_EDGE = 1280;   // 원본 저장 시 긴 변 최대 픽셀
const THUMB_MAX_EDGE = 320;   // 목록 썸네일

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ──────────────────────────────────────────
// 이미지 축소
// ──────────────────────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열지 못했습니다')); };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 쓸 수 없습니다');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** data URL 의 실제 바이트 수 (base64 는 원본보다 약 1/3 큽니다) */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** 품질을 낮춰가며 limit 바이트 안에 들어오게 만듭니다 */
function toJpegUnder(canvas: HTMLCanvasElement, limitBytes: number): string {
  for (const q of [0.82, 0.72, 0.62, 0.5, 0.4, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (dataUrlBytes(url) <= limitBytes) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.25);
}

export interface PreparedPhoto {
  full: string;
  thumb: string;
  width: number;
  height: number;
  bytes: number;
}

/** 업로드 전에 사진을 줄입니다 (원본 + 썸네일) */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다');
  const img = await loadImage(file);

  const fullCanvas = drawScaled(img, FULL_MAX_EDGE);
  const full = toJpegUnder(fullCanvas, MAX_DOC_BYTES);

  const thumbCanvas = drawScaled(img, THUMB_MAX_EDGE);
  const thumb = toJpegUnder(thumbCanvas, 60 * 1024);

  return {
    full,
    thumb,
    width: img.width,
    height: img.height,
    bytes: dataUrlBytes(full) + dataUrlBytes(thumb),
  };
}

// ──────────────────────────────────────────
// 읽기
// ──────────────────────────────────────────

export const PHOTOS_PAGE_SIZE = 24;

export interface PhotoPage {
  photos: Photo[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * 사진 목록을 페이지 단위로 읽습니다.
 * 한 번에 다 읽지 않는 이유: 무료 요금제의 하루 읽기 한도(5만 건)를 아끼기 위해서입니다.
 */
export async function fetchPhotos(after?: QueryDocumentSnapshot<DocumentData> | null): Promise<PhotoPage> {
  const base = [orderBy('createdAt', 'desc'), limit(PHOTOS_PAGE_SIZE)];
  const q = after
    ? query(collection(db, 'photos'), orderBy('createdAt', 'desc'), startAfter(after), limit(PHOTOS_PAGE_SIZE))
    : query(collection(db, 'photos'), ...base);
  const snap = await getDocs(q);
  return {
    photos: snap.docs.map(d => ({ ...d.data(), id: d.id }) as Photo),
    cursor: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === PHOTOS_PAGE_SIZE,
  };
}

/** 홈 화면 미리보기용 — 최신 몇 장의 썸네일만 */
export async function fetchRecentPhotos(n: number): Promise<Photo[]> {
  const snap = await getDocs(query(collection(db, 'photos'), orderBy('createdAt', 'desc'), limit(n)));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Photo);
}

/** 원본 이미지는 사진을 열 때만 불러옵니다 */
export async function fetchPhotoData(photoId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'photoData', photoId));
  return snap.exists() ? (snap.data().data as string) : null;
}

/**
 * 사진 장수만 세어 옵니다.
 * 문서를 전부 읽지 않고 서버에서 개수만 받아오므로 읽기 한도를 거의 쓰지 않습니다.
 */
export async function fetchPhotoCount(): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'photos'));
  return snap.data().count;
}

// ──────────────────────────────────────────
// 쓰기
// ──────────────────────────────────────────

export async function uploadPhoto(prepared: PreparedPhoto, caption: string): Promise<Photo> {
  const user = getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  // 화면에서 걸러도 여러 명이 동시에 올리면 넘을 수 있어 여기서 한 번 더 확인합니다.
  if (await fetchPhotoCount() >= MAX_PHOTOS) {
    throw new Error(`사진은 최대 ${MAX_PHOTOS.toLocaleString()}장까지 올릴 수 있습니다. 오래된 사진을 삭제해주세요.`);
  }

  const id = genId();
  const photo: Photo = {
    id,
    caption: caption.trim(),
    uploaderId: user.id,
    uploaderName: user.name,
    createdAt: Date.now(),
    thumb: prepared.thumb,
    width: prepared.width,
    height: prepared.height,
    bytes: prepared.bytes,
    commentCount: 0,
  };

  // 원본을 먼저 저장해야, 목록에 뜨는 사진은 항상 열 수 있습니다.
  await setDoc(doc(db, 'photoData', id), { id, data: prepared.full });
  await setDoc(doc(db, 'photos', id), photo);
  return photo;
}

/** 올린 본인 또는 운영진만 지울 수 있습니다 */
export function canDeletePhoto(photo: Photo): boolean {
  const user = getCurrentUser();
  return !!user && (photo.uploaderId === user.id || isAdmin());
}

export async function deletePhoto(photo: Photo): Promise<void> {
  if (!canDeletePhoto(photo)) throw new Error('삭제 권한이 없습니다');
  // 댓글 → 원본 → 목록 순서로 지워야 중간에 끊겨도 고아 데이터가 남지 않습니다.
  const comments = await getDocs(collection(db, 'photos', photo.id, 'comments'));
  await Promise.all(comments.docs.map(c => deleteDoc(c.ref)));
  await deleteDoc(doc(db, 'photoData', photo.id));
  await deleteDoc(doc(db, 'photos', photo.id));
}

// ──────────────────────────────────────────
// 댓글
// ──────────────────────────────────────────

/** 사진을 열고 있는 동안만 구독합니다 (닫으면 해제) */
export function subscribeComments(photoId: string, cb: (list: PhotoComment[]) => void): () => void {
  const q = query(collection(db, 'photos', photoId, 'comments'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ ...d.data(), id: d.id }) as PhotoComment));
  });
}

export async function addComment(photoId: string, text: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const body = text.trim();
  if (!body) return;

  const id = genId();
  const comment: PhotoComment = {
    id, photoId, memberId: user.id, name: user.name,
    text: body.slice(0, 500), createdAt: Date.now(),
  };
  await setDoc(doc(db, 'photos', photoId, 'comments', id), comment);
  await updateDoc(doc(db, 'photos', photoId), { commentCount: increment(1) });
}

export function canDeleteComment(comment: PhotoComment): boolean {
  const user = getCurrentUser();
  return !!user && (comment.memberId === user.id || isAdmin());
}

export async function deleteComment(comment: PhotoComment): Promise<void> {
  if (!canDeleteComment(comment)) throw new Error('삭제 권한이 없습니다');
  await deleteDoc(doc(db, 'photos', comment.photoId, 'comments', comment.id));
  await updateDoc(doc(db, 'photos', comment.photoId), { commentCount: increment(-1) });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
