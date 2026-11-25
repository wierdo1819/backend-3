const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PassThrough } = require('node:stream');
const mongoose = require('mongoose');
const app = require('../app');
const Product = require('../models/Product');
const { errorHandler } = require('../middleware/errorHandler');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough();
    socket.remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket);
    req.url = path;
    req.method = options.method || 'GET';
    req.headers = {
      'content-type': 'application/json',
      ...(options.headers || {}),
    };

    if (options.body) {
      req.headers['content-length'] = String(Buffer.byteLength(options.body));
    }

    const chunks = [];
    const res = new http.ServerResponse(req);
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      return origWrite(chunk, encoding, cb);
    };

    res.end = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      const result = { status: res.statusCode, body };
      const ret = origEnd(chunk, encoding, cb);
      setImmediate(() => resolve(result));
      return ret;
    };

    app(req, res, reject);

    setImmediate(() => {
      if (options.body) {
        req.push(options.body);
      }
      req.push(null);
    });
  });
}

describe('Product Mongoose Schema & Virtuals', () => {
  it('applies defaults, trimming, uppercase SKU, and calculates stockValue virtual', async () => {
    const doc = new Product({
      name: '  Wireless Mouse  ',
      sku: '  elec-mou-101  ',
      category: '  Electronics  ',
      price: 25.5,
      supplier: '  TechSupply Co  ',
    });

    await doc.validate();

    assert.equal(doc.name, 'Wireless Mouse');
    assert.equal(doc.sku, 'ELEC-MOU-101');
    assert.equal(doc.category, 'Electronics');
    assert.equal(doc.supplier, 'TechSupply Co');
    assert.equal(doc.quantity, 0);
    assert.equal(doc.reorderLevel, 0);

    const json = doc.toJSON();
    const obj = doc.toObject();
    assert.equal(json.id, doc._id.toString());
    assert.equal(obj.id, doc._id.toString());
    assert.equal(json.stockValue, 0);
    assert.equal(obj.stockValue, 0);

    doc.quantity = 4;
    assert.equal(doc.toJSON().stockValue, 102);
  });

  it('rejects negative price, quantity, reorderLevel, and missing required fields', async () => {
    const invalid = new Product({
      price: -10,
      quantity: -1,
      reorderLevel: -5,
    });

    await assert.rejects(
      () => invalid.validate(),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        assert.ok(err.errors.name);
        assert.ok(err.errors.sku);
        assert.ok(err.errors.category);
        assert.ok(err.errors.supplier);
        assert.ok(err.errors.price);
        assert.ok(err.errors.quantity);
        assert.ok(err.errors.reorderLevel);
        return true;
      }
    );
  });
});

describe('Centralized Error Handler Formatting', () => {
  function runErrorMiddleware(err) {
    let statusCode;
    let payload;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return this;
      },
    };
    errorHandler(err, {}, res, () => {});
    return { status: statusCode, body: payload };
  }

  it('formats Mongoose ValidationError as 400', async () => {
    const doc = new Product({ price: -1 });
    let validationErr;
    try {
      await doc.validate();
    } catch (err) {
      validationErr = err;
    }

    const res = runErrorMiddleware(validationErr);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Validation Error');
    assert.ok(Array.isArray(res.body.details));
    assert.ok(res.body.details.length >= 1);
  });

  it('formats Mongoose CastError as 400', () => {
    const castErr = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    const res = runErrorMiddleware(castErr);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid Identifier');
  });

  it('formats MongoDB duplicate key error (11000) as 409', () => {
    const dupErr = new Error('E11000 duplicate key error');
    dupErr.code = 11000;
    dupErr.keyValue = { sku: 'ELEC-001' };

    const res = runErrorMiddleware(dupErr);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'Duplicate Key Error');
    assert.equal(res.body.field, 'sku');
  });
});

describe('Inventory API Routes & Controllers', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('returns 404 for unknown routes and 400 for malformed JSON', async () => {
    const notFoundRes = await request('/api/unknown');
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.error, 'Not Found');

    const badJsonRes = await request('/api/products', {
      method: 'POST',
      body: '{"name": "Broken JSON"',
    });
    assert.equal(badJsonRes.status, 400);
    assert.equal(badJsonRes.body.error, 'Invalid JSON');
  });

  it('POST /api/products validates input and creates a product with 201', async () => {
    const invalidRes = await request('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: '', price: -5 }),
    });
    assert.equal(invalidRes.status, 400);
    assert.ok(Array.isArray(invalidRes.body.details));

    const validPayload = {
      name: 'Mechanical Keyboard',
      sku: 'elec-key-99',
      category: 'Electronics',
      price: 120,
      quantity: 5,
      reorderLevel: 2,
      supplier: 'KeySupply',
    };

    const createdDoc = new Product(validPayload);
    const createMock = mock.method(Product, 'create', async (data) => {
      assert.equal(data.name, 'Mechanical Keyboard');
      assert.equal(data.sku, 'elec-key-99');
      return createdDoc;
    });

    const res = await request('/api/products', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    assert.equal(res.status, 201);
    assert.equal(createMock.mock.callCount(), 1);
    assert.equal(res.body.sku, 'ELEC-KEY-99');
    assert.equal(res.body.stockValue, 600);
    assert.equal(res.body.id, createdDoc._id.toString());
  });

  it('GET /api/products supports filtering, sorting, pagination, and rejects bad query params', async () => {
    const badQuery = await request('/api/products?minPrice=-10');
    assert.equal(badQuery.status, 400);

    const badPage = await request('/api/products?page=0');
    assert.equal(badPage.status, 400);

    const sampleDocs = [
      new Product({
        name: 'Monitor',
        sku: 'MON-1',
        category: 'Electronics',
        price: 300,
        quantity: 4,
        reorderLevel: 2,
        supplier: 'Acme',
      }),
    ];

    let capturedFilter;
    let capturedSort;
    let capturedSkip;
    let capturedLimit;

    mock.method(Product, 'countDocuments', async (filter) => {
      capturedFilter = filter;
      return 12;
    });

    mock.method(Product, 'find', (filter) => {
      assert.deepEqual(filter, capturedFilter);
      return {
        sort(sortArg) {
          capturedSort = sortArg;
          return this;
        },
        skip(skipArg) {
          capturedSkip = skipArg;
          return this;
        },
        limit(limitArg) {
          capturedLimit = limitArg;
          return Promise.resolve(sampleDocs);
        },
      };
    });

    const res = await request(
      '/api/products?category=Electronics&supplier=Acme&search=mon&minPrice=100&maxPrice=500&sort=-price&page=2&limit=5'
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 12);
    assert.equal(res.body.page, 2);
    assert.equal(res.body.totalPages, 3);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.products.length, 1);
    assert.equal(res.body.products[0].stockValue, 1200);

    assert.ok(capturedFilter.category instanceof RegExp);
    assert.ok(capturedFilter.supplier instanceof RegExp);
    assert.equal(capturedFilter.$or.length, 2);
    assert.deepEqual(capturedFilter.price, { $gte: 100, $lte: 500 });
    assert.equal(capturedSort, '-price');
    assert.equal(capturedSkip, 5);
    assert.equal(capturedLimit, 5);
  });

  it('GET /api/products/low-stock returns low-stock items without colliding with /:id', async () => {
    const lowDoc = new Product({
      name: 'Low Item',
      sku: 'LOW-1',
      category: 'Office',
      price: 10,
      quantity: 2,
      reorderLevel: 5,
      supplier: 'SupplierA',
    });

    let capturedFilter;
    let capturedSort;
    mock.method(Product, 'find', (filter) => {
      capturedFilter = filter;
      return {
        sort(sortArg) {
          capturedSort = sortArg;
          return Promise.resolve([lowDoc]);
        },
      };
    });

    const res = await request('/api/products/low-stock');
    assert.equal(res.status, 200);
    assert.deepEqual(capturedFilter, { $expr: { $lte: ['$quantity', '$reorderLevel'] } });
    assert.deepEqual(capturedSort, { quantity: 1, name: 1 });
    assert.equal(res.body.count, 1);
    assert.equal(res.body.lowStockItems[0].sku, 'LOW-1');
  });

  it('GET /api/products/summary runs aggregation pipeline and returns category summary', async () => {
    let capturedPipeline;
    mock.method(Product, 'aggregate', async (pipeline) => {
      capturedPipeline = pipeline;
      return [
        {
          _id: 'Electronics',
          totalItems: 4,
          totalQuantity: 96,
          totalStockValue: 343904,
          avgPrice: 5636.5,
        },
      ];
    });

    const res = await request('/api/products/summary');
    assert.equal(res.status, 200);
    assert.equal(res.body.categories, 1);
    assert.equal(res.body.summary[0]._id, 'Electronics');
    assert.equal(res.body.summary[0].totalStockValue, 343904);
    assert.ok(capturedPipeline.some((stage) => '$group' in stage));
    assert.ok(capturedPipeline.some((stage) => '$project' in stage));
    assert.ok(capturedPipeline.some((stage) => '$sort' in stage));
  });

  it('GET /api/products/:id returns 404 when not found and 200 when found', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const doc = new Product({
      _id: id,
      name: 'Desk Lamp',
      sku: 'FURN-LMP-1',
      category: 'Furniture',
      price: 45,
      quantity: 10,
      reorderLevel: 3,
      supplier: 'LightCo',
    });

    mock.method(Product, 'findById', async (lookupId) => (lookupId === id ? doc : null));

    const okRes = await request(`/api/products/${id}`);
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.id, id);
    assert.equal(okRes.body.stockValue, 450);

    const missingId = new mongoose.Types.ObjectId().toString();
    const missingRes = await request(`/api/products/${missingId}`);
    assert.equal(missingRes.status, 404);
  });

  it('PUT /api/products/:id validates body and updates with runValidators: true', async () => {
    const id = new mongoose.Types.ObjectId().toString();

    const emptyUpdate = await request(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({}),
    });
    assert.equal(emptyUpdate.status, 400);

    const updatedDoc = new Product({
      _id: id,
      name: 'Updated Lamp',
      sku: 'FURN-LMP-1',
      category: 'Furniture',
      price: 50,
      quantity: 10,
      reorderLevel: 3,
      supplier: 'LightCo',
    });

    let capturedOptions;
    mock.method(Product, 'findByIdAndUpdate', async (lookupId, updates, options) => {
      capturedOptions = options;
      assert.equal(lookupId, id);
      assert.equal(updates.price, 50);
      return updatedDoc;
    });

    const res = await request(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ price: 50 }),
    });

    assert.equal(res.status, 200);
    assert.equal(capturedOptions.runValidators, true);
    assert.equal(capturedOptions.new, true);
    assert.equal(res.body.price, 50);
  });

  it('PATCH /api/products/:id/stock prevents negative stock and updates atomically', async () => {
    const id = new mongoose.Types.ObjectId().toString();

    const badBody = await request(`/api/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ change: '5' }),
    });
    assert.equal(badBody.status, 400);

    const existingDoc = new Product({
      _id: id,
      name: 'Desk Lamp',
      sku: 'FURN-LMP-1',
      category: 'Furniture',
      price: 45,
      quantity: 3,
      reorderLevel: 2,
      supplier: 'LightCo',
    });

    mock.method(Product, 'findOneAndUpdate', async (filter, update) => {
      if (filter.quantity && filter.quantity.$gte > existingDoc.quantity) {
        return null;
      }
      existingDoc.quantity += update.$inc.quantity;
      return existingDoc;
    });

    mock.method(Product, 'findById', async (lookupId) =>
      lookupId === id ? existingDoc : null
    );

    const overDeductRes = await request(`/api/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ change: -10 }),
    });
    assert.equal(overDeductRes.status, 400);
    assert.match(overDeductRes.body.message, /Insufficient stock/);

    const restockRes = await request(`/api/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ change: 7 }),
    });
    assert.equal(restockRes.status, 200);
    assert.equal(restockRes.body.message, 'Stock updated');
    assert.equal(restockRes.body.product.quantity, 10);
  });

  it('DELETE /api/products/:id deletes product or returns 404', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const doc = new Product({
      _id: id,
      name: 'Desk Lamp',
      sku: 'FURN-LMP-1',
      category: 'Furniture',
      price: 45,
      quantity: 10,
      reorderLevel: 3,
      supplier: 'LightCo',
    });

    mock.method(Product, 'findByIdAndDelete', async (lookupId) =>
      lookupId === id ? doc : null
    );

    const okRes = await request(`/api/products/${id}`, { method: 'DELETE' });
    assert.equal(okRes.status, 200);
    assert.deepEqual(okRes.body, { message: 'Product deleted', id });

    const missingId = new mongoose.Types.ObjectId().toString();
    const missingRes = await request(`/api/products/${missingId}`, { method: 'DELETE' });
    assert.equal(missingRes.status, 404);
  });
});
