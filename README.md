# Shop API

A deliberately minimal shopping-cart API.

- **Express** — the only runtime dependency.
- **SQLite** via `better-sqlite3` (synchronous, fast). Data lives in `db.sqlite`.
- **JWT bearer auth** with `node:crypto` (scrypt password hashing, hand-rolled HS256 tokens). Auth returns a token; send it as `Authorization: Bearer <token>`. No `bcrypt`, no `jsonwebtoken`. Stateless — no session store.
- **TypeScript**, bundled with **tsdown**.
- **Scalar** API docs loaded from CDN — no docs package installed.

## Setup

```bash
pnpm install    # builds the better-sqlite3 native addon
pnpm build      # tsdown -> dist/
pnpm start      # node dist/server.js
```

Server runs on http://localhost:3000.

- **/** — static test client (click through signup → cart → checkout)
- **/test** — manual test plan with a flowchart of the exact flow
- **/docs** — interactive Scalar API reference
- **/openapi.json** — the OpenAPI spec

## Endpoints

| Method | Path              | Auth   | Description                             |
| ------ | ----------------- | ------ | --------------------------------------- |
| POST   | `/auth/signup`    | —      | Create account, returns `{ token }`     |
| POST   | `/auth/signin`    | —      | Sign in, returns `{ token }`            |
| GET    | `/products`       | —      | List catalog                            |
| GET    | `/cart`           | Bearer | View cart                               |
| POST   | `/cart/items`     | Bearer | Add an item (`{ productId, quantity }`) |
| POST   | `/cart/checkout`  | Bearer | Turn cart into an order                 |

Authenticated requests must send `Authorization: Bearer <token>`. Set `JWT_SECRET` in production (defaults to a dev value).

## Example

```bash
# sign up -> grab the token
TOKEN=$(curl -s -X POST localhost:3000/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"hunter2pw"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# add 2 of product 1, then check out
curl -X POST localhost:3000/cart/items -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"productId":1,"quantity":2}'
curl -X POST localhost:3000/cart/checkout -H "Authorization: Bearer $TOKEN"
```
