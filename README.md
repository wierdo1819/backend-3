# Inventory and Data Management System API

A RESTful backend built using **only** Node.js, Express.js, Mongoose, and dotenv.

## Project Structure

```text
inventory-management-api/
├── config/
│   └── db.js                   # Mongoose connection setup
├── controllers/
│   └── productController.js    # Route handlers & aggregation queries
├── middleware/
│   ├── asyncHandler.js         # Async error forwarding wrapper
│   ├── errorHandler.js         # Centralized error formatter & AppError
│   ├── notFound.js             # 404 handler for unknown routes
│   └── validateProduct.js      # Request body & query validation
├── models/
│   └── Product.js              # Mongoose schema, indexes & virtuals
├── routes/
│   └── productRoutes.js        # /api/products endpoints
├── scripts/
│   └── seed.js                 # Sample data seeder (12 products across 5 categories)
├── tests/
│   └── api.test.js             # Automated tests using Node built-in test runner
├── .env.example
├── .gitignore
├── app.js                      # Express app setup
├── package.json
└── server.js                   # Entry point
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Update `PORT` (default `5000`) and `MONGO_URI` as needed.

3. (Optional) Seed sample inventory data:
   ```bash
   npm run seed
   ```

4. Start the server:
   ```bash
   npm start
   ```
   Or with file watching during development:
   ```bash
   npm run dev
   ```

5. Run tests:
   ```bash
   npm test
   ```

## API Endpoints

Base path: `/api/products`

### 1. Create Product — `POST /api/products`
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wireless Barcode Scanner",
    "sku": "elec-scn-009",
    "category": "Electronics",
    "price": 129.99,
    "quantity": 15,
    "reorderLevel": 5,
    "supplier": "TechSource Distributors"
  }'
```

### 2. List Products (Filter, Sort, Paginate) — `GET /api/products`
Query parameters:
- `category` — exact category match (case-insensitive)
- `supplier` — exact supplier match (case-insensitive)
- `search` — case-insensitive partial match on `name` or `sku`
- `minPrice`, `maxPrice` — numeric price range
- `sort` — field(s), e.g., `price`, `-price`, `quantity`, `-createdAt` (default `-createdAt`)
- `page` — page number (default `1`)
- `limit` — items per page (default `10`)

```bash
curl "http://localhost:5000/api/products?category=Electronics&minPrice=50&sort=-price&page=1&limit=5"
```

### 3. Low-Stock Report — `GET /api/products/low-stock`
Returns products where `quantity <= reorderLevel`, sorted by lowest quantity.
```bash
curl http://localhost:5000/api/products/low-stock
```

### 4. Category-Wise Summary — `GET /api/products/summary`
Runs a MongoDB aggregation pipeline grouped by `category`.
```bash
curl http://localhost:5000/api/products/summary
```

### 5. Get Product by ID — `GET /api/products/:id`
```bash
curl http://localhost:5000/api/products/<product_id>
```

### 6. Update Product — `PUT /api/products/:id`
```bash
curl -X PUT http://localhost:5000/api/products/<product_id> \
  -H "Content-Type: application/json" \
  -d '{
    "price": 119.99,
    "reorderLevel": 8
  }'
```

### 7. Adjust Stock — `PATCH /api/products/:id/stock`
Atomically increments or decrements `quantity` while preventing negative stock (`400 Bad Request`).
```bash
# Restock (+10)
curl -X PATCH http://localhost:5000/api/products/<product_id>/stock \
  -H "Content-Type: application/json" \
  -d '{ "change": 10 }'

# Deduct / Sale (-4)
curl -X PATCH http://localhost:5000/api/products/<product_id>/stock \
  -H "Content-Type: application/json" \
  -d '{ "change": -4 }'
```

### 8. Delete Product — `DELETE /api/products/:id`
```bash
curl -X DELETE http://localhost:5000/api/products/<product_id>
```
