const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Order routes protected by requireAuth and role check (Salesman or Admin)
router.use(requireAuth, requireRole('Admin', 'Salesman'));

router.get('/', orderController.getAllOrders);
router.get('/:id', orderController.getOrderById);
router.post('/', orderController.createOrder);

module.exports = router;
