/**
 * End-to-end login test for all three roles (admin, teacher, student)
 * against the live ofijan-backend API (php artisan serve on :8000).
 *
 * Throttle facts discovered while testing (verified via X-RateLimit-*):
 *   - POST /api/v1/login and POST /api/v1/staff-login draw from ONE shared
 *     bucket: 5 requests / minute per IP (not 5 each).
 *   - Requests rejected with 429 are not written to laravel.log (the route
 *     throttle runs before the logging middleware), so foreign traffic from
 *     other testers on 127.0.0.1 can silently eat the budget.
 * This script therefore: runs each login-bucket phase as <=5 calls, waits
 * ~65s between phases, and re-runs a phase after a 62s wait if it still
 * trips the limiter.
 *
 * Usage: node scripts/login-e2e-test.mjs [baseUrl]   (default http://127.0.0.1:8000)
 */

const BASE = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const API = `${BASE}/api`;
const PASSWORD = 'Password@123';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

const results = [];
function record(phase, name, ok, detail) {
  results.push({ phase, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${phase}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = Date.now();
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { status: 0, body: null, raw: String(err), ms: 0, limit: null, remaining: null };
  }
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON — keep raw below */
  }
  return {
    status: res.status,
    body: parsed,
    raw: text.slice(0, 300),
    ms: Date.now() - started,
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
  };
}

const show = (res) =>
  `HTTP ${res.status}${res.remaining !== null ? `, remaining=${res.remaining}/${res.limit}` : ''}, ${res.ms}ms` +
  (res.status >= 400 ? ` — ${JSON.stringify(res.body ?? res.raw ?? res.error)?.slice(0, 220)}` : '');

const roleOf = (res) => res.body?.data?.user?.role_slug;
const tokenOf = (res) => res.body?.data?.token;

/**
 * Run a phase that draws from the shared 5/min login bucket.
 * Phase = array of { name, req, expect, check } entries.
 * On an unexpected 429 (foreign traffic ate the budget), wait for the
 * window to reset and retry the whole phase once.
 */
async function runThrottledPhase(label, entries, attempt = 1) {
  const out = [];
  for (const e of entries) {
    const res = await e.req(); // factory, so a retry re-issues the request
    out.push({ ...e, res });
  }
  const unexpected429 = out.filter((o) => o.res.status === 429 && o.expect !== 429);
  if (unexpected429.length && attempt < 3) {
    console.log(`      ! ${label}: ${unexpected429.length} call(s) hit 429 at ${stamp()} — waiting 62s for the window, retry ${attempt + 1}`);
    await sleep(62_000);
    return runThrottledPhase(label, entries, attempt + 1);
  }
  for (const o of out) {
    const ok = o.res.status === o.expect && (!o.check || o.check(o.res));
    record(label, o.name, ok, show(o.res));
  }
  return out;
}

console.log(`\n=== Ofijan login E2E — ${API} — start ${stamp()} ===\n`);

// ---------------------------------------------------------------- health
{
  const h = await call('GET', '/health');
  record('setup', 'API health check', h.status === 200 && h.body?.status === 'ok',
    `HTTP ${h.status}, db=${h.body?.database?.connected}, tables=${h.body?.database?.tables_count}`);
}

const tokens = {};

// ------------------------------------------------- Phase 1: staff-login (5 calls = full bucket)
await runThrottledPhase('staff-login', [
  {
    name: 'admin credentials accepted',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'admin@ofijan.com', password: PASSWORD } }),
    expect: 200,
    check: (r) => roleOf(r) === 'admin' && !!tokenOf(r),
  },
  {
    name: 'teacher credentials accepted',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'teacher@ofijan.com', password: PASSWORD } }),
    expect: 200,
    check: (r) => roleOf(r) === 'teacher' && !!tokenOf(r),
  },
  {
    name: 'student refused on staff endpoint',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'student@ofijan.com', password: PASSWORD } }),
    expect: 403,
    check: (r) => /staff/i.test(r.body?.message ?? ''),
  },
  {
    name: 'wrong password rejected',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'admin@ofijan.com', password: 'wrong-password' } }),
    expect: 401,
  },
  {
    name: 'missing password → validation error',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'admin@ofijan.com' } }),
    expect: 422,
  },
]);

console.log(`\n--- waiting for shared login bucket to reset (${stamp()}) ---\n`);
await sleep(62_000);

// ------------------------------------------------- Phase 2: student login (5 calls)
const phase2 = await runThrottledPhase('login', [
  {
    name: 'student credentials accepted',
    req: () => call('POST', '/v1/login', { body: { email: 'student@ofijan.com', password: PASSWORD } }),
    expect: 200,
    check: (r) => roleOf(r) === 'student' && !!tokenOf(r),
  },
  {
    name: 'admin blocked from student endpoint',
    req: () => call('POST', '/v1/login', { body: { email: 'admin@ofijan.com', password: PASSWORD } }),
    expect: 403,
    check: (r) => /student/i.test(r.body?.message ?? ''),
  },
  {
    name: 'teacher blocked from student endpoint',
    req: () => call('POST', '/v1/login', { body: { email: 'teacher@ofijan.com', password: PASSWORD } }),
    expect: 403,
    check: (r) => /student/i.test(r.body?.message ?? ''),
  },
  {
    name: 'wrong password rejected',
    req: () => call('POST', '/v1/login', { body: { email: 'student@ofijan.com', password: 'nope' } }),
    expect: 401,
  },
  {
    name: 'malformed email → validation error',
    req: () => call('POST', '/v1/login', { body: { email: 'not-an-email', password: PASSWORD } }),
    expect: 422,
  },
]);
tokens.student = tokenOf(phase2[0].res);

// admin + teacher tokens: the shared bucket is empty right now? No — phase 2
// consumed it. Mint them in the next window together with nothing else.
console.log(`\n--- waiting for shared login bucket to reset (${stamp()}) ---\n`);
await sleep(62_000);

const phase3 = await runThrottledPhase('tokens', [
  {
    name: 'mint admin token (staff-login)',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'admin@ofijan.com', password: PASSWORD } }),
    expect: 200,
    check: (r) => roleOf(r) === 'admin',
  },
  {
    name: 'mint teacher token (staff-login)',
    req: () => call('POST', '/v1/staff-login', { body: { email: 'teacher@ofijan.com', password: PASSWORD } }),
    expect: 200,
    check: (r) => roleOf(r) === 'teacher',
  },
]);
tokens.admin = tokenOf(phase3[0].res);
tokens.teacher = tokenOf(phase3[1].res);

// ---------------------------------- Phase 4: session + role-scoped routes (not login-bucket)
for (const [role, token] of Object.entries(tokens)) {
  const p = await call('GET', '/v1/profile', { token });
  record('session', `${role}: GET /v1/profile`, p.status === 200 && roleOf(p) === role, show(p));
}

const scoped = [
  ['admin', '/v1/admin/dashboard'],
  ['teacher', '/v1/teacher/real-exams'],
  ['student', '/v1/student/dashboard'],
];
for (const [role, path] of scoped) {
  const r = await call('GET', path, { token: tokens[role] });
  record('role-scope', `${role} token → ${path}`, r.status === 200, show(r));
}

{
  const r1 = await call('GET', '/v1/admin/dashboard', { token: tokens.student });
  record('role-scope', 'student token denied /v1/admin/dashboard', r1.status === 403, show(r1));
  const r2 = await call('GET', '/v1/admin/dashboard', { token: tokens.teacher });
  record('role-scope', 'teacher token denied /v1/admin/dashboard', r2.status === 403, show(r2));
  const r3 = await call('GET', '/v1/student/dashboard', { token: tokens.admin });
  record('role-scope', 'admin token denied /v1/student/dashboard', r3.status === 403, show(r3));
  const r4 = await call('GET', '/v1/profile');
  record('role-scope', 'no token → 401', r4.status === 401, show(r4));
  const r5 = await call('GET', '/v1/profile', { token: 'garbage.token.value' });
  record('role-scope', 'invalid token → 401', r5.status === 401, show(r5));
}

// ------------------------------------------------- Phase 5: logout / revoke
for (const [role, token] of Object.entries(tokens)) {
  const lo = await call('POST', '/v1/logout', { token });
  record('logout', `${role}: POST /v1/logout`, lo.status === 200, show(lo));
  const p = await call('GET', '/v1/profile', { token });
  record('logout', `${role}: token revoked after logout`, p.status === 401, show(p));
}

// ------------------------------------------------- Phase 6: rate-limit proof
console.log(`\n--- waiting for shared login bucket to reset before throttle proof (${stamp()}) ---\n`);
await sleep(62_000);
{
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/v1/staff-login', { body: { email: 'teacher@ofijan.com', password: PASSWORD } });
    statuses.push(r.status);
  }
  const first5Pass = statuses.slice(0, 5).every((s) => s === 200);
  const sixth = statuses[5];
  record('throttle', '5 requests pass, 6th within the minute → 429',
    first5Pass && sixth === 429, `statuses=${statuses.join(',')}`);
  // shared-bucket proof: /v1/login now also 429s without any of its own calls
  const l = await call('POST', '/v1/login', { body: { email: 'student@ofijan.com', password: PASSWORD } });
  record('throttle', '/v1/login shares the same bucket (429 with 0 own calls)', l.status === 429, show(l));
}

// ---------------------------------------------------------------- summary
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed (finished ${stamp()}) ===`);
if (failed.length) {
  console.log('Failures:');
  for (const f of failed) console.log(`  - [${f.phase}] ${f.name}: ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
