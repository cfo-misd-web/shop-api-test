// End-to-end API tests using the built-in node:test runner (no extra deps).
//
//   pnpm test
//
// Each run uses a throwaway SQLite DB in the OS temp dir (via DB_PATH), so it
// never touches the project's db.sqlite. The server is imported in-process and
// bound to an ephemeral port; NODE_ENV=test stops src/server.ts self-listening.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const DB_PATH = join(tmpdir(), `shop-api-test-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_PATH = DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// Import after env is set so db.ts opens the throwaway DB and server.ts skips listen.
const { app } = await import('../src/server.ts');
const { db } = await import('../src/db.ts');

let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close(); // release the file handle so Windows lets us delete it
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(DB_PATH + suffix, { force: true });
  }
});

// --- helpers -------------------------------------------------------------

interface ApiResponse {
  status: number;
  body: any;
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<ApiResponse> {
  const { method = 'GET', body, token } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let seq = 0;
async function signUp(): Promise<{ token: string; email: string; id: number }> {
  const email = `user-${process.pid}-${seq++}@example.com`;
  const { status, body } = await api('/auth/signup', {
    method: 'POST',
    body: { email, password: 'hunter2pw' },
  });
  assert.equal(status, 201, 'signup should succeed');
  return { token: body.token, email, id: body.id };
}

// --- Auth ----------------------------------------------------------------

test('signup returns a token and rejects duplicates / weak passwords', async () => {
  const email = `dup-${process.pid}@example.com`;
  const first = await api('/auth/signup', { method: 'POST', body: { email, password: 'hunter2pw' } });
  assert.equal(first.status, 201);
  assert.ok(typeof first.body.token === 'string' && first.body.token.length > 0);

  const dup = await api('/auth/signup', { method: 'POST', body: { email, password: 'hunter2pw' } });
  assert.equal(dup.status, 409);

  const weak = await api('/auth/signup', {
    method: 'POST',
    body: { email: `weak-${process.pid}@example.com`, password: '123' },
  });
  assert.equal(weak.status, 400);
});

test('signin succeeds with correct credentials and 401s on wrong password', async () => {
  const email = `signin-${process.pid}@example.com`;
  await api('/auth/signup', { method: 'POST', body: { email, password: 'hunter2pw' } });

  const ok = await api('/auth/signin', { method: 'POST', body: { email, password: 'hunter2pw' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const bad = await api('/auth/signin', { method: 'POST', body: { email, password: 'wrongpass' } });
  assert.equal(bad.status, 401);
});

// --- Catalog -------------------------------------------------------------

test('lists seeded products and fetches one with full details', async () => {
  const list = await api('/products');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.length >= 4, 'catalog is seeded');

  const one = await api('/products/1');
  assert.equal(one.status, 200);
  assert.equal(one.body.id, 1);
  assert.ok(Array.isArray(one.body.images) && one.body.images.length > 0);
  assert.ok(typeof one.body.price_cents === 'number');
});

test('product detail returns 400 for non-numeric id and 404 for unknown id', async () => {
  assert.equal((await api('/products/abc')).status, 400);
  assert.equal((await api('/products/999999')).status, 404);
});

// --- Ratings -------------------------------------------------------------

test('rating is public to read, requires auth to submit', async () => {
  const summary = await api('/products/3/rating');
  assert.equal(summary.status, 200);
  assert.deepEqual(summary.body, { product_id: 3, average_rating: null, rating_count: 0 });

  const noAuth = await api('/products/3/rating', { method: 'POST', body: { rating: 4 } });
  assert.equal(noAuth.status, 401);
});

test('rating upserts: re-rating updates instead of duplicating, average reflects all raters', async () => {
  // Use a dedicated product so other tests don't perturb the aggregate.
  const productId = 4;
  const u1 = await signUp();
  const u2 = await signUp();

  // u1 rates 4 -> avg 4, count 1
  let r = await api(`/products/${productId}/rating`, { method: 'POST', token: u1.token, body: { rating: 4 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.your_rating, 4);
  assert.equal(r.body.average_rating, 4);
  assert.equal(r.body.rating_count, 1);

  // u1 re-rates 2 -> avg 2, count stays 1 (update, not insert)
  r = await api(`/products/${productId}/rating`, { method: 'POST', token: u1.token, body: { rating: 2 } });
  assert.equal(r.body.average_rating, 2);
  assert.equal(r.body.rating_count, 1);

  // u2 rates 5 -> count 2, avg (2 + 5) / 2 = 3.5
  r = await api(`/products/${productId}/rating`, { method: 'POST', token: u2.token, body: { rating: 5 } });
  assert.equal(r.body.rating_count, 2);
  assert.equal(r.body.average_rating, 3.5);

  // Aggregate is visible publicly and on the product detail.
  const summary = await api(`/products/${productId}/rating`);
  assert.deepEqual(summary.body, { product_id: productId, average_rating: 3.5, rating_count: 2 });

  const detail = await api(`/products/${productId}`);
  assert.equal(detail.body.average_rating, 3.5);
  assert.equal(detail.body.rating_count, 2);
});

test('rejects invalid ratings (0, 6, 3.5) and unknown product', async () => {
  const { token } = await signUp();
  for (const rating of [0, 6, 3.5]) {
    const r = await api('/products/1/rating', { method: 'POST', token, body: { rating } });
    assert.equal(r.status, 400, `rating ${rating} should be rejected`);
  }
  const unknown = await api('/products/999999/rating', { method: 'POST', token, body: { rating: 4 } });
  assert.equal(unknown.status, 404);
});

// --- Comments ------------------------------------------------------------

test('comments are public to read, require auth to post, and show author + timestamp', async () => {
  const { token, email } = await signUp();

  const noAuth = await api('/products/1/comments', { method: 'POST', body: { body: 'hi' } });
  assert.equal(noAuth.status, 401);

  const posted = await api('/products/1/comments', { method: 'POST', token, body: { body: 'Great mug!' } });
  assert.equal(posted.status, 201);
  assert.equal(posted.body.body, 'Great mug!');
  assert.equal(posted.body.author_email, email);
  assert.ok(posted.body.created_at, 'comment carries a timestamp');

  const list = await api('/products/1/comments');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((c: any) => c.body === 'Great mug!' && c.author_email === email));
});

test('a user may leave more than one comment on the same product', async () => {
  const { token } = await signUp();
  await api('/products/2/comments', { method: 'POST', token, body: { body: 'first' } });
  await api('/products/2/comments', { method: 'POST', token, body: { body: 'second' } });
  const list = await api('/products/2/comments');
  const mine = list.body.filter((c: any) => c.body === 'first' || c.body === 'second');
  assert.equal(mine.length, 2);
});

test('rejects empty comment body and comments on unknown products', async () => {
  const { token } = await signUp();
  assert.equal((await api('/products/1/comments', { method: 'POST', token, body: { body: '   ' } })).status, 400);
  assert.equal((await api('/products/1/comments', { method: 'POST', token, body: {} })).status, 400);
  assert.equal((await api('/products/999999/comments', { method: 'POST', token, body: { body: 'x' } })).status, 404);
});
