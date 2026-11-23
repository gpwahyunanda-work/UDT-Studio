// Login akun bersama + sesi bertanda tangan HMAC (DS-06). Tanpa token di localStorage; cookie HttpOnly.
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';

export function hashPassword(pw, salt = randomBytes(16)) {
  const N = 16384, r = 8, p = 1;
  const h = scryptSync(pw, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const h = scryptSync(String(pw), Buffer.from(salt, 'hex'), 32, { N: +N, r: +r, p: +p });
    const want = Buffer.from(hash, 'hex');
    return h.length === want.length && timingSafeEqual(h, want);
  } catch { return false; }
}

const b64 = (b) => Buffer.from(b).toString('base64url');
export function signSession(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > now ? p : null; } catch { return null; }
}
export const parseCookies = (h) => Object.fromEntries(String(h || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
export const ipHash = (ip, secret) => createHash('sha256').update(`${secret}|${ip}`).digest('hex').slice(0, 32);
