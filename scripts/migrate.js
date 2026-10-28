const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../utils/db');

async function runMigration() {
    console.log('====================================================');
    console.log('🚀 Starting Database Migration: Orders Table Schema');
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

        // Helper to check if a column exists
        async function columnExists(columnName) {
            const [cols] = await connection.query(`
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?
            `, [process.env.DB_NAME || 'chachaji-brand', columnName]);
            return cols.length > 0;
        }

        // Helper to safely add column without failing if AFTER column is missing
        async function addColumnIfMissing(columnName, columnDefinition) {
            if (!(await columnExists(columnName))) {
                await connection.query(`ALTER TABLE orders ADD COLUMN ${columnName} ${columnDefinition}`);
                console.log(`✅ Added column: orders.${columnName} (${columnDefinition})`);
            } else {
                console.log(`ℹ️  Column already exists: orders.${columnName}`);
            }
        }

        // 2. Ensure all columns exist (No strict AFTER clauses to avoid ER_BAD_FIELD_ERROR)
        await addColumnIfMissing('paid_amount', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
        await addColumnIfMissing('pending_balance', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
        await addColumnIfMissing('received_amount', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
        await addColumnIfMissing('return_amount', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
        await addColumnIfMissing('split_payments', 'JSON DEFAULT NULL');
        await addColumnIfMissing('split_returns', 'JSON DEFAULT NULL');
        await addColumnIfMissing('vehicle_number', 'VARCHAR(100) DEFAULT NULL');
        await addColumnIfMissing('driver_name', 'VARCHAR(255) DEFAULT NULL');

        // 3. Expand payment_method column from ENUM to VARCHAR(100)
        try {
            await connection.query(`
                ALTER TABLE orders 
                MODIFY COLUMN payment_method VARCHAR(100) NOT NULL DEFAULT 'Cash'
            `);
            console.log('✅ Modified column: orders.payment_method to VARCHAR(100)');
        } catch (err) {
            console.warn('⚠️  Could not modify orders.payment_method:', err.message);
        }

        // 4. Backfill existing orders with correct defaults
        console.log('\n🔄 Backfilling existing records...');

        // If paid_amount is 0 but payment_status was 'Paid', set paid_amount = grand_total
        await connection.query(`
            UPDATE orders 
            SET paid_amount = grand_total 
            WHERE (paid_amount = 0 OR paid_amount IS NULL) 
              AND (payment_status = 'Paid' OR payment_status IS NULL)
              AND payment_method != 'Credit'
        `);

        // Recalculate pending_balance
        await connection.query(`
            UPDATE orders 
            SET pending_balance = GREATEST(0, grand_total - paid_amount) 
            WHERE pending_balance = 0 AND paid_amount < grand_total
        `);

        // Backfill received_amount = paid_amount if unset
        const [updateRes] = await connection.query(`
            UPDATE orders 
            SET received_amount = paid_amount 
            WHERE (received_amount = 0 OR received_amount IS NULL) AND paid_amount > 0
        `);
        console.log(`✅ Backfilled existing orders: ${updateRes.affectedRows} row(s) updated.`);

        // 5. Display current columns of `orders` table
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
