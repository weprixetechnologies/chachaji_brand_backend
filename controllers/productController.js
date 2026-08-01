const pool = require('../utils/db');

// Helper to generate URL slug
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[\s\W-]+/g, '-');
}

/**
 * Get list of products with filters, category join, & variations attached
 * GET /api/products
 */
exports.getAllProducts = async (req, res) => {
    try {
        const { search, category_id, type, stock_status, status } = req.query;

        let query = `
            SELECT 
                p.id, 
                p.type, 
                p.name, 
                p.slug, 
                p.sku, 
                p.category_id, 
                p.brand, 
                p.unit, 
                p.short_description, 
                p.primary_image, 
                p.gallery_images, 
                p.regular_price, 
                p.sale_price, 
                p.cost_price, 
                p.tax_rate, 
                p.hsn_code, 
                p.manage_stock, 
                p.stock_quantity, 
                p.low_stock_threshold, 
                p.stock_status, 
                p.attributes, 
                p.is_active, 
                p.created_at, 
                p.updated_at,
                c.name AS category_name,
                COUNT(v.id) AS variation_count,
                MIN(v.regular_price) AS min_var_price,
                MAX(v.regular_price) AS max_var_price
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_variations v ON p.id = v.product_id AND v.is_active = 1
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)`;
            const pattern = `%${search.trim()}%`;
            params.push(pattern, pattern, pattern, pattern);
        }

        if (category_id) {
            query += ` AND p.category_id = ?`;
            params.push(category_id);
        }

        if (type) {
            query += ` AND p.type = ?`;
            params.push(type.toUpperCase());
        }

        if (stock_status) {
            if (stock_status === 'low_stock') {
                query += ` AND p.manage_stock = 1 AND p.stock_quantity <= p.low_stock_threshold AND p.stock_quantity > 0`;
            } else {
                query += ` AND p.stock_status = ?`;
                params.push(stock_status);
            }
        }

        if (status !== undefined && status !== '') {
            query += ` AND p.is_active = ?`;
            params.push(status === 'active' || status === '1' ? 1 : 0);
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC`;

        const [products] = await pool.query(query, params);

        // Fetch all variations for VARIABLE products
        const variableProdIds = products.filter((p) => p.type === 'VARIABLE').map((p) => p.id);
        let variationsMap = {};

        if (variableProdIds.length > 0) {
            const placeholders = variableProdIds.map(() => '?').join(',');
            const [allVariations] = await pool.query(
                `SELECT * FROM product_variations WHERE product_id IN (${placeholders}) AND is_active = 1 ORDER BY id ASC`,
                variableProdIds
            );

            allVariations.forEach((v) => {
                const parsedAttr = typeof v.attributes === 'string' ? JSON.parse(v.attributes) : (v.attributes || {});
                if (!variationsMap[v.product_id]) variationsMap[v.product_id] = [];
                variationsMap[v.product_id].push({
                    ...v,
                    attributes: parsedAttr
                });
            });
        }

        // Parse JSON fields and attach variations
        const formatted = products.map((p) => ({
            ...p,
            gallery_images: typeof p.gallery_images === 'string' ? JSON.parse(p.gallery_images) : (p.gallery_images || []),
            attributes: typeof p.attributes === 'string' ? JSON.parse(p.attributes) : (p.attributes || []),
            variations: variationsMap[p.id] || []
        }));

        return res.status(200).json({ products: formatted });
    } catch (error) {
        console.error('Get products error:', error);
        return res.status(500).json({ error: 'Failed to fetch products.' });
    }
};

/**
 * Get product by ID with full variations details
 * GET /api/products/:id
 */
exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        const [products] = await pool.query(
            `SELECT p.*, c.name AS category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ?`,
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const product = products[0];
        product.gallery_images = typeof product.gallery_images === 'string' ? JSON.parse(product.gallery_images) : (product.gallery_images || []);
        product.attributes = typeof product.attributes === 'string' ? JSON.parse(product.attributes) : (product.attributes || []);

        let variations = [];
        if (product.type === 'VARIABLE') {
            const [varRows] = await pool.query(
                'SELECT * FROM product_variations WHERE product_id = ? ORDER BY id ASC',
                [id]
            );
            variations = varRows.map((v) => ({
                ...v,
                attributes: typeof v.attributes === 'string' ? JSON.parse(v.attributes) : (v.attributes || {})
            }));
        }

        return res.status(200).json({
            product: {
                ...product,
                variations
            }
        });
    } catch (error) {
        console.error('Get product by ID error:', error);
        return res.status(500).json({ error: 'Failed to fetch product details.' });
    }
};

/**
 * Create Product (SIMPLE or VARIABLE)
 * POST /api/products
 */
exports.createProduct = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            type = 'SIMPLE',
            name,
            slug,
            sku,
            category_id,
            brand = 'Chachaji',
            unit = 'pcs',
            short_description,
            description,
            primary_image,
            gallery_images = [],
            regular_price = 0,
            sale_price = null,
            cost_price = null,
            tax_rate = 0,
            hsn_code,
            manage_stock = 1,
            stock_quantity = 0,
            low_stock_threshold = 5,
            stock_status = 'in_stock',
            attributes = [],
            variations = [],
            is_active = 1
        } = req.body;

        if (!name || !name.trim()) {
            await connection.rollback();
            return res.status(400).json({ error: 'Product Name is required.' });
        }

        if (!sku || !sku.trim()) {
            await connection.rollback();
            return res.status(400).json({ error: 'Product SKU is required.' });
        }

        const productSlug = slug && slug.trim() ? slugify(slug) : slugify(name);
        const productSku = sku.trim().toUpperCase();

        // Validate SKU & Slug uniqueness
        const [existingSku] = await connection.query('SELECT id FROM products WHERE sku = ?', [productSku]);
        if (existingSku.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'A product with this SKU already exists.' });
        }

        const [existingSlug] = await connection.query('SELECT id FROM products WHERE slug = ?', [productSlug]);
        if (existingSlug.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'A product with this URL slug already exists.' });
        }

        // Calculate total stock and determine stock status
        let calculatedStock = parseInt(stock_quantity, 10) || 0;
        let calculatedStatus = stock_status;

        if (type === 'VARIABLE' && Array.isArray(variations) && variations.length > 0) {
            calculatedStock = variations.reduce((sum, v) => sum + (parseInt(v.stock_quantity, 10) || 0), 0);
        }

        if (manage_stock) {
            if (calculatedStock <= 0) calculatedStatus = 'out_of_stock';
            else calculatedStatus = 'in_stock';
        }

        const [prodResult] = await connection.query(
            `INSERT INTO products (
                type, name, slug, sku, category_id, brand, unit,
                short_description, description, primary_image, gallery_images,
                regular_price, sale_price, cost_price, tax_rate, hsn_code,
                manage_stock, stock_quantity, low_stock_threshold, stock_status,
                attributes, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                type.toUpperCase(),
                name.trim(),
                productSlug,
                productSku,
                category_id ? parseInt(category_id, 10) : null,
                brand ? brand.trim() : 'Chachaji',
                unit || 'pcs',
                short_description || null,
                description || null,
                primary_image || null,
                JSON.stringify(gallery_images),
                parseFloat(regular_price) || 0,
                sale_price ? parseFloat(sale_price) : null,
                cost_price ? parseFloat(cost_price) : null,
                parseFloat(tax_rate) || 0,
                hsn_code || null,
                manage_stock ? 1 : 0,
                calculatedStock,
                parseInt(low_stock_threshold, 10) || 5,
                calculatedStatus,
                JSON.stringify(attributes),
                is_active ? 1 : 0
            ]
        );

        const productId = prodResult.insertId;

        // Insert Variations if VARIABLE
        if (type === 'VARIABLE' && Array.isArray(variations) && variations.length > 0) {
            for (const v of variations) {
                const varSku = (v.sku || `${productSku}-${Math.random().toString(36).substr(2, 4)}`).toUpperCase();
                const varStock = parseInt(v.stock_quantity, 10) || 0;
                let varStatus = v.stock_status || 'in_stock';
                if (varStock <= 0) varStatus = 'out_of_stock';

                await connection.query(
                    `INSERT INTO product_variations (
                        product_id, sku, attributes, regular_price, sale_price, cost_price,
                        stock_quantity, low_stock_threshold, stock_status, image_url, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        productId,
                        varSku,
                        JSON.stringify(v.attributes || {}),
                        parseFloat(v.regular_price) || 0,
                        v.sale_price ? parseFloat(v.sale_price) : null,
                        v.cost_price ? parseFloat(v.cost_price) : null,
                        varStock,
                        parseInt(v.low_stock_threshold, 10) || 5,
                        varStatus,
                        v.image_url || null,
                        v.is_active !== undefined ? (v.is_active ? 1 : 0) : 1
                    ]
                );
            }
        }

        await connection.commit();

        return res.status(201).json({
            message: 'Product created successfully',
            productId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create product error:', error);
        return res.status(500).json({ error: 'Failed to create product.' });
    } finally {
        connection.release();
    }
};

/**
 * Update Product & Variations
 * PUT /api/products/:id
 */
exports.updateProduct = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        await connection.beginTransaction();

        const [existing] = await connection.query('SELECT * FROM products WHERE id = ?', [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Product not found.' });
        }

        const current = existing[0];
        const {
            type = current.type,
            name = current.name,
            slug = current.slug,
            sku = current.sku,
            category_id = current.category_id,
            brand = current.brand,
            unit = current.unit,
            short_description = current.short_description,
            description = current.description,
            primary_image = current.primary_image,
            gallery_images = current.gallery_images,
            regular_price = current.regular_price,
            sale_price = current.sale_price,
            cost_price = current.cost_price,
            tax_rate = current.tax_rate,
            hsn_code = current.hsn_code,
            manage_stock = current.manage_stock,
            stock_quantity = current.stock_quantity,
            low_stock_threshold = current.low_stock_threshold,
            stock_status = current.stock_status,
            attributes = current.attributes,
            variations = [],
            is_active = current.is_active
        } = req.body;

        const updatedSku = sku.trim().toUpperCase();
        if (updatedSku !== current.sku) {
            const [skuCheck] = await connection.query('SELECT id FROM products WHERE sku = ? AND id != ?', [updatedSku, id]);
            if (skuCheck.length > 0) {
                await connection.rollback();
                return res.status(409).json({ error: 'SKU is already in use by another product.' });
            }
        }

        const updatedSlug = slugify(slug || name);
        if (updatedSlug !== current.slug) {
            const [slugCheck] = await connection.query('SELECT id FROM products WHERE slug = ? AND id != ?', [updatedSlug, id]);
            if (slugCheck.length > 0) {
                await connection.rollback();
                return res.status(409).json({ error: 'URL slug is already in use by another product.' });
            }
        }

        let calculatedStock = parseInt(stock_quantity, 10) || 0;
        if (type === 'VARIABLE' && Array.isArray(variations) && variations.length > 0) {
            calculatedStock = variations.reduce((sum, v) => sum + (parseInt(v.stock_quantity, 10) || 0), 0);
        }

        let calculatedStatus = stock_status;
        if (manage_stock) {
            if (calculatedStock <= 0) calculatedStatus = 'out_of_stock';
            else calculatedStatus = 'in_stock';
        }

        await connection.query(
            `UPDATE products SET
                type = ?, name = ?, slug = ?, sku = ?, category_id = ?, brand = ?, unit = ?,
                short_description = ?, description = ?, primary_image = ?, gallery_images = ?,
                regular_price = ?, sale_price = ?, cost_price = ?, tax_rate = ?, hsn_code = ?,
                manage_stock = ?, stock_quantity = ?, low_stock_threshold = ?, stock_status = ?,
                attributes = ?, is_active = ?
             WHERE id = ?`,
            [
                type.toUpperCase(),
                name.trim(),
                updatedSlug,
                updatedSku,
                category_id ? parseInt(category_id, 10) : null,
                brand || 'Chachaji',
                unit || 'pcs',
                short_description || null,
                description || null,
                primary_image || null,
                JSON.stringify(gallery_images),
                parseFloat(regular_price) || 0,
                sale_price ? parseFloat(sale_price) : null,
                cost_price ? parseFloat(cost_price) : null,
                parseFloat(tax_rate) || 0,
                hsn_code || null,
                manage_stock ? 1 : 0,
                calculatedStock,
                parseInt(low_stock_threshold, 10) || 5,
                calculatedStatus,
                JSON.stringify(attributes),
                is_active ? 1 : 0,
                id
            ]
        );

        // Sync Variations if VARIABLE type
        if (type === 'VARIABLE' && Array.isArray(variations)) {
            // Delete old variations
            await connection.query('DELETE FROM product_variations WHERE product_id = ?', [id]);

            for (const v of variations) {
                const varSku = (v.sku || `${updatedSku}-${Math.random().toString(36).substr(2, 4)}`).toUpperCase();
                const varStock = parseInt(v.stock_quantity, 10) || 0;
                let varStatus = v.stock_status || 'in_stock';
                if (varStock <= 0) varStatus = 'out_of_stock';

                await connection.query(
                    `INSERT INTO product_variations (
                        product_id, sku, attributes, regular_price, sale_price, cost_price,
                        stock_quantity, low_stock_threshold, stock_status, image_url, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        varSku,
                        JSON.stringify(v.attributes || {}),
                        parseFloat(v.regular_price) || 0,
                        v.sale_price ? parseFloat(v.sale_price) : null,
                        v.cost_price ? parseFloat(v.cost_price) : null,
                        varStock,
                        parseInt(v.low_stock_threshold, 10) || 5,
                        varStatus,
                        v.image_url || null,
                        v.is_active !== undefined ? (v.is_active ? 1 : 0) : 1
                    ]
                );
            }
        }

        await connection.commit();

        return res.status(200).json({ message: 'Product updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Update product error:', error);
        return res.status(500).json({ error: 'Failed to update product.' });
    } finally {
        connection.release();
    }
};

/**
 * Toggle Single Product Status (Deactivate / Activate)
 * PATCH /api/products/:id/status
 */
exports.toggleProductStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT is_active FROM products WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const newStatus = existing[0].is_active === 1 ? 0 : 1;
        await pool.query('UPDATE products SET is_active = ? WHERE id = ?', [newStatus, id]);

        return res.status(200).json({
            message: `Product ${newStatus === 1 ? 'activated' : 'deactivated'} successfully.`,
            is_active: newStatus
        });
    } catch (error) {
        console.error('Toggle product status error:', error);
        return res.status(500).json({ error: 'Failed to update product status.' });
    }
};

/**
 * Bulk Deactivate Products
 * POST /api/products/bulk-deactivate
 */
exports.bulkDeactivateProducts = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Please provide an array of product IDs to deactivate.' });
        }

        const placeholders = ids.map(() => '?').join(',');
        const query = `UPDATE products SET is_active = 0 WHERE id IN (${placeholders})`;

        const [result] = await pool.query(query, ids);

        return res.status(200).json({
            message: `Successfully deactivated ${result.affectedRows} product(s).`,
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Bulk deactivate error:', error);
        return res.status(500).json({ error: 'Failed to bulk deactivate products.' });
    }
};
