import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  images: string[];
  category: string;
  price_cents: number;
}

export const db = new Database(fileURLToPath(new URL('../db.sqlite', import.meta.url)));

// Schema. Created on first run; IF NOT EXISTS keeps it idempotent.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    images      TEXT NOT NULL DEFAULT '[]',  -- JSON array of image URLs
    category    TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL,
    PRIMARY KEY (user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_cents INTEGER NOT NULL,
    items_json  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed products once, with full detail (image, description, category) so the
// cart endpoints work out of the box and there is rich data to render.
const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number };
if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, description, images, category, price_cents) VALUES (?, ?, ?, ?, ?)',
  );
  const imgs = (slug: string) =>
    JSON.stringify([
      `https://picsum.photos/seed/${slug}-1/600/400`,
      `https://picsum.photos/seed/${slug}-2/600/400`,
      `https://picsum.photos/seed/${slug}-3/600/400`,
    ]);
  insert.run(
    'Coffee Mug',
    'A 350ml glazed stoneware mug that keeps your coffee warm and is dishwasher safe.',
    imgs('coffee-mug'),
    'Kitchen',
    1299,
  );
  insert.run(
    'T-Shirt',
    '100% combed cotton crew-neck tee with a relaxed fit. Pre-shrunk and machine washable.',
    imgs('t-shirt'),
    'Apparel',
    1999,
  );
  insert.run(
    'Notebook',
    'A6 hardcover notebook with 192 dotted pages of 100gsm paper and an elastic closure.',
    imgs('notebook'),
    'Stationery',
    799,
  );
  insert.run(
    'Sticker Pack',
    'Set of 12 weatherproof vinyl stickers with a matte laminate finish.',
    imgs('sticker-pack'),
    'Accessories',
    499,
  );
}
