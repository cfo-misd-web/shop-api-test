// Standalone seed script. Resets the products table and inserts products whose
// images are base64 data-URIs (self-contained, no external image hosting).
//
//   pnpm build && pnpm seed
//
// Run it any time to reset the catalog to a known state.
import { db } from './db.js';

interface SeedProduct {
  name: string;
  description: string;
  category: string;
  price_cents: number;
  colors: string[]; // one image is generated per color
}

// Build a small SVG placeholder and return it as a base64 data-URI.
function base64Image(label: string, bg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">` +
    `<rect width="600" height="400" fill="${bg}"/>` +
    `<text x="300" y="210" font-family="system-ui,sans-serif" font-size="40" ` +
    `fill="#ffffff" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Coffee Mug',
    description: 'A 350ml glazed stoneware mug that keeps your coffee warm and is dishwasher safe.',
    category: 'Kitchen',
    price_cents: 1299,
    colors: ['#6c5ce7', '#0984e3'],
  },
  {
    name: 'T-Shirt',
    description: '100% combed cotton crew-neck tee with a relaxed fit. Pre-shrunk and machine washable.',
    category: 'Apparel',
    price_cents: 1999,
    colors: ['#00b894', '#0984e3', '#fdcb6e'],
  },
  {
    name: 'Notebook',
    description: 'A6 hardcover notebook with 192 dotted pages of 100gsm paper and an elastic closure.',
    category: 'Stationery',
    price_cents: 799,
    colors: ['#e17055', '#2d3436'],
  },
  {
    name: 'Sticker Pack',
    description: 'Set of 12 weatherproof vinyl stickers with a matte laminate finish.',
    category: 'Accessories',
    price_cents: 499,
    colors: ['#e84393', '#fdcb6e', '#00cec9'],
  },
];

const insert = db.prepare(
  'INSERT INTO products (name, description, images, category, price_cents) VALUES (?, ?, ?, ?, ?)',
);

const seed = db.transaction(() => {
  db.exec('DELETE FROM products');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'products'"); // reset ids to start at 1
  for (const p of PRODUCTS) {
    const images = p.colors.map((c, i) => base64Image(`${p.name} ${i + 1}`, c));
    insert.run(p.name, p.description, JSON.stringify(images), p.category, p.price_cents);
  }
});

seed();
console.log(`Seeded ${PRODUCTS.length} products with base64 images into db.sqlite`);
