// Klien uji untuk handler Web-standar: memanggil handle(Request) langsung (tanpa server HTTP), mensimulasikan cookie.
import { handle } from '../../server/app.js';
import { TEST_PASSWORD, READER_PASSWORD } from './db.js';

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
    return { status: res.status, json, headers: res.headers, setCookie: sc };
  }
  get(p, o) { return this.call('GET', p, undefined, o); }
  post(p, b, o) { return this.call('POST', p, b, o); }
  put(p, b, o) { return this.call('PUT', p, b, o); }
  patch(p, b, o) { return this.call('PATCH', p, b, o); }
}
export async function loggedIn(name = 'Analis Uji', ip) {
  const c = new Client(ip);
  const l = await c.post('/api/auth/login', { password: TEST_PASSWORD });
  if (l.status !== 200) throw new Error('login uji gagal');
  if (name) await c.put('/api/me/analyst', { name });
  return c;
}
export async function readerLoggedIn(ip) {
  const c = new Client(ip);
  const l = await c.post('/api/auth/login', { password: READER_PASSWORD });
  if (l.status !== 200) throw new Error('login pembaca uji gagal');
  return c;
}
