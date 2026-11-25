const express = require('express');
const {
  createProduct,
  getProducts,
  getLowStockProducts,
  getInventorySummary,
  getProductById,
  updateProduct,
  adjustProductStock,
  deleteProduct,
} = require('../controllers/productController');
const {
  validateCreateProduct,
  validateUpdateProduct,
  validateStockAdjustment,
  validateProductQuery,
} = require('../middleware/validateProduct');

const router = express.Router();

// Static routes must be registered before /:id so they do not match as an ObjectId
router.get('/low-stock', getLowStockProducts);
router.get('/summary', getInventorySummary);

router
  .route('/')
  .post(validateCreateProduct, createProduct)
  .get(validateProductQuery, getProducts);

router
  .route('/:id')
  .get(getProductById)
  .put(validateUpdateProduct, updateProduct)
  .delete(deleteProduct);

router.patch('/:id/stock', validateStockAdjustment, adjustProductStock);

module.exports = router;
