const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// All employee routes require authentication and Admin role
router.use(requireAuth, requireRole('Admin'));

// List all employees
router.get('/', employeeController.getAllEmployees);

// Create new employee (staff_code 4 alphanumeric)
router.post('/', employeeController.createEmployee);

// Edit employee
router.put('/:id', employeeController.updateEmployee);

// Deactivate employee
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;
