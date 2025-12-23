// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../models/db');
const { authRateLimiter } = require('../middleware/auth');

// Register new user
router.post('/register', authRateLimiter, async (req, res) => {
    try {
        const { email, name, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }
        
        // Check if user exists
        const [existingUsers] = await executeQuery(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({
                error: 'User already exists',
                code: 'USER_EXISTS'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user
        const [result] = await executeQuery(
            'INSERT INTO users (email, name, password) VALUES (?, ?, ?)',
            [email, name, hashedPassword]
        );
        
        // Create JWT token
        const token = jwt.sign(
            { userId: result.insertId },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Get user data
        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak FROM users WHERE id = ?',
            [result.insertId]
        );
        
        // Create welcome notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [result.insertId, 'success', 'Welcome to TumiCodes!', 'Your account has been created successfully. Start your coding journey now!', 'rocket']
        );
        
        // Create first activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [result.insertId, 'profile_updated', 'Account created']
        );
        
        res.status(201).json({
            message: 'Registration successful',
            token,
            user: users[0]
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            code: 'REGISTRATION_FAILED'
        });
    }
});

// Login user
router.post('/login', authRateLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Get user
        const [users] = await executeQuery(
            'SELECT id, email, name, password, role, avatar_url, xp, level, streak FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        const user = users[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Update last active
        await executeQuery(
            'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        delete user.password;
        
        // Create login activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [user.id, 'login', 'User logged in']
        );
        
        res.json({
            message: 'Login successful',
            token,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            code: 'LOGIN_FAILED'
        });
    }
});

// Verify token
router.post('/verify', async (req, res) => {
    try {
        const token = req.body.token;
        
        if (!token) {
            return res.status(400).json({
                error: 'Token is required',
                code: 'TOKEN_REQUIRED'
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user data
        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak FROM users WHERE id = ?',
            [decoded.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        res.json({
            valid: true,
            user: users[0]
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.json({
                valid: false,
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.json({
                valid: false,
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        console.error('Token verification error:', error);
        res.status(500).json({
            error: 'Token verification failed',
            code: 'VERIFICATION_FAILED'
        });
    }
});

// Forgot password
router.post('/forgot-password', authRateLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                code: 'EMAIL_REQUIRED'
            });
        }
        
        // Check if user exists
        const [users] = await executeQuery(
            'SELECT id, email FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            // Return success even if user doesn't exist (security best practice)
            return res.json({
                message: 'If an account exists with this email, you will receive a password reset link'
            });
        }
        
        const user = users[0];
        
        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign(
            { userId: user.id, type: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        // In production, you would send an email here
        // For now, we'll just return the token (in production, don't do this!)
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        // Create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'warning', 'Password Reset Requested', 'A password reset has been requested for your account. If you did not request this, please ignore this message.', 'key']
        );
        
        // In development, return the reset link
        if (process.env.NODE_ENV === 'development') {
            res.json({
                message: 'Password reset link generated',
                resetLink: resetLink,
                note: 'In production, this would be sent via email'
            });
        } else {
            res.json({
                message: 'If an account exists with this email, you will receive a password reset link'
            });
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            error: 'Password reset request failed',
            code: 'RESET_FAILED'
        });
    }
});

// Reset password
router.post('/reset-password', authRateLimiter, async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({
                error: 'Token and new password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }
        
        // Verify reset token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.type !== 'password_reset') {
            return res.status(400).json({
                error: 'Invalid token type',
                code: 'INVALID_TOKEN_TYPE'
            });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update password
        await executeQuery(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, decoded.userId]
        );
        
        // Create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [decoded.userId, 'success', 'Password Updated', 'Your password has been successfully updated.', 'check-circle']
        );
        
        // Create activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [decoded.userId, 'profile_updated', 'Password reset']
        );
        
        res.json({
            message: 'Password reset successful'
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
        }
        
        console.error('Reset password error:', error);
        res.status(500).json({
            error: 'Password reset failed',
            code: 'RESET_FAILED'
        });
    }
});

module.exports = router;