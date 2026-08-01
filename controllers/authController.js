const argon2 = require('argon2');
const crypto = require('crypto');
const pool = require('../utils/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/tokens');

/**
 * 1. Signup Employee
 * POST /api/auth/signup
 */
exports.signup = async (req, res) => {
    try {
        const { staff_code, name, email, password, role = 'Salesman', phone } = req.body;

        if (!staff_code || !name || !email || !password) {
            return res.status(400).json({ error: 'staff_code, name, email, and password are required.' });
        }

        // Validate staff_code format (must be exactly 4 alphanumeric characters)
        const staffCodeRegex = /^[A-Za-z0-9]{4}$/;
        if (!staffCodeRegex.test(staff_code.trim())) {
            return res.status(400).json({ error: 'Staff Code must be exactly 4 alphanumeric characters (e.g. A001, S101).' });
        }

        const normalizedStaffCode = staff_code.trim().toUpperCase();

        // Check if email or staff_code already exists
        const [existing] = await pool.query(
            'SELECT id, email, staff_code FROM employees WHERE email = ? OR staff_code = ?',
            [email.toLowerCase().trim(), normalizedStaffCode]
        );

        if (existing.length > 0) {
            if (existing.some(e => e.email.toLowerCase() === email.toLowerCase().trim())) {
                return res.status(409).json({ error: 'An employee with this email already exists.' });
            }
            if (existing.some(e => e.staff_code === normalizedStaffCode)) {
                return res.status(409).json({ error: 'An employee with this Staff Code already exists.' });
            }
        }

        // Hash password
        const hashedPassword = await argon2.hash(password);

        // Insert new employee
        const [result] = await pool.query(
            `INSERT INTO employees (staff_code, name, email, password, role, phone, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [normalizedStaffCode, name.trim(), email.toLowerCase().trim(), hashedPassword, role, phone || null]
        );

        const newEmployeeId = result.insertId;

        const user = {
            id: newEmployeeId,
            staff_code: normalizedStaffCode,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            role,
            phone: phone || null,
            is_active: 1
        };

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        return res.status(201).json({
            message: 'Employee created successfully',
            accessToken,
            refreshToken,
            user
        });
    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Internal server error during signup.' });
    }
};

/**
 * 2. Login Employee
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
    try {
        const { identifier, email, staff_code, password } = req.body;
        const loginId = (identifier || email || staff_code || '').trim();

        if (!loginId || !password) {
            return res.status(400).json({ error: 'Please provide email or staff code and password.' });
        }

        // Search by email OR staff_code
        const [rows] = await pool.query(
            `SELECT id, staff_code, name, email, password, role, phone, is_active 
             FROM employees 
             WHERE email = ? OR staff_code = ?`,
            [loginId.toLowerCase(), loginId.toUpperCase()]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const employee = rows[0];

        if (!employee.is_active) {
            return res.status(403).json({ error: 'Account is deactivated. Please contact administrator.' });
        }

        // Verify password using Argon2
        const isPasswordValid = await argon2.verify(employee.password, password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = {
            id: employee.id,
            staff_code: employee.staff_code,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            phone: employee.phone,
            is_active: employee.is_active
        };

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        return res.status(200).json({
            message: 'Login successful',
            accessToken,
            refreshToken,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error during login.' });
    }
};

/**
 * 3. Refresh Endpoint
 * POST /api/auth/refresh
 */
exports.refresh = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required.' });
        }

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired refresh token.' });
        }

        // Fetch current user details
        const [rows] = await pool.query(
            'SELECT id, staff_code, name, email, role, phone, is_active FROM employees WHERE id = ?',
            [decoded.id]
        );

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(401).json({ error: 'User is inactive or no longer exists.' });
        }

        const user = rows[0];
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        return res.status(200).json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        return res.status(500).json({ error: 'Failed to refresh token.' });
    }
};

/**
 * 4. Auth Me Endpoint
 * GET /api/auth/me
 */
exports.authMe = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthenticated' });
        }
        return res.status(200).json({ user: req.user });
    } catch (error) {
        console.error('Auth Me error:', error);
        return res.status(500).json({ error: 'Failed to retrieve current user info.' });
    }
};

/**
 * 5. Forgot Password via token link - Request Reset Token
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email address is required.' });
        }

        const [rows] = await pool.query(
            'SELECT id, email, name FROM employees WHERE email = ?',
            [email.toLowerCase().trim()]
        );

        if (rows.length === 0) {
            // For security reasons, still respond with generic message
            return res.status(200).json({
                message: 'If the email exists in our system, a password reset token link has been created.'
            });
        }

        const employee = rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour expiration

        await pool.query(
            'UPDATE employees SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
            [token, expiresAt, employee.id]
        );

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

        return res.status(200).json({
            message: 'Password reset link generated successfully.',
            resetUrl,
            token
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ error: 'Internal server error processing forgot password.' });
    }
};

/**
 * Reset Password with token
 * POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Reset token and new password are required.' });
        }

        const [rows] = await pool.query(
            'SELECT id, email FROM employees WHERE reset_token = ? AND reset_token_expires > NOW()',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired password reset token.' });
        }

        const employee = rows[0];
        const hashedPassword = await argon2.hash(newPassword);

        await pool.query(
            'UPDATE employees SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
            [hashedPassword, employee.id]
        );

        return res.status(200).json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ error: 'Failed to reset password.' });
    }
};
