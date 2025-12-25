// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../models/db');
const { authRateLimiter } = require('../middleware/auth');
const { validateEmail, validatePassword } = require('../utils/validators');
const { sendEmail } = require('../utils/emailService');

// Generate JWT token helper
const generateToken = (userId, expiresIn = '7d') => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

// Register new user
router.post('/register', authRateLimiter, async (req, res) => {
    try {
        const { email, name, password } = req.body;
        
        // Validation
        if (!email || !password || !name) {
            return res.status(400).json({
                error: 'Name, email and password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Email validation
        if (!validateEmail(email)) {
            return res.status(400).json({
                error: 'Please provide a valid email address',
                code: 'INVALID_EMAIL'
            });
        }
        
        // Password validation
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: passwordValidation.message,
                code: 'PASSWORD_VALIDATION_FAILED'
            });
        }
        
        // Check if user exists
        const [existingUsers] = await executeQuery(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(409).json({
                error: 'User with this email already exists',
                code: 'USER_EXISTS'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user with default values
        const [result] = await executeQuery(
            `INSERT INTO users (email, name, password, role, xp, level, streak, avatar_url) 
             VALUES (?, ?, ?, 'user', 0, 1, 0, ?)`,
            [email, name, hashedPassword, `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`]
        );
        
        // Create JWT token
        const token = generateToken(result.insertId);
        
        // Get user data
        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak, created_at FROM users WHERE id = ?',
            [result.insertId]
        );
        
        const user = users[0];
        
        // Create welcome notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'success', 'Welcome to TumiCodes! 🎉', 'Your account has been created successfully. Start your coding journey now!', 'rocket']
        );
        
        // Create first activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title, description) VALUES (?, ?, ?, ?)',
            [user.id, 'account_created', 'Account Created', 'Welcome to TumiCodes!']
        );
        
        // Send welcome email (in production)
        if (process.env.NODE_ENV === 'production') {
            try {
                await sendEmail({
                    to: email,
                    subject: 'Welcome to TumiCodes!',
                    template: 'welcome',
                    data: { name }
                });
            } catch (emailError) {
                console.error('Welcome email failed:', emailError);
                // Don't fail registration if email fails
            }
        }
        
        // Set cookie for web clients
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        
        res.status(201).json({
            message: 'Registration successful',
            token,
            user
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed. Please try again.',
            code: 'REGISTRATION_FAILED',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        
        // Get user with additional fields
        const [users] = await executeQuery(
            `SELECT id, email, name, password, role, avatar_url, xp, level, streak, 
             is_active, last_active, created_at 
             FROM users WHERE email = ?`,
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({
                error: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        const user = users[0];
        
        // Check if account is active
        if (user.is_active === 0) {
            return res.status(403).json({
                error: 'Account is deactivated. Please contact support.',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            // Track failed attempts (optional)
            await executeQuery(
                'UPDATE users SET login_attempts = COALESCE(login_attempts, 0) + 1 WHERE id = ?',
                [user.id]
            );
            
            return res.status(401).json({
                error: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Reset login attempts on successful login
        await executeQuery(
            'UPDATE users SET login_attempts = 0, last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );
        
        // Create JWT token
        const token = generateToken(user.id);
        
        // Remove password from response
        delete user.password;
        delete user.is_active;
        
        // Check and update streak
        const today = new Date().toISOString().split('T')[0];
        const lastActiveDate = user.last_active ? new Date(user.last_active).toISOString().split('T')[0] : null;
        
        if (lastActiveDate !== today) {
            let newStreak = user.streak || 0;
            
            // Check if streak should continue (last active was yesterday)
            if (lastActiveDate) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                
                if (lastActiveDate === yesterdayStr) {
                    newStreak += 1;
                } else {
                    newStreak = 1; // Reset streak
                }
            } else {
                newStreak = 1; // First login
            }
            
            await executeQuery(
                'UPDATE users SET streak = ? WHERE id = ?',
                [newStreak, user.id]
            );
            
            user.streak = newStreak;
            
            // Add XP for streak
            if (newStreak > 1) {
                const xpGained = Math.min(newStreak * 10, 100); // Cap at 100 XP per day
                await executeQuery(
                    'UPDATE users SET xp = xp + ? WHERE id = ?',
                    [xpGained, user.id]
                );
                user.xp += xpGained;
            }
        }
        
        // Create login activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title, description) VALUES (?, ?, ?, ?)',
            [user.id, 'login', 'User Logged In', 'Successfully logged into account']
        );
        
        // Set cookie for web clients
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        
        res.json({
            message: 'Login successful',
            token,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed. Please try again.',
            code: 'LOGIN_FAILED',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Verify token
router.post('/verify', async (req, res) => {
    try {
        const token = req.body.token || req.cookies.token;
        
        if (!token) {
            return res.status(400).json({
                error: 'Token is required',
                code: 'TOKEN_REQUIRED',
                valid: false
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user data
        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak, created_at FROM users WHERE id = ? AND is_active = 1',
            [decoded.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found or account deactivated',
                code: 'USER_NOT_FOUND',
                valid: false
            });
        }
        
        // Update last active if more than 5 minutes ago
        await executeQuery(
            `UPDATE users SET last_active = CURRENT_TIMESTAMP 
             WHERE id = ? AND (last_active IS NULL OR TIMESTAMPDIFF(MINUTE, last_active, CURRENT_TIMESTAMP) > 5)`,
            [decoded.userId]
        );
        
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
            code: 'VERIFICATION_FAILED',
            valid: false
        });
    }
});

// Logout user
router.post('/logout', (req, res) => {
    try {
        // Clear cookie
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        res.json({
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            code: 'LOGOUT_FAILED'
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
        
        // Validate email format
        if (!validateEmail(email)) {
            return res.status(400).json({
                error: 'Please provide a valid email address',
                code: 'INVALID_EMAIL'
            });
        }
        
        // Check if user exists
        const [users] = await executeQuery(
            'SELECT id, email, name FROM users WHERE email = ? AND is_active = 1',
            [email]
        );
        
        if (users.length === 0) {
            // Return success even if user doesn't exist (security best practice)
            return res.json({
                message: 'If an account exists with this email, you will receive a password reset link within 5 minutes.'
            });
        }
        
        const user = users[0];
        
        // Check if recent reset request exists (prevent spam)
        const [recentRequests] = await executeQuery(
            `SELECT created_at FROM password_resets 
             WHERE user_id = ? AND used = 0 
             AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
             LIMIT 1`,
            [user.id]
        );
        
        if (recentRequests.length > 0) {
            return res.status(429).json({
                error: 'A password reset link was already sent recently. Please wait 15 minutes before requesting another.',
                code: 'RESET_TOO_FREQUENT'
            });
        }
        
        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign(
            { userId: user.id, type: 'password_reset' },
            process.env.JWT_SECRET + user.password, // Include password hash in secret to invalidate old tokens
            { expiresIn: '1h' }
        );
        
        // Store reset token in database
        await executeQuery(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
            [user.id, resetToken]
        );
        
        // Generate reset link
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        // Create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'warning', 'Password Reset Requested', 'A password reset has been requested for your account. If you did not request this, please ignore this message or contact support.', 'key']
        );
        
        // Send reset email
        try {
            await sendEmail({
                to: email,
                subject: 'Reset Your TumiCodes Password',
                template: 'password-reset',
                data: {
                    name: user.name,
                    resetLink,
                    expiryTime: '1 hour'
                }
            });
            
            res.json({
                message: 'Password reset link sent to your email'
            });
        } catch (emailError) {
            console.error('Reset email failed:', emailError);
            res.status(500).json({
                error: 'Failed to send reset email. Please try again.',
                code: 'EMAIL_SEND_FAILED'
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
        const { token, newPassword, confirmPassword } = req.body;
        
        if (!token || !newPassword || !confirmPassword) {
            return res.status(400).json({
                error: 'Token, new password and confirmation are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                error: 'Passwords do not match',
                code: 'PASSWORDS_MISMATCH'
            });
        }
        
        // Password validation
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: passwordValidation.message,
                code: 'PASSWORD_VALIDATION_FAILED'
            });
        }
        
        // Verify reset token
        let decoded;
        try {
            // Get user to include password hash in verification
            const [users] = await executeQuery(
                'SELECT id, password FROM users WHERE id = (SELECT user_id FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW())',
                [token]
            );
            
            if (users.length === 0) {
                return res.status(400).json({
                    error: 'Invalid or expired reset token',
                    code: 'INVALID_TOKEN'
                });
            }
            
            const user = users[0];
            
            // Verify token with password hash
            decoded = jwt.verify(token, process.env.JWT_SECRET + user.password);
            
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
            
            // Mark token as used
            await executeQuery(
                'UPDATE password_resets SET used = 1 WHERE token = ?',
                [token]
            );
            
            // Create notification
            await executeQuery(
                'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
                [decoded.userId, 'success', 'Password Updated Successfully', 'Your password has been successfully updated. If you did not make this change, please contact support immediately.', 'check-circle']
            );
            
            // Create activity
            await executeQuery(
                'INSERT INTO activities (user_id, type, title, description) VALUES (?, ?, ?, ?)',
                [decoded.userId, 'profile_updated', 'Password Reset', 'Password was successfully reset']
            );
            
            // Send confirmation email
            try {
                const [userData] = await executeQuery(
                    'SELECT email, name FROM users WHERE id = ?',
                    [decoded.userId]
                );
                
                await sendEmail({
                    to: userData[0].email,
                    subject: 'Password Changed Successfully',
                    template: 'password-changed',
                    data: { name: userData[0].name }
                });
            } catch (emailError) {
                console.error('Confirmation email failed:', emailError);
                // Don't fail the reset if email fails
            }
            
            res.json({
                message: 'Password reset successful. You can now login with your new password.'
            });
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                return res.status(400).json({
                    error: 'Invalid or expired reset token',
                    code: 'INVALID_TOKEN'
                });
            }
            throw error;
        }
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            error: 'Password reset failed',
            code: 'RESET_FAILED'
        });
    }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
    try {
        const oldToken = req.body.token || req.cookies.token;
        
        if (!oldToken) {
            return res.status(400).json({
                error: 'Token is required',
                code: 'TOKEN_REQUIRED'
            });
        }
        
        // Verify old token
        const decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
        
        // Check if user exists and is active
        const [users] = await executeQuery(
            'SELECT id FROM users WHERE id = ? AND is_active = 1',
            [decoded.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found or account deactivated',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Generate new token
        const newToken = generateToken(decoded.userId);
        
        // Update cookie
        res.cookie('token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        
        res.json({
            message: 'Token refreshed successfully',
            token: newToken
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
        }
        
        console.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Token refresh failed',
            code: 'REFRESH_FAILED'
        });
    }
});

module.exports = router;
