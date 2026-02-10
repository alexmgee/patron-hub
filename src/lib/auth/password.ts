import crypto from 'crypto';

type ScryptParams = {
  N: number;
  r: number;
  p: number;
  keyLen: number;
};

const DEFAULT_SCRYPT: ScryptParams = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 64,
};

function b64(buf: Buffer): string {
  return buf.toString('base64');
}

function fromB64(s: string): Buffer {
  return Buffer.from(s, 'base64');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, DEFAULT_SCRYPT.keyLen, {
    N: DEFAULT_SCRYPT.N,
    r: DEFAULT_SCRYPT.r,
    p: DEFAULT_SCRYPT.p,
  });

  // Format: scrypt$N$r$p$saltB64$hashB64
  return `scrypt$${DEFAULT_SCRYPT.N}$${DEFAULT_SCRYPT.r}$${DEFAULT_SCRYPT.p}$${b64(salt)}$${b64(derived)}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [algo, nStr, rStr, pStr, saltB64, hashB64] = parts;
  if (algo !== 'scrypt') return false;

  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);

  const derived = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  return crypto.timingSafeEqual(expected, derived);
}

