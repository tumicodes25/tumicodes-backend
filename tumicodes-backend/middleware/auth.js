// middleware/auth.js - Authentication middleware (POSTGRESQL FIXED)
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../models/db');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token =
            (authHeader && authHeader.split(' ')[1]) ||
            req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                code: 'NO_TOKEN'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ✅ POSTGRESQL SYNTAX + CORRECT RESULT HANDLING
        const result = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        req.user = result.rows[0];
        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(403).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
};

// Admin only
const authenticateAdmin = async (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Admin access required',
                code: 'ADMIN_REQUIRED'
            });
        }
        next();
    });
};

// Admin or Instructor
const authenticateAdminOrInstructor = async (req, res, next) => {
    authenticateToken(req, res, () => {
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({
                error: 'Admin or instructor access required',
                code: 'PRIVILEGED_ACCESS_REQUIRED'
            });
        }
        next();
    });
};

// Rate limiting
const authRateLimiter = require('express-rate-limit')({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many authentication attempts. Please try again later.',
        code: 'TOO_MANY_ATTEMPTS'
    }
});

module.exports = {
    authenticateToken,
    authenticateAdmin,
    authenticateAdminOrInstructor,
    authRateLimiter
};
