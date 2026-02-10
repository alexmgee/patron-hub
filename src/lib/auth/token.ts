import crypto from 'crypto';

export function newSessionToken(): string {
  // 32 bytes -> 43 chars base64url (no padding)
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

