/**
 * Student login flow, isolated (the shared 5/min login bucket and the
 * intermittent 60s filesystem hangs on this Windows host make the student
 * case flaky when run inside the full matrix).
 *
 * Flow mirrors what the frontend does:
 *   login -> store token -> GET /v1/profile -> role-scoped page calls
 *   -> cross-role denial check -> logout -> token revoked.
 *
 * Usage: node scripts/login-student-flow.mjs [baseUrl]
 */

const BASE = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const API = `${BASE}/api`;
const PASSWORD = 'Password@123';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: parsed, raw: text.slice(0, 200), ms: Date.now() - started };
}

const show = (r) =>
  `HTTP ${r.status}, ${r.ms}ms` + (r.status >= 400 ? ` — ${JSON.stringify(r.body ?? r.raw)?.slice(0, 200)}` : '');

const roleOf = (r) => r.body?.data?.user?.role_slug;
const userOf = (r) => r.body?.data?.user;

/** login with retry: 429 -> wait for window, 5xx -> wait 5s (fs hang), max 3 tries */
async function loginWithRetry() {
  for (let i = 1; i <= 3; i++) {
    const r = await call('POST', '/v1/login', { body: { email: 'student@ofijan.com', password: PASSWORD } });
    if (r.status === 200) return { r, attempt: i };
    if (r.status === 429) {
      console.log(`      ! throttled at ${stamp()} — waiting 62s (attempt ${i})`);
      await sleep(62_000);
    } else if (r.status >= 500) {
      console.log(`      ! ${r.status} from server at ${stamp()} — waiting 5s and retrying (attempt ${i})`);
      await sleep(5_000);
    } else {
      return { r, attempt: i };
    }
  }
  return { r: null, attempt: 3 };
}

console.log(`\n=== Student login flow — ${API} — start ${stamp()} ===\n`);

const { r: login, attempt } = await loginWithRetry();
record('student login (POST /v1/login)', !!login && login.status === 200 && roleOf(login) === 'student',
  `${show(login ?? { status: 0, ms: 0 })}, attempt ${attempt}`);
if (!login || login.status !== 200) process.exit(1);

const token = login.body.data.token;
record('token + must_change_password present', typeof token === 'string' && token.length > 20 && login.body.data.must_change_password === false,
  `token_type=${login.body.data.token_type}, must_change_password=${login.body.data.must_change_password}`);
record('login payload user is the seeded student', userOf(login)?.email === 'student@ofijan.com' && userOf(login)?.is_active === true,
  `${userOf(login)?.email}, active=${userOf(login)?.is_active}, id=${userOf(login)?.id}`);

const profile = await call('GET', '/v1/profile', { token });
record('GET /v1/profile with student token', profile.status === 200 && roleOf(profile) === 'student', show(profile));

const dash = await call('GET', '/v1/student/dashboard', { token });
record('GET /v1/student/dashboard (role:student route)', dash.status === 200, show(dash));

const denied = await call('GET', '/v1/admin/dashboard', { token });
record('student token denied on /v1/admin/dashboard', denied.status === 403, show(denied));

const teacherDenied = await call('GET', '/v1/teacher/real-exams', { token });
record('student token denied on /v1/teacher/real-exams', teacherDenied.status === 403, show(teacherDenied));

const perf = await call('GET', '/v1/student/activities', { token });
record('GET /v1/student/activities (activity log written by login)', perf.status === 200, show(perf));

const logout = await call('POST', '/v1/logout', { token });
record('POST /v1/logout', logout.status === 200, show(logout));

const after = await call('GET', '/v1/profile', { token });
record('token revoked after logout (401)', after.status === 401, show(after));

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed (finished ${stamp()}) ===`);
process.exit(failed.length ? 1 : 0);
