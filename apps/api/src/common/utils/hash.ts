import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 в hex — ровно 64 символа, как колонка token_hash. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Криптостойкий одноразовый токен для писем и refresh. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
