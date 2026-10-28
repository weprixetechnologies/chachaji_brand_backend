require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8982;

const { initDb } = require('./utils/db');
const authRouter = require('./routers/authRouter');
const employeeRouter = require('./routers/employeeRouter');
const categoryRouter = require('./routers/categoryRouter');
const productRouter = require('./routers/productRouter');
const userRouter = require('./routers/userRouter');
const otpRouter = require('./routers/otpRouter');
const orderRouter = require('./routers/orderRouter');
const analyticsRouter = require('./routers/analyticsRouter');
const settingRouter = require('./routers/settingRouter');

// CORS configuration allowing panel access
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(express.json());

// Health Check Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Routers
app.use('/api/auth', authRouter);
app.use('/api/employees', employeeRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/products', productRouter);
app.use('/api/users', userRouter);
app.use('/api/otp', otpRouter);
app.use('/api/orders', orderRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/settings', settingRouter);

// Initialize DB and start server
async function startServer() {
    try {
        await initDb();
        app.listen(port, () => {
            console.log(`🚀 Chachaji Backend running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();