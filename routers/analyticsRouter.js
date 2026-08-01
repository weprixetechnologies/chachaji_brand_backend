const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Salesman Analytics Endpoint (Accessible by Salesman for self, or Admin for any salesman)
router.get('/salesman', requireAuth, requireRole('Admin', 'Salesman'), analyticsController.getSalesmanAnalytics);

// Admin Salesmen Leaderboard & Performance Report (Admin only)
router.get('/admin/salesmen-report', requireAuth, requireRole('Admin'), analyticsController.getAdminSalesmenReport);

module.exports = router;
