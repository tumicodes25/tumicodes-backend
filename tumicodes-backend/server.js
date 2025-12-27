// server.js - Main Server File (FIXED & VERIFIED)

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

// Import database and routes
const { initializeDatabase } = require('./models/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const courseRoutes = require('./routes/courses');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');

// Initialize Express app
const app = express();

/* =========================
   TRUST PROXY (Render / Nginx)
========================= */
app.set('trust proxy', 1);

/* =========================
   SECURITY & PERFORMANCE
========================= */
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(morgan('combined'));
app.use(cookieParser());

/* =========================
   BODY PARSING (BEFORE ROUTES)
========================= */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* =========================
   CORS (FIXED FOR POST AUTH)
========================= */
const corsOptions = {
    origin: process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',')
        : ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // IMPORTANT: preflight support

/* =========================
   RATE LIMITING
========================= */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

/* =========================
   STATIC FILES
========================= */
app.use(express.static(path.join(__dirname, 'public')));

/* =========================
   HEALTH CHECK
========================= */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/* =========================
   API ROUTES (CONFIRMED)
========================= */
app.get('/api', (req, res) => {
    res.json({
        status: 'ok',
        message: 'TumiCodes API root is working'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

/* =========================
   HTTP + SOCKET.IO
========================= */
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('authenticate', (token) => {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId;
            userSockets.set(decoded.userId, socket.id);

            socket.emit('connected', {
                message: 'Connected to TumiCodes real-time server'
            });
        } catch (err) {
            socket.emit('auth_error', { error: 'Invalid token' });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            userSockets.delete(socket.userId);
        }
    });
});

/* =========================
   REAL-TIME HELPERS
========================= */
global.sendToUser = (userId, event, data) => {
    const socketId = userSockets.get(userId);
    if (socketId) io.to(socketId).emit(event, data);
};

global.broadcastToAll = (event, data) => {
    io.emit(event, data);
};

global.sendToRoom = (room, event, data) => {
    io.to(room).emit(event, data);
};

app.post('/api/auth/register', (req, res) => {
    res.json({
        hit: true,
        body: req.body
    });
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
    console.error('Global error:', err);

    res.status(err.statusCode || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await initializeDatabase();
        console.log('Database connected');

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Health: http://localhost:${PORT}/health`);
        });
    } catch (err) {
        console.error('Startup failed:', err);
        process.exit(1);
    }
}

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

if (require.main === module) {
    startServer();
}

module.exports = { app, server, io };



