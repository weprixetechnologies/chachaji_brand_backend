const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Public route to list categories
router.get('/', categoryController.getAllCategories);

// Admin restricted category management routes
router.post('/', requireAuth, requireRole('Admin'), categoryController.createCategory);
router.put('/:id', requireAuth, requireRole('Admin'), categoryController.updateCategory);
router.patch('/:id/status', requireAuth, requireRole('Admin'), categoryController.toggleCategoryStatus);

module.exports = router;
