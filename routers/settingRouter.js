const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Get all system settings (Available to authenticated staff)
router.get('/', requireAuth, settingController.getSettings);

// Update system settings (Available to authenticated staff / admin)
router.put('/', requireAuth, settingController.updateSettings);

module.exports = router;
