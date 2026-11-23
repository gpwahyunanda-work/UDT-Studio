// Klien uji untuk handler Web-standar: memanggil handle(Request) langsung (tanpa server HTTP), mensimulasikan cookie.
import { handle } from '../../server/app.js';
import { TEST_PASSWORD, READER_PASSWORD } from './db.js';
import { query, tx } from '../../server/db.js';
import { createUser } from '../../server/accounts.js';

export const BASE = 'https://udt.test';
export class Client {
  constructor(ip = '10.0.0.1') { this.cookie = ''; this.ip = ip; }
  async call(method, path, body, { headers = {}, origin = BASE, raw } = {}) {
    const h = { 'x-forwarded-for': this.ip, ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (origin && method !== 'GET') h.origin = origin;
    if (body !== undefined && !raw) h['content-type'] = 'application/json';
    const res = await handle(new Request(BASE + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }));
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.startsWith('udt_session=;') || /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    let json = null; try { json = await res.clone().json(); } catch { /* bukan JSON */ }
    const text = json === null ? await res.clone().text().catch(() => null) : null;   // halaman HTML / berkas
    return { status: res.status, json, text, headers: res.headers, setCookie: sc };
  }
  get(p, o) { return this.call('GET', p, undefined, o); }
  post(p, b, o) { return this.call('POST', p, b, o); }
  put(p, b, o) { return this.call('PUT', p, b, o); }
  patch(p, b, o) { return this.call('PATCH', p, b, o); }
}
// F10: akun per orang. Pembantu membuat akun uji lewat server/accounts.js (peran udt_app, bukan pemilik) dan masuk dengan email + kata sandi.
export const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
export const emailOf = (name) => `${slug(name)}@uji.test`;
export async function ensureUser(name, role = 'penulis', password = TEST_PASSWORD) {
  const email = emailOf(name);
  if ((await query('SELECT 1 FROM app_user WHERE lower(email)=$1', [email])).rowCount) return email;
  await tx(async (db) => { await createUser(db, { email, displayName: name, role, password }); });
  await query('UPDATE app_user SET must_change_password=false WHERE lower(email)=$1', [email]);
  return email;
}
export async function loginAs(name, role, ip, password = TEST_PASSWORD) {
  const email = await ensureUser(name, role, password);
  const c = new Client(ip);
  const l = await c.post('/api/auth/login', { email, password });
  if (l.status !== 200) throw new Error('login uji gagal: ' + l.status);
  c.email = email; return c;
}
export const loggedIn = (name = 'Analis Uji', ip) => loginAs(name || 'Analis Uji', 'penulis', ip);
export const readerLoggedIn = (ip) => loginAs('Pembaca Uji', 'pembaca', ip, READER_PASSWORD);
export const adminLoggedIn = (ip) => loginAs('Admin Uji', 'admin', ip);
