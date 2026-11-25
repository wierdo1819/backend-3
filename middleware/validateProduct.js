const { AppError } = require('./errorHandler');

const STRING_FIELDS = ['name', 'sku', 'category', 'supplier'];
const NUMERIC_FIELDS = ['price', 'quantity', 'reorderLevel'];
const ALLOWED_PRODUCT_FIELDS = [...STRING_FIELDS, ...NUMERIC_FIELDS];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNonNegativeNumber(value, fieldName, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ field: fieldName, message: `${fieldName} must be a valid finite number` });
    return;
  }
  if (value < 0) {
    errors.push({ field: fieldName, message: `${fieldName} cannot be negative` });
  }
}

function validateProductPayload(body, { requireAllCoreFields }) {
  if (!isPlainObject(body)) {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const errors = [];
  const hasAnyAllowedField = ALLOWED_PRODUCT_FIELDS.some((field) => field in body);

  if (!requireAllCoreFields && !hasAnyAllowedField) {
    throw new AppError(
      `At least one updatable field is required (${ALLOWED_PRODUCT_FIELDS.join(', ')})`,
      400
    );
  }

  for (const field of STRING_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push({ field, message: `${field} must be a non-empty string` });
      }
    } else if (requireAllCoreFields) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  for (const field of NUMERIC_FIELDS) {
    if (field in body) {
      validateNonNegativeNumber(body[field], field, errors);
    } else if (requireAllCoreFields && field === 'price') {
      errors.push({ field, message: 'price is required' });
    }
  }

  if (errors.length > 0) {
    throw new AppError(
      errors.map((e) => e.message).join('; '),
      400,
      errors
    );
  }
}

function validateCreateProduct(req, res, next) {
  validateProductPayload(req.body, { requireAllCoreFields: true });
  next();
}

function validateUpdateProduct(req, res, next) {
  validateProductPayload(req.body, { requireAllCoreFields: false });
  next();
}

function validateStockAdjustment(req, res, next) {
  if (!isPlainObject(req.body)) {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const { change } = req.body;
  if (typeof change !== 'number' || !Number.isFinite(change)) {
    throw new AppError('Field "change" is required and must be a finite number', 400, [
      { field: 'change', message: 'change must be a finite number' },
    ]);
  }

  next();
}

function parseOptionalQueryNumber(raw, paramName, { integer = false, min = 0 } = {}) {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || (integer && !Number.isInteger(num)) || num < min) {
    const constraint = integer ? `an integer >= ${min}` : `a number >= ${min}`;
    throw new AppError(`Query parameter "${paramName}" must be ${constraint}`, 400);
  }
  return num;
}

function validateProductQuery(req, res, next) {
  parseOptionalQueryNumber(req.query.minPrice, 'minPrice', { min: 0 });
  parseOptionalQueryNumber(req.query.maxPrice, 'maxPrice', { min: 0 });
  parseOptionalQueryNumber(req.query.page, 'page', { integer: true, min: 1 });
  parseOptionalQueryNumber(req.query.limit, 'limit', { integer: true, min: 1 });
  next();
}

module.exports = {
  ALLOWED_PRODUCT_FIELDS,
  validateCreateProduct,
  validateUpdateProduct,
  validateStockAdjustment,
  validateProductQuery,
};
