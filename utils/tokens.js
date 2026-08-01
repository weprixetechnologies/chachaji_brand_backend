const jwt = require('jsonwebtoken');

/**
 * Generate Access Token (short-lived)
 */
function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            staff_code: user.staff_code,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
}

/**
 * Generate Refresh Token (longer-lived)
 */
function generateRefreshToken(user) {
    return jwt.sign(
        {
            id: user.id
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
}

/**
 * Verify Refresh Token
 */
function verifyRefreshToken(token) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
};
