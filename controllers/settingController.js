const pool = require('../utils/db');

/**
 * Ensure settings table exists and default rows are seeded
 */
async function ensureSettingsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                \`key\` VARCHAR(100) PRIMARY KEY,
                \`value\` TEXT NOT NULL,
                \`description\` VARCHAR(255) DEFAULT NULL,
                \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await pool.query(`
            INSERT IGNORE INTO settings (\`key\`, \`value\`, \`description\`)
            VALUES ('otp_enabled', 'true', 'Require OTP verification for new customer creation in POS');
        `);
    } catch (err) {
        console.error('[Settings] Error ensuring table:', err);
    }
}

/**
 * Helper to check whether OTP is enabled in system settings
 */
exports.isOtpEnabled = async () => {
    try {
        await ensureSettingsTable();
        const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key` = "otp_enabled" LIMIT 1');
        if (rows.length === 0) return true;
        return rows[0].value === 'true' || rows[0].value === '1';
    } catch (err) {
        console.error('[Settings] Error checking isOtpEnabled:', err);
        return true; // Default fallback: true
    }
};

/**
 * Get all system settings
 * GET /api/settings
 */
exports.getSettings = async (req, res) => {
    try {
        await ensureSettingsTable();

        const [rows] = await pool.query('SELECT `key`, `value`, `description`, `updated_at` FROM settings');

        const settingsMap = {};
        rows.forEach((r) => {
            if (r.value === 'true' || r.value === '1') {
                settingsMap[r.key] = true;
            } else if (r.value === 'false' || r.value === '0') {
                settingsMap[r.key] = false;
            } else {
                settingsMap[r.key] = r.value;
            }
        });

        // Ensure otp_enabled has default value if not yet set
        if (settingsMap.otp_enabled === undefined) {
            settingsMap.otp_enabled = true;
        }

        return res.status(200).json({ settings: settingsMap });
    } catch (error) {
        console.error('Get settings error:', error);
        return res.status(500).json({ error: 'Failed to retrieve system settings.' });
    }
};

/**
 * Update system settings
 * PUT /api/settings
 */
exports.updateSettings = async (req, res) => {
    try {
        await ensureSettingsTable();

        const updates = req.body;
        if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Settings payload is required.' });
        }

        for (const [key, val] of Object.entries(updates)) {
            let strVal;
            if (typeof val === 'boolean') {
                strVal = val ? 'true' : 'false';
            } else {
                strVal = String(val);
            }

            await pool.query(
                `INSERT INTO settings (\`key\`, \`value\`)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
                [key, strVal]
            );
        }

        // Return refreshed settings
        const [rows] = await pool.query('SELECT `key`, `value`, `description`, `updated_at` FROM settings');
        const settingsMap = {};
        rows.forEach((r) => {
            if (r.value === 'true' || r.value === '1') {
                settingsMap[r.key] = true;
            } else if (r.value === 'false' || r.value === '0') {
                settingsMap[r.key] = false;
            } else {
                settingsMap[r.key] = r.value;
            }
        });

        return res.status(200).json({
            message: 'Settings updated successfully.',
            settings: settingsMap
        });
    } catch (error) {
        console.error('Update settings error:', error);
        return res.status(500).json({ error: 'Failed to update system settings.' });
    }
};
