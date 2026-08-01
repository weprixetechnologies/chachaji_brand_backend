const mysql = require('mysql2/promise');
const argon2 = require('argon2');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create initial pool without database specified to ensure DB creation can happen
const pool = mysql.createPool({
    ...dbConfig,
    database: process.env.DB_NAME || 'chachaji-brand'
});

/**
 * Initialize Database, Tables, and Seed Data
 */
async function initDb() {
    let rawConnection;
    try {
        // Connect to MySQL server to check/create database
        rawConnection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        const dbName = process.env.DB_NAME || 'chachaji-brand';
        await rawConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
        console.log(`[DB] Database "${dbName}" checked/created.`);
        await rawConnection.end();

        // 1. Ensure employees table exists
        const createEmployeesTable = `
            CREATE TABLE IF NOT EXISTS employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                staff_code VARCHAR(10) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('Admin', 'Salesman') NOT NULL DEFAULT 'Salesman',
                phone VARCHAR(50) DEFAULT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                reset_token VARCHAR(255) DEFAULT NULL,
                reset_token_expires DATETIME DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createEmployeesTable);

        // Seed default admin if no employees exist
        const [empRows] = await pool.query('SELECT COUNT(*) AS count FROM employees');
        if (empRows[0].count === 0) {
            const hashedPassword = await argon2.hash('admin123');
            await pool.query(
                `INSERT INTO employees (staff_code, name, email, password, role, phone, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['A001', 'System Admin', 'admin@chachaji.com', hashedPassword, 'Admin', '9876543210', 1]
            );
            console.log('[DB] Default Admin created: admin@chachaji.com / admin123 (Staff Code: A001)');
        }

        // 2. Ensure categories table exists
        const createCategoriesTable = `
            CREATE TABLE IF NOT EXISTS categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                parent_id INT DEFAULT NULL,
                description TEXT DEFAULT NULL,
                image_url VARCHAR(500) DEFAULT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createCategoriesTable);

        // Seed initial categories if table is empty
        const [catRows] = await pool.query('SELECT COUNT(*) AS count FROM categories');
        if (catRows[0].count === 0) {
            await pool.query(`
                INSERT INTO categories (name, slug, description, is_active) VALUES
                ('Snacks & Namkeen', 'snacks-namkeen', 'Crispy traditional namkeen, bhujia & snacks', 1),
                ('Sweets & Mithai', 'sweets-mithai', 'Delicious authentic Indian sweets & mithai', 1),
                ('Spices & Masalas', 'spices-masalas', 'Pure aromatic ground spices and blends', 1),
                ('Beverages & Drinks', 'beverages-drinks', 'Refreshing traditional drinks & syrups', 1)
            `);
            console.log('[DB] Default Categories seeded.');
        }

        // 3. Ensure products table exists
        const createProductsTable = `
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type ENUM('SIMPLE', 'VARIABLE') NOT NULL DEFAULT 'SIMPLE',
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                sku VARCHAR(100) NOT NULL UNIQUE,
                category_id INT DEFAULT NULL,
                brand VARCHAR(100) DEFAULT 'Chachaji',
                unit VARCHAR(50) DEFAULT 'pcs',
                short_description TEXT DEFAULT NULL,
                description LONGTEXT DEFAULT NULL,
                primary_image VARCHAR(500) DEFAULT NULL,
                gallery_images JSON DEFAULT NULL,
                regular_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                sale_price DECIMAL(10, 2) DEFAULT NULL,
                cost_price DECIMAL(10, 2) DEFAULT NULL,
                tax_rate DECIMAL(5, 2) DEFAULT 0.00,
                hsn_code VARCHAR(50) DEFAULT NULL,
                manage_stock TINYINT(1) NOT NULL DEFAULT 1,
                stock_quantity INT NOT NULL DEFAULT 0,
                low_stock_threshold INT NOT NULL DEFAULT 5,
                stock_status ENUM('in_stock', 'out_of_stock', 'on_backorder') NOT NULL DEFAULT 'in_stock',
                attributes JSON DEFAULT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createProductsTable);

        // 4. Ensure product_variations table exists
        const createVariationsTable = `
            CREATE TABLE IF NOT EXISTS product_variations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                sku VARCHAR(100) NOT NULL UNIQUE,
                attributes JSON NOT NULL,
                regular_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                sale_price DECIMAL(10, 2) DEFAULT NULL,
                cost_price DECIMAL(10, 2) DEFAULT NULL,
                stock_quantity INT NOT NULL DEFAULT 0,
                low_stock_threshold INT NOT NULL DEFAULT 5,
                stock_status ENUM('in_stock', 'out_of_stock', 'on_backorder') NOT NULL DEFAULT 'in_stock',
                image_url VARCHAR(500) DEFAULT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createVariationsTable);

        // 5. Ensure users (Buyers) table exists
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_code VARCHAR(20) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) DEFAULT NULL,
                phone VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) DEFAULT NULL,
                company_name VARCHAR(255) DEFAULT NULL,
                gstin VARCHAR(50) DEFAULT NULL,
                address TEXT DEFAULT NULL,
                city VARCHAR(100) DEFAULT NULL,
                state VARCHAR(100) DEFAULT NULL,
                pincode VARCHAR(20) DEFAULT NULL,
                created_by INT DEFAULT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createUsersTable);

        // 6. Ensure orders table exists
        const createOrdersTable = `
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_number VARCHAR(50) NOT NULL UNIQUE,
                salesman_id INT NOT NULL,
                buyer_id INT NOT NULL,
                subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                total_discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                grand_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                payment_method ENUM('Cash', 'UPI', 'Credit', 'BankTransfer') NOT NULL DEFAULT 'Cash',
                payment_status ENUM('Pending', 'Paid', 'Partial') NOT NULL DEFAULT 'Paid',
                order_status ENUM('Confirmed', 'Processing', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Confirmed',
                notes TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (salesman_id) REFERENCES employees(id),
                FOREIGN KEY (buyer_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createOrdersTable);

        // 7. Ensure order_items table exists
        const createOrderItemsTable = `
            CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                variation_id INT DEFAULT NULL,
                product_name VARCHAR(255) NOT NULL,
                sku VARCHAR(100) NOT NULL,
                unit_price DECIMAL(10, 2) NOT NULL,
                discount_type ENUM('fixed', 'percentage') NOT NULL DEFAULT 'fixed',
                discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                discounted_price DECIMAL(10, 2) NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                total_price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createOrderItemsTable);

        // 8. Ensure otp_verifications table exists
        const createOtpTable = `
            CREATE TABLE IF NOT EXISTS otp_verifications (
                phone VARCHAR(50) PRIMARY KEY,
                otp_code VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await pool.query(createOtpTable);
        console.log('[DB] Tables "orders", "order_items", & "otp_verifications" checked/created.');

    } catch (error) {
        console.error('[DB Error] Initialization failed:', error);
        if (rawConnection) await rawConnection.end().catch(() => {});
    }
}

module.exports = pool;
module.exports.initDb = initDb;