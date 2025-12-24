// server.js - Main Server File
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

// Import database and routes
const { initializeDatabase } = require('./models/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const courseRoutes = require('./routes/courses');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');

// Initialize Express app - ONLY ONCE
const app = express();

// Fix for Render proxy (add this line)
app.set('trust proxy', 1); // Trust first proxy

// Security and performance middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development, enable in production
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL ? 
        process.env.FRONTEND_URL.split(',') : 
        ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected' // You can add DB health check here
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

// Create HTTP server and Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
});

// WebSocket handling
const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('authenticate', (token) => {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userSockets.set(decoded.userId, socket.id);
            socket.userId = decoded.userId;
            console.log(`User ${decoded.userId} authenticated on socket ${socket.id}`);
            
            // Send welcome message
            socket.emit('connected', {
                message: 'Connected to TumiCodes real-time server',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Socket authentication error:', error.message);
            socket.emit('auth_error', { error: 'Invalid authentication token' });
        }
    });
    
    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
    });
    
    socket.on('leave_room', (room) => {
        socket.leave(room);
        console.log(`Socket ${socket.id} left room ${room}`);
    });
    
    socket.on('disconnect', () => {
        if (socket.userId) {
            userSockets.delete(socket.userId);
            console.log(`User ${socket.userId} disconnected`);
        }
    });
    
    // Error handling
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Function to send real-time updates to specific user
global.sendToUser = (userId, event, data) => {
    const socketId = userSockets.get(userId);
    if (socketId) {
        io.to(socketId).emit(event, data);
    }
};

// Function to broadcast to all users
global.broadcastToAll = (event, data) => {
    io.emit(event, data);
};

// Function to send to room
global.sendToRoom = (room, event, data) => {
    io.to(room).emit(event, data);
};

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';
    
    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Initialize database
        await initializeDatabase();
        console.log('Database initialized successfully');
        
        // Start server
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 WebSocket ready on port ${PORT}`);
            
            if (process.env.NODE_ENV === 'development') {
                console.log(`👑 Admin login: ${process.env.ADMIN_EMAIL || 'tumicodes@gmail.com'}`);
                console.log(`🔑 Admin password: ${process.env.ADMIN_PASSWORD || 'tumicodes25'}`);
            }
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = { app, server, io };
