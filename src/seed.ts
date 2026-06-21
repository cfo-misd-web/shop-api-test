// Standalone seed script. Resets the products table and inserts products whose
// images are base64 data-URIs (self-contained, no external image hosting).
//
//   pnpm build && pnpm seed
//
// Images come from the ../seed-images folder: drop files named after the product
// slug — `coffee-mug.jpg`, or `coffee-mug-1.png`, `coffee-mug-2.webp` for a
// gallery. Each file is base64-encoded into a data-URI. Products with no matching
// files fall back to generated SVG colour placeholders. Run any time to reset.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

interface SeedProduct {
  name: string;
  description: string;
  category: string;
  price_cents: number;
  colors: string[]; // one placeholder image is generated per color when no files are supplied
}

// Folder where you drop real product images. Resolves to <project>/seed-images
// both locally and in the container (dist lives one level below the project root).
const IMAGE_DIR = fileURLToPath(new URL('../seed-images', import.meta.url));

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// Read base64 data-URIs from seed-images for a product slug. Matches `<slug>` and
// `<slug>-<n>` (any supported extension), sorted so `-1`, `-2`, … keep their order.
function imagesFromFiles(slug: string): string[] {
  if (!existsSync(IMAGE_DIR)) return [];
  const re = new RegExp(`^${slug}(-\\d+)?$`, 'i');
  return readdirSync(IMAGE_DIR)
    .filter((f) => {
      const ext = extname(f).toLowerCase();
      return MIME[ext] && re.test(basename(f, ext));
    })
    .sort()
    .map((f) => {
      const ext = extname(f).toLowerCase();
      const b64 = readFileSync(join(IMAGE_DIR, f)).toString('base64');
      return `data:${MIME[ext]};base64,${b64}`;
    });
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
    const slug = slugify(p.name);
    const fromFiles = imagesFromFiles(slug);
    const images = fromFiles.length
      ? fromFiles
      : p.colors.map((c, i) => base64Image(`${p.name} ${i + 1}`, c));
    insert.run(p.name, p.description, JSON.stringify(images), p.category, p.price_cents);
    const source = fromFiles.length ? `${fromFiles.length} file image(s)` : `${images.length} placeholder(s)`;
    console.log(`  ${p.name} (${slug}): ${source}`);
  }
});

seed();
console.log(`Seeded ${PRODUCTS.length} products into db.sqlite (images from ${IMAGE_DIR})`);
