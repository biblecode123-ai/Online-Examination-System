/**
 * Seed the minimal fixture the admin exam workflow needs on a fresh dev DB:
 *   college -> "Real Exam" category (slug auto-generated to real-exam)
 *   -> department -> department students (admin can assign them later).
 *
 * Idempotent: re-running only creates what is missing.
 *
 * Usage: node scripts/seed-dev-exam-fixture.mjs [baseUrl]  (default http://127.0.0.1:8000)
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/+$/, '');
// All write endpoints live under the versioned prefix (routes/api/v1.php);
// the bare /api/* aliases are legacy read-only routes.
const API = `${BASE}/api/v1`;
const ADMIN = { email: 'admin@ofijan.com', password: 'Password@123' };

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, json, raw: text.slice(0, 300) };
}

const items = (result) => {
  // call() returns { status, json, raw } — unwrap before inspecting.
  const payload = result?.json ?? result;
  // Laravel paginators come back as { data: [...], meta: {...} }, plain lists as { data: [...] }
  const d = payload?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

console.log(`\n=== Seeding dev exam fixture against ${API} ===\n`);

// 1. Admin token (1 call from the shared 5/min login bucket)
const login = await call('POST', '/staff-login', { body: ADMIN });
if (login.status !== 200 || !login.json?.data?.token) {
  console.error(`FAIL admin login — HTTP ${login.status}: ${login.raw}`);
  process.exit(1);
}
const token = login.json.data.token;
console.log(`PASS admin login (id ${login.json.data.user.id})`);

// 2. College
let college = items(await call('GET', '/colleges', { token }))[0];
if (!college) {
  const created = await call('POST', '/colleges', { token, body: { name: 'MWU College of Computing', abbreviation: 'MWU-CC' } });
  if (created.status >= 400) { console.error(`FAIL college create — HTTP ${created.status}: ${created.raw}`); process.exit(1); }
  college = created.json?.data ?? created.json;
  console.log(`PASS college created (id ${college.id})`);
} else {
  console.log(`PASS college exists (id ${college.id})`);
}

// 3. Real Exam category — store() slugifies the name, "Real Exam" -> real-exam
let category = items(await call('GET', '/exam-categories', { token })).find((c) => c.slug === 'real-exam' || c.is_real_exam) ?? null;
if (!category) {
  const created = await call('POST', '/exam-categories', { token, body: { name: 'Real Exam', description: 'Official timed examinations' } });
  if (created.status >= 400) { console.error(`FAIL category create — HTTP ${created.status}: ${created.raw}`); process.exit(1); }
  category = created.json?.data ?? created.json;
  console.log(`PASS category created (id ${category.id}, slug ${category.slug})`);
} else {
  console.log(`PASS category exists (id ${category.id}, slug ${category.slug})`);
}
if (!category || (category.slug !== 'real-exam' && !category.is_real_exam)) {
  console.error(`FAIL category is not a real-exam category: ${JSON.stringify(category)}`);
  process.exit(1);
}

// 4. Department
let department = items(await call('GET', '/departments', { token }))[0];
if (!department) {
  const created = await call('POST', '/departments', {
    token,
    body: { college_id: college.id, name: 'Computer Science', exam_category_id: category.id, description: 'Seed department for exam workflow testing' },
  });
  if (created.status >= 400) { console.error(`FAIL department create — HTTP ${created.status}: ${created.raw}`); process.exit(1); }
  department = created.json?.data ?? created.json;
  console.log(`PASS department created (id ${department.id})`);
} else {
  console.log(`PASS department exists (id ${department.id})`);
}

// 5. Put every student into the department so they are assignable
const allUsers = items(await call('GET', '/admin/users?per_page=100', { token }));
const users = allUsers.filter((u) => (u.role_slug ?? u.role ?? '').toString().toLowerCase() === 'student');
let placed = 0;
for (const student of users) {
  if (student.department_id === department.id) continue;
  const upd = await call('PUT', `/users/${student.id}`, { token, body: { department_id: department.id } });
  if (upd.status < 400) placed += 1;
  else console.warn(`  ! student ${student.email} update HTTP ${upd.status}: ${upd.raw}`);
}
console.log(`PASS students placed in department: ${placed}/${users.length}`);

console.log(`\nFixture ready — college=${college.id} category=${category.id} department=${department.id} students=${users.length}\n`);
