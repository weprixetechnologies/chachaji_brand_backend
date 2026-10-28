const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../utils/db');

async function runMigration() {
    console.log('====================================================');
    console.log('🚀 Starting Database Migration: Split Payments & Returns');
    console.log(`📡 Connecting to: ${process.env.DB_HOST || 'localhost'} / ${process.env.DB_NAME || 'chachaji-brand'}`);
    console.log('====================================================\n');

    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Verify `orders` table exists
        const [tableCheck] = await connection.query(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
        `, [process.env.DB_NAME || 'chachaji-brand']);

        if (tableCheck.length === 0) {
            console.error('❌ Table "orders" not found in the database. Please initialize the base schema first.');
            process.exit(1);
        }

        // Helper to check if column exists
        async function columnExists(columnName) {
            const [cols] = await connection.query(`
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?
            `, [process.env.DB_NAME || 'chachaji-brand', columnName]);
            return cols.length > 0;
        }

        // 2. Add received_amount column
        if (!(await columnExists('received_amount'))) {
            await connection.query(`
                ALTER TABLE orders 
                ADD COLUMN received_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER pending_balance
            `);
            console.log('✅ Added column: orders.received_amount (DECIMAL(10, 2))');
        } else {
            console.log('ℹ️  Column already exists: orders.received_amount');
        }

        // 3. Add return_amount column
        if (!(await columnExists('return_amount'))) {
            await connection.query(`
                ALTER TABLE orders 
                ADD COLUMN return_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER received_amount
            `);
            console.log('✅ Added column: orders.return_amount (DECIMAL(10, 2))');
        } else {
            console.log('ℹ️  Column already exists: orders.return_amount');
        }

        // 4. Add split_payments column
        if (!(await columnExists('split_payments'))) {
            await connection.query(`
                ALTER TABLE orders 
                ADD COLUMN split_payments JSON DEFAULT NULL AFTER payment_status
            `);
            console.log('✅ Added column: orders.split_payments (JSON)');
        } else {
            console.log('ℹ️  Column already exists: orders.split_payments');
        }

        // 5. Add split_returns column
        if (!(await columnExists('split_returns'))) {
            await connection.query(`
                ALTER TABLE orders 
                ADD COLUMN split_returns JSON DEFAULT NULL AFTER split_payments
            `);
            console.log('✅ Added column: orders.split_returns (JSON)');
        } else {
            console.log('ℹ️  Column already exists: orders.split_returns');
        }

        // 6. Expand payment_method column from ENUM to VARCHAR(100)
        try {
            await connection.query(`
                ALTER TABLE orders 
                MODIFY COLUMN payment_method VARCHAR(100) NOT NULL DEFAULT 'Cash'
            `);
            console.log('✅ Updated column: orders.payment_method to VARCHAR(100)');
        } catch (err) {
            console.warn('⚠️  Could not modify orders.payment_method:', err.message);
        }

        // 7. Backfill existing orders: if received_amount is 0 and paid_amount > 0, set received_amount = paid_amount
        const [updateRes] = await connection.query(`
            UPDATE orders 
            SET received_amount = paid_amount 
            WHERE (received_amount = 0 OR received_amount IS NULL) AND paid_amount > 0
        `);
        console.log(`✅ Backfilled existing orders: ${updateRes.affectedRows} row(s) updated.`);

        // 8. Display current columns of `orders` table
        console.log('\n📋 Current columns in "orders" table:');
        const [allCols] = await connection.query(`
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
            ORDER BY ORDINAL_POSITION
        `, [process.env.DB_NAME || 'chachaji-brand']);

        console.table(allCols.map(c => ({
            Column: c.COLUMN_NAME,
            Type: c.COLUMN_TYPE,
            Nullable: c.IS_NULLABLE,
            Default: c.COLUMN_DEFAULT
        })));

        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}

runMigration();
