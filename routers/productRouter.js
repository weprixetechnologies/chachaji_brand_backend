const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Get products list & single product details (Public or authenticated)
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Admin restricted product management routes
router.post('/', requireAuth, requireRole('Admin'), productController.createProduct);
router.put('/:id', requireAuth, requireRole('Admin'), productController.updateProduct);
router.patch('/:id/status', requireAuth, requireRole('Admin'), productController.toggleProductStatus);

// BULK DEACTIVATE products endpoint
router.post('/bulk-deactivate', requireAuth, requireRole('Admin'), productController.bulkDeactivateProducts);

module.exports = router;
