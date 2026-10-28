const pool = require('../utils/db');

// Helper to generate unique Order Number (e.g., ORD-2026-8912)
function generateOrderNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${year}-${rand}`;
}

// Helper to normalize JSON columns in order
function normalizeOrder(order) {
    if (!order) return order;
    if (typeof order.split_payments === 'string') {
        try {
            order.split_payments = JSON.parse(order.split_payments);
        } catch (e) {
            order.split_payments = [];
        }
    }
    if (typeof order.split_returns === 'string') {
        try {
            order.split_returns = JSON.parse(order.split_returns);
        } catch (e) {
            order.split_returns = [];
        }
    }
    return order;
}

/**
 * Create Order with Per-Row Discounts & Inventory Stock Deduction
 * POST /api/orders
 */
exports.createOrder = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            buyer_id,
            items,
            payment_method = 'Cash',
            notes = '',
            vehicle_number = null,
            driver_name = null,
            payment_type = 'full',
            paid_amount,
            received_amount,
            return_amount,
            split_payments,
            split_returns
        } = req.body;
        const salesman_id = req.user.id;

        if (!buyer_id) {
            await connection.rollback();
            return res.status(400).json({ error: 'Buyer Customer is required.' });
        }

        if (!Array.isArray(items) || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Order must contain at least one item.' });
        }

        // Verify Buyer exists
        const [buyerRows] = await connection.query('SELECT * FROM users WHERE id = ?', [buyer_id]);
        if (buyerRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Buyer customer account not found.' });
        }
        const buyer = buyerRows[0];

        let subtotal = 0;
        let total_discount = 0;
        let tax_amount = 0;

        const processedItems = [];

        // Validate items and calculate totals
        for (const item of items) {
            const {
                product_id,
                variation_id = null,
                quantity = 1,
                unit_price = 0,
                discount_type = 'fixed',
                discount_value = 0
            } = item;

            const qty = Math.max(1, parseInt(quantity, 10));
            const basePrice = parseFloat(unit_price) || 0;
            const discVal = parseFloat(discount_value) || 0;

            let discountedPrice = basePrice;
            if (discount_type === 'percentage') {
                discountedPrice = Math.max(0, basePrice - (basePrice * discVal) / 100);
            } else {
                discountedPrice = Math.max(0, basePrice - discVal);
            }

            const lineSubtotal = basePrice * qty;
            const lineDiscount = (basePrice - discountedPrice) * qty;
            const lineTotal = discountedPrice * qty;

            subtotal += lineSubtotal;
            total_discount += lineDiscount;

            // Fetch product info to get name, SKU, tax_rate
            const [prodRows] = await connection.query('SELECT name, sku, tax_rate, manage_stock, stock_quantity FROM products WHERE id = ?', [product_id]);
            if (prodRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: `Product ID ${product_id} not found.` });
            }

            const product = prodRows[0];
            let itemSku = product.sku;
            let itemName = product.name;

            // Check & Deduct Stock
            if (variation_id) {
                const [varRows] = await connection.query(
                    'SELECT sku, attributes, stock_quantity FROM product_variations WHERE id = ? AND product_id = ?',
                    [variation_id, product_id]
                );
                if (varRows.length > 0) {
                    const varItem = varRows[0];
                    itemSku = varItem.sku;
                    const attrObj = typeof varItem.attributes === 'string' ? JSON.parse(varItem.attributes) : varItem.attributes;
                    const attrLabel = Object.entries(attrObj).map(([k, v]) => `${k}: ${v}`).join(', ');
                    if (attrLabel) itemName += ` (${attrLabel})`;

                    // Deduct stock from variation
                    const newVarStock = Math.max(0, varItem.stock_quantity - qty);
                    const varStatus = newVarStock <= 0 ? 'out_of_stock' : 'in_stock';
                    await connection.query(
                        'UPDATE product_variations SET stock_quantity = ?, stock_status = ? WHERE id = ?',
                        [newVarStock, varStatus, variation_id]
                    );

                    // Recalculate main product total stock
                    const [sumVar] = await connection.query(
                        'SELECT SUM(stock_quantity) as total_stock FROM product_variations WHERE product_id = ?',
                        [product_id]
                    );
                    const totalVarStock = sumVar[0].total_stock || 0;
                    const mainStatus = totalVarStock <= 0 ? 'out_of_stock' : 'in_stock';
                    await connection.query(
                        'UPDATE products SET stock_quantity = ?, stock_status = ? WHERE id = ?',
                        [totalVarStock, mainStatus, product_id]
                    );
                }
            } else {
                // Deduct stock from SIMPLE product
                const newStock = Math.max(0, product.stock_quantity - qty);
                const mainStatus = newStock <= 0 ? 'out_of_stock' : 'in_stock';
                await connection.query(
                    'UPDATE products SET stock_quantity = ?, stock_status = ? WHERE id = ?',
                    [newStock, mainStatus, product_id]
                );
            }

            // Calculate GST Tax
            const gstPct = parseFloat(product.tax_rate) || 0;
            const lineTax = (lineTotal * gstPct) / 100;
            tax_amount += lineTax;

            processedItems.push({
                product_id,
                variation_id,
                product_name: itemName,
                sku: itemSku,
                unit_price: basePrice,
                discount_type,
                discount_value: discVal,
                discounted_price: discountedPrice,
                quantity: qty,
                total_price: lineTotal
            });
        }

        const grand_total = subtotal - total_discount + tax_amount;
        const orderNumber = generateOrderNumber();

        // Clean & process split payments if provided
        let cleanedSplitPayments = null;
        let totalSplitReceived = 0;
        if (Array.isArray(split_payments) && split_payments.length > 0) {
            cleanedSplitPayments = split_payments
                .map(sp => ({
                    method: sp.method || 'Cash',
                    amount: Math.max(0, parseFloat(sp.amount) || 0),
                    notes: sp.notes ? String(sp.notes).trim() : undefined
                }))
                .filter(sp => sp.amount > 0);
            
            totalSplitReceived = cleanedSplitPayments.reduce((acc, curr) => acc + curr.amount, 0);
        }

        let effectivePaymentMethod = payment_method || 'Cash';
        if (cleanedSplitPayments && cleanedSplitPayments.length > 0) {
            effectivePaymentMethod = 'Split';
        }

        let calculatedReceived = 0;
        let calculatedPaid = 0;
        let calculatedPending = 0;
        let calculatedReturn = 0;
        let calculatedStatus = 'Paid';

        if (effectivePaymentMethod === 'Credit') {
            calculatedReceived = 0;
            calculatedPaid = 0;
            calculatedPending = grand_total;
            calculatedReturn = 0;
            calculatedStatus = 'Pending';
        } else {
            if (cleanedSplitPayments && cleanedSplitPayments.length > 0) {
                calculatedReceived = totalSplitReceived;
            } else if (received_amount !== undefined && received_amount !== null && !isNaN(parseFloat(received_amount))) {
                calculatedReceived = Math.max(0, parseFloat(received_amount));
            } else if (payment_type === 'part' || paid_amount !== undefined) {
                calculatedReceived = Math.max(0, parseFloat(paid_amount) || 0);
            } else {
                calculatedReceived = grand_total;
            }

            if (calculatedReceived >= grand_total) {
                calculatedPaid = grand_total;
                calculatedPending = 0;
                calculatedReturn = Math.max(0, calculatedReceived - grand_total);
                calculatedStatus = 'Paid';
            } else {
                calculatedPaid = calculatedReceived;
                calculatedPending = Math.max(0, grand_total - calculatedReceived);
                calculatedReturn = 0;
                calculatedStatus = calculatedPaid > 0 ? 'Partial' : 'Pending';
            }
        }

        // Clean & process split returns if change is due
        let cleanedSplitReturns = null;
        if (calculatedReturn > 0) {
            if (Array.isArray(split_returns) && split_returns.length > 0) {
                cleanedSplitReturns = split_returns
                    .map(sr => ({
                        method: sr.method || 'Cash',
                        amount: Math.max(0, parseFloat(sr.amount) || 0)
                    }))
                    .filter(sr => sr.amount > 0);
            }
            if (!cleanedSplitReturns || cleanedSplitReturns.length === 0) {
                cleanedSplitReturns = [{ method: 'Cash', amount: calculatedReturn }];
            }
        }

        const splitPaymentsJson = cleanedSplitPayments && cleanedSplitPayments.length > 0 ? JSON.stringify(cleanedSplitPayments) : null;
        const splitReturnsJson = cleanedSplitReturns && cleanedSplitReturns.length > 0 ? JSON.stringify(cleanedSplitReturns) : null;

        const vNum = vehicle_number && vehicle_number.trim() ? vehicle_number.trim() : null;
        const dName = driver_name && driver_name.trim() ? driver_name.trim() : null;

        // Insert Order Header with fallback for unmigrated columns
        let orderResult;
        try {
            [orderResult] = await connection.query(
                `INSERT INTO orders (
                    order_number, salesman_id, buyer_id, subtotal, total_discount,
                    tax_amount, grand_total, paid_amount, pending_balance,
                    received_amount, return_amount, payment_method, payment_status,
                    split_payments, split_returns, vehicle_number, driver_name, order_status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?)`,
                [
                    orderNumber,
                    salesman_id,
                    buyer_id,
                    subtotal,
                    total_discount,
                    tax_amount,
                    grand_total,
                    calculatedPaid,
                    calculatedPending,
                    calculatedReceived,
                    calculatedReturn,
                    effectivePaymentMethod,
                    calculatedStatus,
                    splitPaymentsJson,
                    splitReturnsJson,
                    vNum,
                    dName,
                    notes || null
                ]
            );
        } catch (insertErr) {
            if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
                [orderResult] = await connection.query(
                    `INSERT INTO orders (
                        order_number, salesman_id, buyer_id, subtotal, total_discount,
                        tax_amount, grand_total, paid_amount, pending_balance, payment_method, payment_status,
                        vehicle_number, driver_name, order_status, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?)`,
                    [
                        orderNumber,
                        salesman_id,
                        buyer_id,
                        subtotal,
                        total_discount,
                        tax_amount,
                        grand_total,
                        calculatedPaid,
                        calculatedPending,
                        effectivePaymentMethod,
                        calculatedStatus,
                        vNum,
                        dName,
                        notes || null
                    ]
                );
            } else {
                throw insertErr;
            }
        }

        const orderId = orderResult.insertId;

        // Insert Line Items
        for (const pi of processedItems) {
            await connection.query(
                `INSERT INTO order_items (
                    order_id, product_id, variation_id, product_name, sku,
                    unit_price, discount_type, discount_value, discounted_price, quantity, total_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderId,
                    pi.product_id,
                    pi.variation_id,
                    pi.product_name,
                    pi.sku,
                    pi.unit_price,
                    pi.discount_type,
                    pi.discount_value,
                    pi.discounted_price,
                    pi.quantity,
                    pi.total_price
                ]
            );
        }

        await connection.commit();

        // Fetch Complete Created Order Details
        const [orderRows] = await pool.query(
            `SELECT o.*, 
                    s.name AS salesman_name, s.staff_code AS salesman_code,
                    b.name AS buyer_name, b.phone AS buyer_phone, b.company_name AS buyer_company, b.gstin AS buyer_gstin, b.city AS buyer_city
             FROM orders o
             JOIN employees s ON o.salesman_id = s.id
             JOIN users b ON o.buyer_id = b.id
             WHERE o.id = ?`,
            [orderId]
        );

        const [itemRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

        return res.status(201).json({
            message: 'Order placed successfully',
            order: {
                ...normalizeOrder(orderRows[0]),
                items: itemRows
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create order error:', error);
        return res.status(500).json({ error: 'Failed to place order.' });
    } finally {
        connection.release();
    }
};

/**
 * Get List of Orders
 * GET /api/orders
 */
exports.getAllOrders = async (req, res) => {
    try {
        const { search, salesman_id, buyer_id } = req.query;

        let query = `
            SELECT o.*,
                   s.name AS salesman_name, s.staff_code AS salesman_code,
                   b.name AS buyer_name, b.phone AS buyer_phone, b.company_name AS buyer_company, b.user_code AS buyer_code,
                   (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
            FROM orders o
            JOIN employees s ON o.salesman_id = s.id
            JOIN users b ON o.buyer_id = b.id
            WHERE 1=1
        `;
        const params = [];

        // If user is Salesman, restrict view to their own orders unless Admin
        if (req.user.role === 'Salesman') {
            query += ` AND o.salesman_id = ?`;
            params.push(req.user.id);
        } else if (salesman_id) {
            query += ` AND o.salesman_id = ?`;
            params.push(salesman_id);
        }

        if (buyer_id) {
            query += ` AND o.buyer_id = ?`;
            params.push(buyer_id);
        }

        if (search) {
            query += ` AND (o.order_number LIKE ? OR b.name LIKE ? OR b.phone LIKE ? OR b.company_name LIKE ?)`;
            const pattern = `%${search.trim()}%`;
            params.push(pattern, pattern, pattern, pattern);
        }

        query += ` ORDER BY o.created_at DESC`;

        const [orders] = await pool.query(query, params);

        return res.status(200).json({ orders: orders.map(normalizeOrder) });
    } catch (error) {
        console.error('Get orders error:', error);
        return res.status(500).json({ error: 'Failed to fetch orders.' });
    }
};

/**
 * Get Order Details by ID
 * GET /api/orders/:id
 */
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await pool.query(
            `SELECT o.*,
                    s.name AS salesman_name, s.staff_code AS salesman_code, s.email AS salesman_email,
                    b.name AS buyer_name, b.phone AS buyer_phone, b.email AS buyer_email, b.company_name AS buyer_company, b.gstin AS buyer_gstin, b.address AS buyer_address, b.city AS buyer_city, b.state AS buyer_state, b.pincode AS buyer_pincode
             FROM orders o
             JOIN employees s ON o.salesman_id = s.id
             JOIN users b ON o.buyer_id = b.id
             WHERE o.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

        return res.status(200).json({
            order: {
                ...normalizeOrder(orders[0]),
                items
            }
        });
    } catch (error) {
        console.error('Get order by ID error:', error);
        return res.status(500).json({ error: 'Failed to fetch order details.' });
    }
};

/**
 * Update Order Delivery Info (Vehicle number & driver name)
 * PUT /api/orders/:id/delivery-info
 */
exports.updateDeliveryInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { vehicle_number, driver_name } = req.body;

        const [existing] = await pool.query('SELECT id FROM orders WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const vNum = vehicle_number !== undefined && vehicle_number !== null ? vehicle_number.trim() : null;
        const dName = driver_name !== undefined && driver_name !== null ? driver_name.trim() : null;

        await pool.query(
            'UPDATE orders SET vehicle_number = ?, driver_name = ? WHERE id = ?',
            [vNum || null, dName || null, id]
        );

        const [updatedRows] = await pool.query(
            `SELECT o.*, 
                    s.name AS salesman_name, s.staff_code AS salesman_code, s.email AS salesman_email,
                    b.name AS buyer_name, b.phone AS buyer_phone, b.email AS buyer_email, b.company_name AS buyer_company, b.gstin AS buyer_gstin, b.address AS buyer_address, b.city AS buyer_city, b.state AS buyer_state, b.pincode AS buyer_pincode
             FROM orders o
             JOIN employees s ON o.salesman_id = s.id
             JOIN users b ON o.buyer_id = b.id
             WHERE o.id = ?`,
            [id]
        );

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

        return res.status(200).json({
            message: 'Delivery info updated successfully',
            order: {
                ...normalizeOrder(updatedRows[0]),
                items
            }
        });
    } catch (error) {
        console.error('Update delivery info error:', error);
        return res.status(500).json({ error: 'Failed to update delivery info.' });
    }
};

/**
 * Record / Collect Payment for Pending or Partial Order
 * Supports split payment method, extra received & return change
 * PUT /api/orders/:id/payment
 */
exports.updateOrderPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            amount_to_add,
            received_amount,
            payment_method = 'Cash',
            split_payments,
            split_returns
        } = req.body;

        const [existing] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const order = existing[0];
        let addAmount = parseFloat(amount_to_add) || 0;
        let recAmount = (received_amount !== undefined && received_amount !== null && !isNaN(parseFloat(received_amount)))
            ? parseFloat(received_amount)
            : addAmount;

        if (Array.isArray(split_payments) && split_payments.length > 0) {
            const splitSum = split_payments.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
            if (splitSum > 0) {
                recAmount = splitSum;
                addAmount = splitSum;
            }
        }

        if (addAmount <= 0 && recAmount <= 0) {
            return res.status(400).json({ error: 'Please enter a valid payment amount.' });
        }

        const currentPaid = parseFloat(order.paid_amount) || 0;
        const currentReceived = parseFloat(order.received_amount) || currentPaid;
        const grandTotal = parseFloat(order.grand_total) || 0;
        const pendingBal = parseFloat(order.pending_balance) || Math.max(0, grandTotal - currentPaid);

        const extraChange = Math.max(0, recAmount - pendingBal);
        const effectiveAddedToBill = Math.min(pendingBal, recAmount);
        const newPaid = Math.min(grandTotal, currentPaid + effectiveAddedToBill);
        const newPending = Math.max(0, grandTotal - newPaid);
        const newStatus = newPending <= 0 ? 'Paid' : (newPaid > 0 ? 'Partial' : 'Pending');
        const newReceived = currentReceived + recAmount;
        const newReturn = (parseFloat(order.return_amount) || 0) + extraChange;

        // Combine existing split payments with new ones
        let existingSplits = [];
        if (order.split_payments) {
            try {
                existingSplits = typeof order.split_payments === 'string' ? JSON.parse(order.split_payments) : order.split_payments;
            } catch (e) {
                existingSplits = [];
            }
        }
        if (!Array.isArray(existingSplits)) existingSplits = [];

        if (Array.isArray(split_payments) && split_payments.length > 0) {
            split_payments.forEach(sp => {
                const amt = parseFloat(sp.amount) || 0;
                if (amt > 0) {
                    existingSplits.push({
                        method: sp.method || 'Cash',
                        amount: amt,
                        date: new Date().toISOString()
                    });
                }
            });
        } else {
            existingSplits.push({
                method: payment_method || 'Cash',
                amount: recAmount,
                date: new Date().toISOString()
            });
        }

        let existingReturns = [];
        if (order.split_returns) {
            try {
                existingReturns = typeof order.split_returns === 'string' ? JSON.parse(order.split_returns) : order.split_returns;
            } catch (e) {
                existingReturns = [];
            }
        }
        if (!Array.isArray(existingReturns)) existingReturns = [];

        if (extraChange > 0) {
            if (Array.isArray(split_returns) && split_returns.length > 0) {
                split_returns.forEach(sr => {
                    const rAmt = parseFloat(sr.amount) || 0;
                    if (rAmt > 0) {
                        existingReturns.push({
                            method: sr.method || 'Cash',
                            amount: rAmt,
                            date: new Date().toISOString()
                        });
                    }
                });
            } else {
                existingReturns.push({
                    method: 'Cash',
                    amount: extraChange,
                    date: new Date().toISOString()
                });
            }
        }

        try {
            await pool.query(
                `UPDATE orders SET 
                    paid_amount = ?, pending_balance = ?, payment_status = ?,
                    received_amount = ?, return_amount = ?, split_payments = ?, split_returns = ?
                 WHERE id = ?`,
                [
                    newPaid,
                    newPending,
                    newStatus,
                    newReceived,
                    newReturn,
                    JSON.stringify(existingSplits),
                    existingReturns.length > 0 ? JSON.stringify(existingReturns) : null,
                    id
                ]
            );
        } catch (e) {
            // Graceful fallback if extra columns do not exist
            await pool.query(
                'UPDATE orders SET paid_amount = ?, pending_balance = ?, payment_status = ? WHERE id = ?',
                [newPaid, newPending, newStatus, id]
            );
        }

        const [updatedRows] = await pool.query(
            `SELECT o.*, 
                    s.name AS salesman_name, s.staff_code AS salesman_code, s.email AS salesman_email,
                    b.name AS buyer_name, b.phone AS buyer_phone, b.email AS buyer_email, b.company_name AS buyer_company, b.gstin AS buyer_gstin, b.address AS buyer_address, b.city AS buyer_city, b.state AS buyer_state, b.pincode AS buyer_pincode
             FROM orders o
             JOIN employees s ON o.salesman_id = s.id
             JOIN users b ON o.buyer_id = b.id
             WHERE o.id = ?`,
            [id]
        );

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

        return res.status(200).json({
            message: 'Payment recorded successfully',
            order: {
                ...normalizeOrder(updatedRows[0]),
                items
            }
        });
    } catch (error) {
        console.error('Update order payment error:', error);
        return res.status(500).json({ error: 'Failed to record payment.' });
    }
};
