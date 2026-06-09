import express from 'express';
import type { Request, Response } from 'express';
import { db, type Product } from './db.js';
import { hashPassword, verifyPassword, signJwt, requireAuth } from './auth.js';
import { openapi } from './openapi.js';

import { fileURLToPath } from 'node:url';

const app = express();
app.use(express.json());

// Static test page (vanilla JS client that drives the API end-to-end).
const publicDir = fileURLToPath(new URL('../public', import.meta.url));
app.use(express.static(publicDir));

// Test plan page (steps + flowchart) at /test.
app.get('/test', (_req: Request, res: Response) => {
  res.sendFile('test.html', { root: publicDir });
});

// CORS for localhost frontends used in integration tests. Auth is via the
// Authorization header (Bearer JWT), so it must be in Allow-Headers. We reflect
// any localhost / 127.0.0.1 origin (any port). No `cors` package.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && LOCALHOST_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// --- Auth ----------------------------------------------------------------

app.post('/auth/signup', (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'email and password (min 6 chars) are required' });
    return;
  }
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (exists) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }
  const info = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, hashPassword(password));
  const id = Number(info.lastInsertRowid);
  res.status(201).json({ id, email, token: signJwt(id) });
});

app.post('/auth/signin', (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  res.json({ id: user.id, email, token: signJwt(user.id) });
});

// --- Catalog -------------------------------------------------------------

const PRODUCT_COLUMNS = 'id, name, description, images, category, price_cents';

// `images` is stored as a JSON text column; expose it as a real array.
type ProductRow = Omit<Product, 'images'> & { images: string };
function toProduct(row: ProductRow): Product {
  let images: string[] = [];
  try {
    const parsed = JSON.parse(row.images);
    if (Array.isArray(parsed)) images = parsed;
  } catch {
    // leave images as []
  }
  return { ...row, images };
}

app.get('/products', (_req: Request, res: Response) => {
  const rows = db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY id`).all() as ProductRow[];
  res.json(rows.map(toProduct));
});

app.get('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid product id' });
    return;
  }
  const row = db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`).get(id) as
    | ProductRow
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(toProduct(row));
});

// --- Cart ----------------------------------------------------------------

interface CartLine extends Product {
  product_id: number;
  quantity: number;
  line_total_cents: number;
}

function getCart(userId: number): { items: CartLine[]; total_cents: number } {
  const items = db
    .prepare(
      `SELECT p.id AS product_id, p.name, p.price_cents, c.quantity,
              p.price_cents * c.quantity AS line_total_cents
       FROM cart_items c
       JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?
       ORDER BY p.id`,
    )
    .all(userId) as unknown as CartLine[];
  const total_cents = items.reduce((sum, i) => sum + i.line_total_cents, 0);
  return { items, total_cents };
}

app.get('/cart', requireAuth, (req: Request, res: Response) => {
  res.json(getCart(req.userId!));
});

app.post('/cart/items', requireAuth, (req: Request, res: Response) => {
  const { productId, quantity = 1 } = req.body ?? {};
  if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1) {
    res.status(400).json({ error: 'productId and a positive integer quantity are required' });
    return;
  }
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    res.status(400).json({ error: 'Unknown product' });
    return;
  }
  db.prepare(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
     ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
  ).run(req.userId!, productId, quantity);
  res.json(getCart(req.userId!));
});

app.post('/cart/checkout', requireAuth, (req: Request, res: Response) => {
  const userId = req.userId!;
  const cart = getCart(userId);
  if (cart.items.length === 0) {
    res.status(400).json({ error: 'Cart is empty' });
    return;
  }
  db.exec('BEGIN');
  let orderId: number;
  try {
    const info = db
      .prepare('INSERT INTO orders (user_id, total_cents, items_json) VALUES (?, ?, ?)')
      .run(userId, cart.total_cents, JSON.stringify(cart.items));
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    db.exec('COMMIT');
    orderId = Number(info.lastInsertRowid);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.status(201).json({ order_id: orderId, total_cents: cart.total_cents });
});

// --- Docs ----------------------------------------------------------------

app.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openapi);
});

// Scalar API reference, loaded from CDN — no npm dependency.
app.get('/docs', (_req: Request, res: Response) => {
  res.type('html').send(`<!doctype html>
<html>
  <head>
    <title>Shop API — Docs</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Shop API listening on http://localhost:${PORT}`);
  console.log(`Docs at http://localhost:${PORT}/docs`);
});
