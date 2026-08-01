const pool = require('../utils/db');

/**
 * Generate and Send OTP to mobile number
 * POST /api/otp/send
 */
exports.sendOtp = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone || !phone.trim()) {
            return res.status(400).json({ error: 'Phone number is required.' });
        }

        const cleanPhone = phone.trim();
        // Generate 6-digit OTP (e.g., 123456 or random 6 digits)
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration

        await pool.query(
            `REPLACE INTO otp_verifications (phone, otp_code, expires_at)
             VALUES (?, ?, ?)`,
            [cleanPhone, otpCode, expiresAt]
        );

        console.log(`[OTP] Generated for ${cleanPhone}: ${otpCode}`);

        return res.status(200).json({
            message: `OTP sent successfully to ${cleanPhone}.`,
            phone: cleanPhone,
            otp_code: otpCode // Returned for dev simulation & testing ease
        });
    } catch (error) {
        console.error('Send OTP error:', error);
        return res.status(500).json({ error: 'Failed to send OTP.' });
    }
};

/**
 * Verify submitted OTP
 * POST /api/otp/verify
 */
exports.verifyOtp = async (req, res) => {
    try {
        const { phone, otp_code } = req.body;

        if (!phone || !otp_code) {
            return res.status(400).json({ error: 'Phone number and OTP code are required.' });
        }

        const cleanPhone = phone.trim();
        const cleanOtp = otp_code.trim();

        const [rows] = await pool.query(
            'SELECT * FROM otp_verifications WHERE phone = ? AND otp_code = ? AND expires_at > NOW()',
            [cleanPhone, cleanOtp]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired OTP code.' });
        }

        // Clean up OTP record after successful verification
        await pool.query('DELETE FROM otp_verifications WHERE phone = ?', [cleanPhone]);

        return res.status(200).json({
            message: 'OTP verified successfully.',
            verified: true,
            phone: cleanPhone
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        return res.status(500).json({ error: 'Failed to verify OTP.' });
    }
};
