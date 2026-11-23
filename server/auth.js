// Kata sandi (scrypt, parameter + salt per pengguna tersimpan di string hash) dan sesi bertanda tangan HMAC (DS-06, F10).
// Sesi hanya membawa {uid, tv, exp}: peran, status aktif, dan nama SELALU dibaca ulang dari database tiap permintaan.
import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);

export const SCRYPT = { N: 32768, r: 8, p: 3 };   // OWASP: N=2^15, r=8, p=3 (~32 MiB per percobaan)
const MAX_N = 1 << 17;                            // batas atas parameter dari DB (cegah hash rusak memakan memori)
const kdf = (pw, salt, N, r, p) => scryptAsync(String(pw), salt, 32, { N, r, p, maxmem: 128 * N * r * (p + 2) });

export async function hashPassword(pw, salt = randomBytes(16), { N, r, p } = SCRYPT) {
  const h = await kdf(pw, salt, N, r, p);
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${h.toString('hex')}`;
}
export async function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt' || !(+N > 1 && +N <= MAX_N) || !(+r > 0 && +r <= 16) || !(+p > 0 && +p <= 8)) return false;
    const h = await kdf(pw, Buffer.from(salt, 'hex'), +N, +r, +p);
    const want = Buffer.from(hash, 'hex');
    return h.length === want.length && timingSafeEqual(h, want);
  } catch { return false; }
}
// Hash pura-pura untuk email tidak dikenal: pekerjaan scrypt yang sama, hasil selalu salah (timing seragam).
let dummy = null;
export const dummyHash = () => (dummy ||= hashPassword(randomBytes(24).toString('hex')));

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
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > now && Number.isInteger(p.uid) && Number.isInteger(p.tv) ? p : null; } catch { return null; }
}
export const parseCookies = (h) => Object.fromEntries(String(h || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
export const ipHash = (ip, secret) => createHash('sha256').update(`${secret}|${ip}`).digest('hex').slice(0, 32);
export const emailKey = (email, secret) => createHmac('sha256', secret).update('email|' + String(email).trim().toLowerCase()).digest('hex').slice(0, 32);
