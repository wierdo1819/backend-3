const Product = require('../models/Product');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { ALLOWED_PRODUCT_FIELDS } = require('../middleware/validateProduct');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickAllowedFields(body) {
  const result = {};
  for (const field of ALLOWED_PRODUCT_FIELDS) {
    if (field in body) {
      result[field] = body[field];
    }
  }
  return result;
}

function buildProductFilter(query) {
  const filter = {};

  if (typeof query.category === 'string' && query.category.trim()) {
    filter.category = new RegExp(`^${escapeRegex(query.category.trim())}$`, 'i');
  }

  if (typeof query.supplier === 'string' && query.supplier.trim()) {
    filter.supplier = new RegExp(`^${escapeRegex(query.supplier.trim())}$`, 'i');
  }

  if (typeof query.search === 'string' && query.search.trim()) {
    const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ name: searchRegex }, { sku: searchRegex }];
  }

  if (query.minPrice !== undefined && query.minPrice !== '') {
    filter.price = { ...filter.price, $gte: Number(query.minPrice) };
  }

  if (query.maxPrice !== undefined && query.maxPrice !== '') {
    filter.price = { ...filter.price, $lte: Number(query.maxPrice) };
  }

  return filter;
}

const createProduct = asyncHandler(async (req, res) => {
  const payload = pickAllowedFields(req.body);
  const product = await Product.create(payload);
  res.status(201).json(product);
});

const getProducts = asyncHandler(async (req, res) => {
  const filter = buildProductFilter(req.query);

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const skip = (page - 1) * limit;

  const sortBy =
    typeof req.query.sort === 'string' && req.query.sort.trim()
      ? req.query.sort
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .join(' ')
      : '-createdAt';

  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort(sortBy).skip(skip).limit(limit),
  ]);

  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    total,
    page,
    totalPages,
    count: products.length,
    products,
  });
});

const getLowStockProducts = asyncHandler(async (req, res) => {
  const lowStockItems = await Product.find({
    $expr: { $lte: ['$quantity', '$reorderLevel'] },
  }).sort({ quantity: 1, name: 1 });

  res.status(200).json({
    count: lowStockItems.length,
    lowStockItems,
  });
});

const getInventorySummary = asyncHandler(async (req, res) => {
  const summary = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' },
      },
    },
    {
      $project: {
        _id: 1,
        totalItems: 1,
        totalQuantity: 1,
        totalStockValue: { $round: ['$totalStockValue', 2] },
        avgPrice: { $round: ['$avgPrice', 2] },
      },
    },
    {
      $sort: { totalStockValue: -1, _id: 1 },
    },
  ]);

  res.status(200).json({
    categories: summary.length,
    summary,
  });
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  res.status(200).json(product);
});

const updateProduct = asyncHandler(async (req, res) => {
  const updates = pickAllowedFields(req.body);
  const product = await Product.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json(product);
});

const adjustProductStock = asyncHandler(async (req, res) => {
  const { change } = req.body;
  const filter = { _id: req.params.id };

  if (change < 0) {
    filter.quantity = { $gte: Math.abs(change) };
  }

  const updatedProduct = await Product.findOneAndUpdate(
    filter,
    { $inc: { quantity: change } },
    { new: true, runValidators: true }
  );

  if (!updatedProduct) {
    const existing = await Product.findById(req.params.id);
    if (!existing) {
      throw new AppError('Product not found', 404);
    }
    throw new AppError(
      `Insufficient stock: current quantity is ${existing.quantity}, cannot deduct ${Math.abs(change)}`,
      400
    );
  }

  res.status(200).json({
    message: 'Stock updated',
    product: updatedProduct,
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const deleted = await Product.findByIdAndDelete(req.params.id);
  if (!deleted) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({
    message: 'Product deleted',
    id: deleted.id,
  });
});

module.exports = {
  createProduct,
  getProducts,
  getLowStockProducts,
  getInventorySummary,
  getProductById,
  updateProduct,
  adjustProductStock,
  deleteProduct,
};
