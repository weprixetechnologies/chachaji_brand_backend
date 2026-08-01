const argon2 = require('argon2');
const pool = require('../utils/db');

/**
 * Get list of all employees (Admin view)
 * GET /api/employees
 */
exports.getAllEmployees = async (req, res) => {
    try {
        const { search, role, status } = req.query;
        let query = `
            SELECT id, staff_code, name, email, role, phone, is_active, created_at, updated_at
            FROM employees
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (name LIKE ? OR email LIKE ? OR staff_code LIKE ? OR phone LIKE ?)`;
            const searchPattern = `%${search.trim()}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        if (role) {
            query += ` AND role = ?`;
            params.push(role);
        }

        if (status !== undefined && status !== '') {
            query += ` AND is_active = ?`;
            params.push(status === 'active' || status === '1' ? 1 : 0);
        }

        query += ` ORDER BY created_at DESC`;

        const [employees] = await pool.query(query, params);
        return res.status(200).json({ employees });
    } catch (error) {
        console.error('Get employees error:', error);
        return res.status(500).json({ error: 'Failed to fetch employees.' });
    }
};

/**
 * Create new employee (Admin operation)
 * POST /api/employees
 */
exports.createEmployee = async (req, res) => {
    try {
        const { staff_code, name, email, password, role = 'Salesman', phone, is_active = 1 } = req.body;

        if (!staff_code || !name || !email || !password) {
            return res.status(400).json({ error: 'Staff Code, Name, Email, and Password are required.' });
        }

        // Validate staff_code length and alphanumeric format (4 characters)
        const trimmedCode = staff_code.trim().toUpperCase();
        const staffCodeRegex = /^[A-Za-z0-9]{4}$/;
        if (!staffCodeRegex.test(trimmedCode)) {
            return res.status(400).json({ error: 'Staff Code must be exactly 4 alphanumeric characters (e.g. A001, S101).' });
        }

        // Check if email or staff_code exists
        const [existing] = await pool.query(
            'SELECT id, email, staff_code FROM employees WHERE email = ? OR staff_code = ?',
            [email.toLowerCase().trim(), trimmedCode]
        );

        if (existing.length > 0) {
            if (existing.some(e => e.email.toLowerCase() === email.toLowerCase().trim())) {
                return res.status(409).json({ error: 'An employee with this email already exists.' });
            }
            if (existing.some(e => e.staff_code === trimmedCode)) {
                return res.status(409).json({ error: 'An employee with this Staff Code already exists.' });
            }
        }

        // Hash password
        const hashedPassword = await argon2.hash(password);

        const [result] = await pool.query(
            `INSERT INTO employees (staff_code, name, email, password, role, phone, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [trimmedCode, name.trim(), email.toLowerCase().trim(), hashedPassword, role, phone || null, is_active ? 1 : 0]
        );

        const [newEmp] = await pool.query(
            'SELECT id, staff_code, name, email, role, phone, is_active, created_at FROM employees WHERE id = ?',
            [result.insertId]
        );

        return res.status(201).json({
            message: 'Employee created successfully',
            employee: newEmp[0]
        });
    } catch (error) {
        console.error('Create employee error:', error);
        return res.status(500).json({ error: 'Failed to create employee.' });
    }
};

/**
 * Edit employee details (Admin operation)
 * PUT /api/employees/:id
 */
exports.updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { staff_code, name, email, password, role, phone, is_active } = req.body;

        const [existing] = await pool.query('SELECT * FROM employees WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const currentEmp = existing[0];

        // Validate staff_code if changed
        let updatedStaffCode = currentEmp.staff_code;
        if (staff_code && staff_code.trim().toUpperCase() !== currentEmp.staff_code) {
            const trimmedCode = staff_code.trim().toUpperCase();
            const staffCodeRegex = /^[A-Za-z0-9]{4}$/;
            if (!staffCodeRegex.test(trimmedCode)) {
                return res.status(400).json({ error: 'Staff Code must be exactly 4 alphanumeric characters (e.g. A001, S101).' });
            }

            // Check uniqueness
            const [codeMatch] = await pool.query(
                'SELECT id FROM employees WHERE staff_code = ? AND id != ?',
                [trimmedCode, id]
            );
            if (codeMatch.length > 0) {
                return res.status(409).json({ error: 'Staff Code is already in use by another employee.' });
            }
            updatedStaffCode = trimmedCode;
        }

        // Validate email if changed
        let updatedEmail = currentEmp.email;
        if (email && email.toLowerCase().trim() !== currentEmp.email) {
            const trimmedEmail = email.toLowerCase().trim();
            const [emailMatch] = await pool.query(
                'SELECT id FROM employees WHERE email = ? AND id != ?',
                [trimmedEmail, id]
            );
            if (emailMatch.length > 0) {
                return res.status(409).json({ error: 'Email address is already in use by another employee.' });
            }
            updatedEmail = trimmedEmail;
        }

        // Hash password if provided
        let hashedPassword = currentEmp.password;
        if (password && password.trim().length > 0) {
            hashedPassword = await argon2.hash(password.trim());
        }

        const updatedName = name !== undefined ? name.trim() : currentEmp.name;
        const updatedRole = role !== undefined ? role : currentEmp.role;
        const updatedPhone = phone !== undefined ? phone : currentEmp.phone;
        const updatedIsActive = is_active !== undefined ? (is_active ? 1 : 0) : currentEmp.is_active;

        await pool.query(
            `UPDATE employees 
             SET staff_code = ?, name = ?, email = ?, password = ?, role = ?, phone = ?, is_active = ?
             WHERE id = ?`,
            [updatedStaffCode, updatedName, updatedEmail, hashedPassword, updatedRole, updatedPhone, updatedIsActive, id]
        );

        const [updatedRows] = await pool.query(
            'SELECT id, staff_code, name, email, role, phone, is_active, updated_at FROM employees WHERE id = ?',
            [id]
        );

        return res.status(200).json({
            message: 'Employee updated successfully',
            employee: updatedRows[0]
        });
    } catch (error) {
        console.error('Update employee error:', error);
        return res.status(500).json({ error: 'Failed to update employee.' });
    }
};

/**
 * Delete / Toggle employee status
 * DELETE /api/employees/:id
 */
exports.deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self deletion if logged in user is target
        if (parseInt(id, 10) === req.user.id) {
            return res.status(400).json({ error: 'You cannot delete or deactivate your own account.' });
        }

        const [existing] = await pool.query('SELECT id FROM employees WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Toggle or set inactive
        await pool.query('UPDATE employees SET is_active = 0 WHERE id = ?', [id]);

        return res.status(200).json({ message: 'Employee account deactivated successfully.' });
    } catch (error) {
        console.error('Delete employee error:', error);
        return res.status(500).json({ error: 'Failed to deactivate employee.' });
    }
};
