const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');
const { requireAuth } = require('../middlewares/authMiddleware');

// OTP Endpoints protected by requireAuth (Salesman or Admin)
router.post('/send', requireAuth, otpController.sendOtp);
router.post('/verify', requireAuth, otpController.verifyOtp);

module.exports = router;
