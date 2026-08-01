const pool = require('../utils/db');

// Helper to calculate date condition SQL snippet
function getDateCondition(range, tableAlias = 'o') {
    switch (range) {
        case 'today':
            return ` AND DATE(${tableAlias}.created_at) = CURDATE()`;
        case 'week':
            return ` AND ${tableAlias}.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
        case 'month':
            return ` AND ${tableAlias}.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
        default:
            return '';
    }
}

/**
 * Get Analytics for a specific Salesman
 * GET /api/analytics/salesman
 */
exports.getSalesmanAnalytics = async (req, res) => {
    try {
        const { range = 'month', salesman_id } = req.query;

        // If Salesman role, enforce their own ID; if Admin, allow specified salesman_id or default to logged-in user
        let targetSalesmanId = req.user.id;
        if (req.user.role === 'Admin' && salesman_id) {
            targetSalesmanId = parseInt(salesman_id, 10);
        }

        const dateCondOrders = getDateCondition(range, 'o');
        const dateCondUsers = getDateCondition(range, 'u');

        // 1. Overall Metrics
        const [metricsRows] = await pool.query(
            `SELECT 
                COUNT(o.id) AS total_orders,
                COALESCE(SUM(o.grand_total), 0) AS total_revenue,
                COALESCE(SUM(o.subtotal), 0) AS total_subtotal,
                COALESCE(SUM(o.total_discount), 0) AS total_discounts,
                COALESCE(SUM(o.tax_amount), 0) AS total_tax,
                COALESCE(AVG(o.grand_total), 0) AS avg_order_value
             FROM orders o
             WHERE o.salesman_id = ? ${dateCondOrders}`,
            [targetSalesmanId]
        );

        // 2. Total Registered Buyers by this Salesman
        const [buyersRows] = await pool.query(
            `SELECT COUNT(u.id) AS registered_buyers
             FROM users u
             WHERE u.created_by = ? ${dateCondUsers}`,
            [targetSalesmanId]
        );

        // 3. Top 5 Selling Products
        const [topProducts] = await pool.query(
            `SELECT 
                oi.product_name,
                oi.sku,
                SUM(oi.quantity) AS total_quantity,
                SUM(oi.total_price) AS total_revenue
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE o.salesman_id = ? ${dateCondOrders}
             GROUP BY oi.product_name, oi.sku
             ORDER BY total_quantity DESC
             LIMIT 5`,
            [targetSalesmanId]
        );

        // 4. Payment Method Breakdown
        const [paymentBreakdown] = await pool.query(
            `SELECT 
                o.payment_method,
                COUNT(o.id) AS order_count,
                COALESCE(SUM(o.grand_total), 0) AS total_amount
             FROM orders o
             WHERE o.salesman_id = ? ${dateCondOrders}
             GROUP BY o.payment_method`,
            [targetSalesmanId]
        );

        // 5. Top Retailers / Buyers by Total Spent
        const [topCustomers] = await pool.query(
            `SELECT 
                u.name AS buyer_name,
                u.phone AS buyer_phone,
                u.company_name AS buyer_company,
                u.city AS buyer_city,
                COUNT(o.id) AS orders_count,
                COALESCE(SUM(o.grand_total), 0) AS total_spent
             FROM orders o
             JOIN users u ON o.buyer_id = u.id
             WHERE o.salesman_id = ? ${dateCondOrders}
             GROUP BY u.id
             ORDER BY total_spent DESC
             LIMIT 5`,
            [targetSalesmanId]
        );

        // 6. Fetch Salesman Info
        const [salesmanInfo] = await pool.query(
            'SELECT id, staff_code, name, email, phone, role FROM employees WHERE id = ?',
            [targetSalesmanId]
        );

        return res.status(200).json({
            salesman: salesmanInfo[0] || null,
            range,
            metrics: {
                total_orders: metricsRows[0]?.total_orders || 0,
                total_revenue: parseFloat(metricsRows[0]?.total_revenue || 0),
                total_discounts: parseFloat(metricsRows[0]?.total_discounts || 0),
                avg_order_value: parseFloat(metricsRows[0]?.avg_order_value || 0),
                registered_buyers: buyersRows[0]?.registered_buyers || 0
            },
            top_products: topProducts,
            payment_breakdown: paymentBreakdown,
            top_customers: topCustomers
        });
    } catch (error) {
        console.error('Get salesman analytics error:', error);
        return res.status(500).json({ error: 'Failed to fetch salesman analytics.' });
    }
};

/**
 * Get Admin Leaderboard & Performance Report for All Salesmen
 * GET /api/analytics/admin/salesmen-report
 */
exports.getAdminSalesmenReport = async (req, res) => {
    try {
        const { range = 'month' } = req.query;
        const dateCondOrders = getDateCondition(range, 'o');
        const dateCondUsers = getDateCondition(range, 'u');

        // Fetch all Salesmen employees
        const [salesmen] = await pool.query(
            `SELECT e.id, e.staff_code, e.name, e.email, e.phone, e.is_active, e.created_at
             FROM employees e
             WHERE e.role = 'Salesman'
             ORDER BY e.name ASC`
        );

        const report = [];

        for (const sm of salesmen) {
            // Aggregate Orders stats
            const [orderStats] = await pool.query(
                `SELECT 
                    COUNT(o.id) AS total_orders,
                    COALESCE(SUM(o.grand_total), 0) AS total_revenue,
                    COALESCE(SUM(o.total_discount), 0) AS total_discounts,
                    COALESCE(AVG(o.grand_total), 0) AS avg_order_value
                 FROM orders o
                 WHERE o.salesman_id = ? ${dateCondOrders}`,
                [sm.id]
            );

            // Registered Buyers count
            const [buyerStats] = await pool.query(
                `SELECT COUNT(u.id) AS registered_buyers
                 FROM users u
                 WHERE u.created_by = ? ${dateCondUsers}`,
                [sm.id]
            );

            report.push({
                ...sm,
                total_orders: orderStats[0]?.total_orders || 0,
                total_revenue: parseFloat(orderStats[0]?.total_revenue || 0),
                total_discounts: parseFloat(orderStats[0]?.total_discounts || 0),
                avg_order_value: parseFloat(orderStats[0]?.avg_order_value || 0),
                registered_buyers: buyerStats[0]?.registered_buyers || 0
            });
        }

        // Sort by Total Revenue DESC for Leaderboard ranking
        report.sort((a, b) => b.total_revenue - a.total_revenue);

        // Assign Rank
        report.forEach((sm, index) => {
            sm.rank = index + 1;
        });

        // Summary Aggregates for Admin Overview
        const totalSalesmen = report.length;
        const aggregateRevenue = report.reduce((sum, r) => sum + r.total_revenue, 0);
        const aggregateOrders = report.reduce((sum, r) => sum + r.total_orders, 0);
        const aggregateBuyersOnboarded = report.reduce((sum, r) => sum + r.registered_buyers, 0);

        return res.status(200).json({
            range,
            summary: {
                total_salesmen: totalSalesmen,
                aggregate_revenue: aggregateRevenue,
                aggregate_orders: aggregateOrders,
                aggregate_buyers_onboarded: aggregateBuyersOnboarded
            },
            leaderboard: report
        });
    } catch (error) {
        console.error('Get admin salesmen report error:', error);
        return res.status(500).json({ error: 'Failed to fetch salesmen performance report.' });
    }
};
