# Seed images

Drop product images here and `pnpm seed` (or `docker compose run --rm seed`) will
base64-encode them into the catalog. No code changes needed.

## Naming

Name each file after the product **slug** (lowercase, non-alphanumerics → `-`).
Add `-1`, `-2`, … for multiple images (a gallery), shown in sorted order:

| Product      | Slug           | Example files                                     |
| ------------ | -------------- | ------------------------------------------------- |
| Coffee Mug   | `coffee-mug`   | `coffee-mug.jpg`, `coffee-mug-2.png`              |
| T-Shirt      | `t-shirt`      | `t-shirt.jpg`, `t-shirt-1.webp`, `t-shirt-2.webp` |
| Notebook     | `notebook`     | `notebook.png`                                    |
| Sticker Pack | `sticker-pack` | `sticker-pack.jpg`                                |

Supported extensions: `.jpg` `.jpeg` `.png` `.webp` `.gif` `.svg`.

Products with **no** matching file fall back to generated SVG colour placeholders,
so partial coverage is fine — supply images for whichever items you have.
