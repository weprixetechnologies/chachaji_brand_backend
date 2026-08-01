const jwt = require('jsonwebtoken');
const pool = require('../utils/db');

/**
 * Middleware to verify access token and attach decoded user to req.user
 */
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required. Missing token.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch fresh user info to verify active status
        const [rows] = await pool.query(
            'SELECT id, staff_code, name, email, role, phone, is_active FROM employees WHERE id = ?',
            [decoded.id]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'User no longer exists.' });
        }

        const user = rows[0];
        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated. Contact admin.' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired.', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid authentication token.' });
    }
};

/**
 * Middleware to restrict route access based on user role
 * @param  {...string} roles Allowed roles (e.g. 'Admin', 'Salesman')
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Requires one of the following roles: ${roles.join(', ')}`
            });
        }

        next();
    };
};

module.exports = {
    requireAuth,
    requireRole
};
