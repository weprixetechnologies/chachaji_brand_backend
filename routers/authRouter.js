const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/authMiddleware');

// 1. Signup Employee
router.post('/signup', authController.signup);

// 2. Login Employee
router.post('/login', authController.login);

// 3. Refresh Endpoint
router.post('/refresh', authController.refresh);

// 4. Auth Me endpoint (Protected)
router.get('/me', requireAuth, authController.authMe);

// 5. Forgot Password via token link
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
