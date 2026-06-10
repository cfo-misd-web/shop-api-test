// Hand-written OpenAPI 3.1 document. Served at /openapi.json and rendered by Scalar at /docs.
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Shop API',
    version: '1.0.0',
    description:
      'Minimal shopping-cart API. Auth returns a JWT; send it as `Authorization: Bearer <token>` ' +
      'on cart requests. Sign up, sign in, add items to your cart, then check out.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Auth', description: 'Sign up / sign in (returns a JWT)' },
    { name: 'Catalog', description: 'Browse products' },
    { name: 'Ratings', description: 'Read aggregate ratings and submit your own' },
    { name: 'Comments', description: 'Read and post product comments' },
    { name: 'Cart', description: 'Manage your cart and check out' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', minLength: 6, example: 'hunter2pw' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Coffee Mug' },
          description: {
            type: 'string',
            example: 'A 350ml glazed stoneware mug that keeps your coffee warm and is dishwasher safe.',
          },
          images: {
            type: 'array',
            description: 'Ordered list of image URLs; the first is the primary image.',
            items: { type: 'string', format: 'uri' },
            example: [
              'https://picsum.photos/seed/coffee-mug-1/600/400',
              'https://picsum.photos/seed/coffee-mug-2/600/400',
              'https://picsum.photos/seed/coffee-mug-3/600/400',
            ],
          },
          category: { type: 'string', example: 'Kitchen' },
          price_cents: { type: 'integer', example: 1299 },
          average_rating: {
            type: ['number', 'null'],
            description: 'Mean of all ratings (null if none). Included on the product detail response.',
            example: 4.5,
          },
          rating_count: {
            type: 'integer',
            description: 'Number of ratings. Included on the product detail response.',
            example: 2,
          },
        },
      },
      RatingSummary: {
        type: 'object',
        properties: {
          product_id: { type: 'integer', example: 1 },
          average_rating: { type: ['number', 'null'], example: 4.5 },
          rating_count: { type: 'integer', example: 2 },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          product_id: { type: 'integer', example: 1 },
          user_id: { type: 'integer', example: 1 },
          author_email: { type: 'string', format: 'email', example: 'alice@example.com' },
          body: { type: 'string', example: 'Great mug, keeps coffee warm for ages!' },
          created_at: { type: 'string', example: '2026-06-10 08:15:00' },
        },
      },
      CartLine: {
        type: 'object',
        properties: {
          product_id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Coffee Mug' },
          price_cents: { type: 'integer', example: 1299 },
          quantity: { type: 'integer', example: 2 },
          line_total_cents: { type: 'integer', example: 2598 },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', example: 'alice@example.com' },
          token: {
            type: 'string',
            description: 'JWT — send as `Authorization: Bearer <token>`.',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjF9.abc123',
          },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  paths: {
    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        description: 'Registers a new user and returns a JWT.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: {
          201: {
            description: 'Account created; returns a JWT.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          400: { description: 'Missing or invalid fields', content: errContent() },
          409: { description: 'Email already registered', content: errContent() },
        },
      },
    },
    '/auth/signin': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in',
        description: 'Authenticates with email + password and returns a JWT.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: {
          200: {
            description: 'Signed in; returns a JWT.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } },
          },
          400: { description: 'Missing fields', content: errContent() },
          401: { description: 'Invalid credentials', content: errContent() },
        },
      },
    },
    '/products': {
      get: {
        tags: ['Catalog'],
        summary: 'List products',
        description: 'Returns the catalog. Use a product `id` when adding to the cart.',
        responses: {
          200: {
            description: 'Product list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
              },
            },
          },
        },
      },
    },
    '/products/{id}': {
      get: {
        tags: ['Catalog'],
        summary: 'Get a product',
        description: 'Returns one product with all of its details (description, images, category).',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            example: 1,
          },
        ],
        responses: {
          200: {
            description: 'Product detail',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } },
          },
          400: { description: 'Invalid product id', content: errContent() },
          404: { description: 'Product not found', content: errContent() },
        },
      },
    },
    '/products/{id}/rating': {
      get: {
        tags: ['Ratings'],
        summary: 'Get a product rating summary',
        description: "Returns the product's average rating and rating count. Public.",
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        responses: {
          200: {
            description: 'Rating summary',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RatingSummary' } } },
          },
          400: { description: 'Invalid product id', content: errContent() },
          404: { description: 'Product not found', content: errContent() },
        },
      },
      post: {
        tags: ['Ratings'],
        summary: 'Rate a product',
        description:
          'Submits a 1–5 star rating. A user has at most one rating per product; rating again updates it.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rating'],
                properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5, example: 4 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Rating saved; returns the updated summary plus your rating.',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/RatingSummary' },
                    { type: 'object', properties: { your_rating: { type: 'integer', example: 4 } } },
                  ],
                },
              },
            },
          },
          400: { description: 'Invalid product id or rating', content: errContent() },
          401: { description: 'Not authenticated', content: errContent() },
          404: { description: 'Product not found', content: errContent() },
        },
      },
    },
    '/products/{id}/comments': {
      get: {
        tags: ['Comments'],
        summary: 'List product comments',
        description: 'Returns all comments for a product, newest first.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        responses: {
          200: {
            description: 'Comment list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Comment' } },
              },
            },
          },
          400: { description: 'Invalid product id', content: errContent() },
          404: { description: 'Product not found', content: errContent() },
        },
      },
      post: {
        tags: ['Comments'],
        summary: 'Post a comment',
        description: 'Adds a comment (with an optional 1–5 star rating) to a product.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['body'],
                properties: {
                  body: { type: 'string', maxLength: 2000, example: 'Great mug, keeps coffee warm!' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Comment created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Comment' } } },
          },
          400: { description: 'Invalid product id or comment body', content: errContent() },
          401: { description: 'Not authenticated', content: errContent() },
          404: { description: 'Product not found', content: errContent() },
        },
      },
    },
    '/cart': {
      get: {
        tags: ['Cart'],
        summary: 'View cart',
        description: "Returns the signed-in user's cart lines and the total.",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Cart contents',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/CartLine' } },
                    total_cents: { type: 'integer', example: 2598 },
                  },
                },
              },
            },
          },
          401: { description: 'Not authenticated', content: errContent() },
        },
      },
    },
    '/cart/items': {
      post: {
        tags: ['Cart'],
        summary: 'Add an item to the cart',
        description:
          'Adds `quantity` of a product to the cart. Adding an existing product increments its quantity.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId'],
                properties: {
                  productId: { type: 'integer', example: 1 },
                  quantity: { type: 'integer', minimum: 1, default: 1, example: 2 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Item added; returns the updated cart.' },
          400: { description: 'Invalid product or quantity', content: errContent() },
          401: { description: 'Not authenticated', content: errContent() },
        },
      },
    },
    '/cart/checkout': {
      post: {
        tags: ['Cart'],
        summary: 'Check out',
        description: 'Converts the current cart into an order, then empties the cart.',
        security: [{ bearerAuth: [] }],
        responses: {
          201: {
            description: 'Order created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    order_id: { type: 'integer', example: 1 },
                    total_cents: { type: 'integer', example: 2598 },
                  },
                },
              },
            },
          },
          400: { description: 'Cart is empty', content: errContent() },
          401: { description: 'Not authenticated', content: errContent() },
        },
      },
    },
  },
} as const;

function errContent() {
  return { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } };
}
