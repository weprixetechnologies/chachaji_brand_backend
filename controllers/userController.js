const argon2 = require('argon2');
const pool = require('../utils/db');

// Helper to generate unique Customer Code (e.g., CUST-7829)
function generateUserCode() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `CUST-${rand}`;
}

/**
 * Get list of Buyer Users
 * GET /api/users
 */
exports.getAllUsers = async (req, res) => {
    try {
        const { search, created_by, status } = req.query;

        let query = `
            SELECT 
                u.id,
                u.user_code,
                u.name,
                u.email,
                u.phone,
                u.company_name,
                u.gstin,
                u.address,
                u.city,
                u.state,
                u.pincode,
                u.created_by,
                u.is_active,
                u.created_at,
                u.updated_at,
                e.name AS creator_name,
                e.staff_code AS creator_code,
                e.role AS creator_role
            FROM users u
            LEFT JOIN employees e ON u.created_by = e.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.company_name LIKE ? OR u.email LIKE ? OR u.user_code LIKE ? OR u.city LIKE ?)`;
            const pattern = `%${search.trim()}%`;
            params.push(pattern, pattern, pattern, pattern, pattern, pattern);
        }

        if (created_by) {
            query += ` AND u.created_by = ?`;
            params.push(created_by);
        }

        if (status !== undefined && status !== '') {
            query += ` AND u.is_active = ?`;
            params.push(status === 'active' || status === '1' ? 1 : 0);
        }

        query += ` ORDER BY u.created_at DESC`;

        const [users] = await pool.query(query, params);
        return res.status(200).json({ users });
    } catch (error) {
        console.error('Get users error:', error);
        return res.status(500).json({ error: 'Failed to fetch buyers/users.' });
    }
};

/**
 * Get buyer user details by ID
 * GET /api/users/:id
 */
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const [users] = await pool.query(
            `SELECT u.*, e.name AS creator_name, e.staff_code AS creator_code
             FROM users u
             LEFT JOIN employees e ON u.created_by = e.id
             WHERE u.id = ?`,
            [id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Buyer user not found.' });
        }

        return res.status(200).json({ user: users[0] });
    } catch (error) {
        console.error('Get user by ID error:', error);
        return res.status(500).json({ error: 'Failed to fetch buyer user details.' });
    }
};

/**
 * Get all Orders placed by a specific Customer / Buyer
 * GET /api/users/:id/orders
 */
exports.getUserOrders = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch Buyer details
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Customer account not found.' });
        }

        const customer = users[0];

        // Fetch all Orders for this buyer with salesman info
        const [orders] = await pool.query(
            `SELECT 
                o.*,
                e.name AS salesman_name,
                e.staff_code AS salesman_code
             FROM orders o
             LEFT JOIN employees e ON o.salesman_id = e.id
             WHERE o.buyer_id = ?
             ORDER BY o.created_at DESC`,
            [id]
        );

        // For each order, fetch items count and details
        for (let order of orders) {
            const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
            order.items = items;
            order.item_count = items.reduce((sum, it) => sum + it.quantity, 0);
        }

        // Calculate summary stats for this customer
        const totalOrdersCount = orders.length;
        const totalSpent = orders.reduce((sum, o) => sum + parseFloat(o.grand_total), 0);
        const totalDiscountsReceived = orders.reduce((sum, o) => sum + parseFloat(o.total_discount), 0);

        return res.status(200).json({
            customer,
            summary: {
                total_orders: totalOrdersCount,
                total_spent: totalSpent,
                total_discounts_received: totalDiscountsReceived
            },
            orders
        });
    } catch (error) {
        console.error('Get user orders error:', error);
        return res.status(500).json({ error: 'Failed to fetch customer order history.' });
    }
};

/**
 * Create Buyer User (Both Salesman & Admin can create)
 * POST /api/users
 */
exports.createUser = async (req, res) => {
    try {
        const {
            user_code,
            name,
            email,
            phone,
            password,
            company_name,
            gstin,
            address,
            city,
            state,
            pincode,
            is_active = 1
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer Name is required.' });
        }

        if (!phone || !phone.trim()) {
            return res.status(400).json({ error: 'Customer Phone Number is required.' });
        }

        const trimmedPhone = phone.trim();
        const trimmedEmail = email && email.trim() ? email.trim().toLowerCase() : null;
        let customerCode = (user_code && user_code.trim()) ? user_code.trim().toUpperCase() : generateUserCode();

        // Check Phone uniqueness
        const [existingPhone] = await pool.query('SELECT id FROM users WHERE phone = ?', [trimmedPhone]);
        if (existingPhone.length > 0) {
            return res.status(409).json({ error: 'A buyer account with this phone number already exists.' });
        }

        // Check Email uniqueness if provided
        if (trimmedEmail) {
            const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
            if (existingEmail.length > 0) {
                return res.status(409).json({ error: 'A buyer account with this email address already exists.' });
            }
        }

        // Hash password if provided
        let hashedPassword = null;
        if (password && password.trim()) {
            hashedPassword = await argon2.hash(password.trim());
        }

        const creatorId = req.user ? req.user.id : null;

        const [result] = await pool.query(
            `INSERT INTO users (
                user_code, name, email, phone, password,
                company_name, gstin, address, city, state, pincode,
                created_by, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                customerCode,
                name.trim(),
                trimmedEmail,
                trimmedPhone,
                hashedPassword,
                company_name ? company_name.trim() : null,
                gstin ? gstin.trim().toUpperCase() : null,
                address ? address.trim() : null,
                city ? city.trim() : null,
                state ? state.trim() : null,
                pincode ? pincode.trim() : null,
                creatorId,
                is_active ? 1 : 0
            ]
        );

        const [newUser] = await pool.query(
            `SELECT u.*, e.name AS creator_name, e.staff_code AS creator_code
             FROM users u
             LEFT JOIN employees e ON u.created_by = e.id
             WHERE u.id = ?`,
            [result.insertId]
        );

        return res.status(201).json({
            message: 'Buyer account created successfully',
            user: newUser[0]
        });
    } catch (error) {
        console.error('Create buyer user error:', error);
        return res.status(500).json({ error: 'Failed to create buyer account.' });
    }
};

/**
 * Update Buyer User details
 * PUT /api/users/:id
 */
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Buyer user not found.' });
        }

        const current = existing[0];
        const {
            user_code = current.user_code,
            name = current.name,
            email = current.email,
            phone = current.phone,
            password,
            company_name = current.company_name,
            gstin = current.gstin,
            address = current.address,
            city = current.city,
            state = current.state,
            pincode = current.pincode,
            is_active = current.is_active
        } = req.body;

        const trimmedPhone = phone ? phone.trim() : current.phone;
        if (trimmedPhone !== current.phone) {
            const [phoneCheck] = await pool.query('SELECT id FROM users WHERE phone = ? AND id != ?', [trimmedPhone, id]);
            if (phoneCheck.length > 0) {
                return res.status(409).json({ error: 'Phone number is already in use by another buyer.' });
            }
        }

        const trimmedEmail = email ? email.trim().toLowerCase() : null;
        if (trimmedEmail && trimmedEmail !== current.email) {
            const [emailCheck] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [trimmedEmail, id]);
            if (emailCheck.length > 0) {
                return res.status(409).json({ error: 'Email address is already in use by another buyer.' });
            }
        }

        let hashedPassword = current.password;
        if (password && password.trim()) {
            hashedPassword = await argon2.hash(password.trim());
        }

        await pool.query(
            `UPDATE users SET
                user_code = ?, name = ?, email = ?, phone = ?, password = ?,
                company_name = ?, gstin = ?, address = ?, city = ?, state = ?, pincode = ?,
                is_active = ?
             WHERE id = ?`,
            [
                user_code ? user_code.trim().toUpperCase() : current.user_code,
                name.trim(),
                trimmedEmail,
                trimmedPhone,
                hashedPassword,
                company_name ? company_name.trim() : null,
                gstin ? gstin.trim().toUpperCase() : null,
                address ? address.trim() : null,
                city ? city.trim() : null,
                state ? state.trim() : null,
                pincode ? pincode.trim() : null,
                is_active ? 1 : 0,
                id
            ]
        );

        const [updatedUser] = await pool.query(
            `SELECT u.*, e.name AS creator_name, e.staff_code AS creator_code
             FROM users u
             LEFT JOIN employees e ON u.created_by = e.id
             WHERE u.id = ?`,
            [id]
        );

        return res.status(200).json({
            message: 'Buyer user updated successfully',
            user: updatedUser[0]
        });
    } catch (error) {
        console.error('Update user error:', error);
        return res.status(500).json({ error: 'Failed to update buyer user.' });
    }
};

/**
 * Toggle Buyer Active Status
 * PATCH /api/users/:id/status
 */
exports.toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT is_active FROM users WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Buyer user not found.' });
        }

        const newStatus = existing[0].is_active === 1 ? 0 : 1;
        await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);

        return res.status(200).json({
            message: `Buyer account ${newStatus === 1 ? 'activated' : 'deactivated'} successfully.`,
            is_active: newStatus
        });
    } catch (error) {
        console.error('Toggle user status error:', error);
        return res.status(500).json({ error: 'Failed to update buyer status.' });
    }
};
