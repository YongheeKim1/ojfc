// 브라우저용 Node `crypto` 최소 구현.
//
// 암호가 걸린 은행 엑셀을 복호화하는 office-crypto 가 Node의 crypto를 쓰는데,
// 브라우저에는 없습니다. crypto-browserify 는 Node 스트림까지 끌고 와서 무겁고
// 번들 호환 문제가 있어, 실제로 쓰이는 5개 함수만 @noble 구현으로 대체합니다.
//
// office-crypto 의 사용 패턴이 단순해서(한 번 update → final, 패딩 없음) 이 정도로 충분합니다.
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { md5 } from '@noble/hashes/legacy.js';
import { hmac as nobleHmac } from '@noble/hashes/hmac.js';
import { cbc, ecb } from '@noble/ciphers/aes.js';

type Hasher = typeof sha512;

function pickHash(algorithm: string): Hasher {
  switch (algorithm.toLowerCase().replace(/-/g, '')) {
    case 'sha1': return sha1 as unknown as Hasher;
    case 'sha256': return sha256 as unknown as Hasher;
    case 'sha384': return sha384 as unknown as Hasher;
    case 'sha512': return sha512;
    case 'md5': return md5 as unknown as Hasher;
    default: throw new Error(`지원하지 않는 해시: ${algorithm}`);
  }
}

function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) {
    const view = v as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof v === 'string') return new TextEncoder().encode(v);
  throw new Error('바이트로 변환할 수 없는 값');
}

class HashLike {
  private parts: Uint8Array[] = [];
  constructor(private algorithm: string) {}
  update(data: unknown): this {
    this.parts.push(toBytes(data));
    return this;
  }
  digest(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const p of this.parts) { joined.set(p, off); off += p.length; }
    return pickHash(this.algorithm)(joined);
  }
}

class HmacLike {
  private parts: Uint8Array[] = [];
  constructor(private algorithm: string, private key: Uint8Array) {}
  update(data: unknown): this {
    this.parts.push(toBytes(data));
    return this;
  }
  digest(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const p of this.parts) { joined.set(p, off); off += p.length; }
    return nobleHmac(pickHash(this.algorithm) as never, this.key, joined);
  }
}

// office-crypto 는 setAutoPadding(false) 후 update()로 전체를 넣고 final()은 빈 값을 받습니다.
class CipherLike {
  private parts: Uint8Array[] = [];
  private done = false;
  constructor(
    private mode: 'cbc' | 'ecb',
    private key: Uint8Array,
    private iv: Uint8Array | null,
    private encrypt: boolean,
  ) {}
  setAutoPadding(_pad: boolean): this { return this; } // 항상 패딩 없음으로 동작
  update(data: unknown): Uint8Array {
    if (this.done) throw new Error('이미 final() 호출됨');
    this.parts.push(toBytes(data));
    return new Uint8Array(0); // 전체 처리는 final()에서
  }
  final(): Uint8Array {
    this.done = true;
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const p of this.parts) { joined.set(p, off); off += p.length; }
    if (joined.length === 0) return joined;

    const opts = { disablePadding: true } as const;
    const cipher = this.mode === 'cbc'
      ? cbc(this.key, this.iv ?? new Uint8Array(16), opts)
      : ecb(this.key, opts);
    return this.encrypt ? cipher.encrypt(joined) : cipher.decrypt(joined);
  }
}

function parseAlgo(algo: string): { mode: 'cbc' | 'ecb' } {
  const a = algo.toLowerCase();
  if (a.endsWith('-ecb')) return { mode: 'ecb' };
  if (a.endsWith('-cbc')) return { mode: 'cbc' };
  throw new Error(`지원하지 않는 암호 방식: ${algo}`);
}

export function createHash(algorithm: string) {
  return new HashLike(algorithm);
}

export function createHmac(algorithm: string, key: unknown) {
  return new HmacLike(algorithm, toBytes(key));
}

export function createCipheriv(algo: string, key: unknown, iv: unknown) {
  const { mode } = parseAlgo(algo);
  return new CipherLike(mode, toBytes(key), iv == null ? null : toBytes(iv), true);
}

export function createDecipheriv(algo: string, key: unknown, iv: unknown) {
  const { mode } = parseAlgo(algo);
  return new CipherLike(mode, toBytes(key), iv == null ? null : toBytes(iv), false);
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function randomFillSync(buf: Uint8Array): Uint8Array {
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

// 아래 3개는 "인증서(개인키)로 보호된 문서" 전용 경로에서만 쓰입니다.
// 은행 엑셀은 비밀번호 방식이라 호출되지 않지만, import 대상이므로 스텁을 제공합니다.
export function createPrivateKey(): never {
  throw new Error('개인키 방식 복호화는 지원하지 않습니다 (비밀번호를 사용하세요)');
}

export function privateDecrypt(): never {
  throw new Error('개인키 방식 복호화는 지원하지 않습니다 (비밀번호를 사용하세요)');
}

export const constants = {
  RSA_PKCS1_PADDING: 1,
  RSA_PKCS1_OAEP_PADDING: 4,
};

export default {
  createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, randomFillSync,
  createPrivateKey, privateDecrypt, constants,
};
