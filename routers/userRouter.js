const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// All buyer user routes require authentication and either Admin or Salesman role
router.use(requireAuth, requireRole('Admin', 'Salesman'));

// List all buyers
router.get('/', userController.getAllUsers);

// Get single buyer details
router.get('/:id', userController.getUserById);

// Get all orders for a specific buyer
router.get('/:id/orders', userController.getUserOrders);

// Create buyer (Accessible by Admin and Salesman)
router.post('/', userController.createUser);

// Update buyer details
router.put('/:id', userController.updateUser);

// Toggle buyer status
router.patch('/:id/status', userController.toggleUserStatus);

module.exports = router;
