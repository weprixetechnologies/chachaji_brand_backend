const pool = require('../utils/db');

// Helper to generate URL slug from text
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[\s\W-]+/g, '-');
}

/**
 * Get all categories with parent info and product counts
 * GET /api/categories
 */
exports.getAllCategories = async (req, res) => {
    try {
        const { search, status } = req.query;
        let query = `
            SELECT 
                c.id, 
                c.name, 
                c.slug, 
                c.parent_id, 
                c.description, 
                c.image_url, 
                c.is_active, 
                c.created_at, 
                c.updated_at,
                p.name AS parent_name,
                COUNT(prod.id) AS product_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            LEFT JOIN products prod ON c.id = prod.category_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (c.name LIKE ? OR c.slug LIKE ? OR c.description LIKE ?)`;
            const pattern = `%${search.trim()}%`;
            params.push(pattern, pattern, pattern);
        }

        if (status !== undefined && status !== '') {
            query += ` AND c.is_active = ?`;
            params.push(status === 'active' || status === '1' ? 1 : 0);
        }

        query += ` GROUP BY c.id ORDER BY c.name ASC`;

        const [categories] = await pool.query(query, params);
        return res.status(200).json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        return res.status(500).json({ error: 'Failed to fetch categories.' });
    }
};

/**
 * Create new category
 * POST /api/categories
 */
exports.createCategory = async (req, res) => {
    try {
        const { name, slug, parent_id, description, image_url, is_active = 1 } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category Name is required.' });
        }

        const categorySlug = (slug && slug.trim()) ? slugify(slug) : slugify(name);

        // Check if slug exists
        const [existing] = await pool.query('SELECT id FROM categories WHERE slug = ?', [categorySlug]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'A category with this URL slug already exists.' });
        }

        let parentId = parent_id ? parseInt(parent_id, 10) : null;
        if (parentId) {
            const [parentCheck] = await pool.query('SELECT id FROM categories WHERE id = ?', [parentId]);
            if (parentCheck.length === 0) parentId = null;
        }

        const [result] = await pool.query(
            `INSERT INTO categories (name, slug, parent_id, description, image_url, is_active)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name.trim(), categorySlug, parentId, description || null, image_url || null, is_active ? 1 : 0]
        );

        const [newCat] = await pool.query('SELECT * FROM categories WHERE id = ?', [result.insertId]);

        return res.status(201).json({
            message: 'Category created successfully',
            category: newCat[0]
        });
    } catch (error) {
        console.error('Create category error:', error);
        return res.status(500).json({ error: 'Failed to create category.' });
    }
};

/**
 * Update category
 * PUT /api/categories/:id
 */
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, parent_id, description, image_url, is_active } = req.body;

        const [existing] = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Category not found.' });
        }

        const currentCat = existing[0];
        const updatedName = name !== undefined ? name.trim() : currentCat.name;
        let updatedSlug = currentCat.slug;

        if (slug || name) {
            const proposedSlug = slugify(slug || updatedName);
            if (proposedSlug !== currentCat.slug) {
                const [slugMatch] = await pool.query(
                    'SELECT id FROM categories WHERE slug = ? AND id != ?',
                    [proposedSlug, id]
                );
                if (slugMatch.length > 0) {
                    return res.status(409).json({ error: 'A category with this URL slug already exists.' });
                }
                updatedSlug = proposedSlug;
            }
        }

        let updatedParentId = parent_id !== undefined ? (parent_id ? parseInt(parent_id, 10) : null) : currentCat.parent_id;
        if (updatedParentId === parseInt(id, 10)) {
            return res.status(400).json({ error: 'Category cannot be its own parent.' });
        }

        const updatedDescription = description !== undefined ? description : currentCat.description;
        const updatedImageUrl = image_url !== undefined ? image_url : currentCat.image_url;
        const updatedIsActive = is_active !== undefined ? (is_active ? 1 : 0) : currentCat.is_active;

        await pool.query(
            `UPDATE categories 
             SET name = ?, slug = ?, parent_id = ?, description = ?, image_url = ?, is_active = ?
             WHERE id = ?`,
            [updatedName, updatedSlug, updatedParentId, updatedDescription, updatedImageUrl, updatedIsActive, id]
        );

        const [updatedRows] = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
        return res.status(200).json({
            message: 'Category updated successfully',
            category: updatedRows[0]
        });
    } catch (error) {
        console.error('Update category error:', error);
        return res.status(500).json({ error: 'Failed to update category.' });
    }
};

/**
 * Toggle Category Active Status
 * PATCH /api/categories/:id/status
 */
exports.toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT is_active FROM categories WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Category not found.' });
        }

        const newStatus = existing[0].is_active === 1 ? 0 : 1;
        await pool.query('UPDATE categories SET is_active = ? WHERE id = ?', [newStatus, id]);

        return res.status(200).json({
            message: `Category ${newStatus === 1 ? 'activated' : 'deactivated'} successfully.`,
            is_active: newStatus
        });
    } catch (error) {
        console.error('Toggle category status error:', error);
        return res.status(500).json({ error: 'Failed to update category status.' });
    }
};
