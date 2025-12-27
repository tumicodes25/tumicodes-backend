// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../models/db');
const { validateEmail, validatePassword } = require('../utils/validators');

// JWT helper
const generateToken = (userId, expiresIn = '7d') => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
};

class AuthController {
    // =============================
    // REGISTER
    // =============================
    static async register(req, res) {
        try {
            const { email, name, password } = req.body;

            if (!email || !name || !password) {
                return res.status(400).json({
                    error: 'Name, email and password are required',
                    code: 'VALIDATION_ERROR'
                });
            }

            if (!validateEmail(email)) {
                return res.status(400).json({
                    error: 'Invalid email address',
                    code: 'INVALID_EMAIL'
                });
            }

            const passwordCheck = validatePassword(password);
            if (!passwordCheck.valid) {
                return res.status(400).json({
                    error: passwordCheck.message,
                    code: 'PASSWORD_VALIDATION_FAILED'
                });
            }

            // Check existing user
            const existing = await executeQuery(
                'SELECT id FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (existing.rows.length > 0) {
                return res.status(409).json({
                    error: 'User already exists',
                    code: 'USER_EXISTS'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const result = await executeQuery(
                `INSERT INTO users (email, name, password, role, xp, level, streak, avatar_url)
                 VALUES ($1, $2, $3, 'user', 0, 1, 0, $4)
                 RETURNING id, email, name, role, xp, level, streak, avatar_url, created_at`,
                [
                    email.toLowerCase(),
                    name,
                    hashedPassword,
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
                ]
            );

            const user = result.rows[0];
            const token = generateToken(user.id);

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.status(201).json({
                message: 'Registration successful',
                token,
                user
            });

        } catch (error) {
            console.error('REGISTER ERROR:', error);
            res.status(500).json({
                error: 'Registration failed',
                code: 'REGISTRATION_FAILED'
            });
        }
    }

    // =============================
    // LOGIN
    // =============================
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    error: 'Email and password are required',
                    code: 'VALIDATION_ERROR'
                });
            }

            const result = await executeQuery(
                `SELECT id, email, name, password, role, xp, level, streak, avatar_url, last_active
                 FROM users WHERE email = $1`,
                [email.toLowerCase()]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    error: 'Invalid email or password',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            const user = result.rows[0];
            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                return res.status(401).json({
                    error: 'Invalid email or password',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            await executeQuery(
                'UPDATE users SET last_active = NOW() WHERE id = $1',
                [user.id]
            );

            const token = generateToken(user.id);
            delete user.password;

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.json({
                message: 'Login successful',
                token,
                user
            });

        } catch (error) {
            console.error('LOGIN ERROR:', error);
            res.status(500).json({
                error: 'Login failed',
                code: 'LOGIN_FAILED'
            });
        }
    }

    // =============================
    // VERIFY TOKEN
    // =============================
    static async verify(req, res) {
        try {
            const token = req.body.token || req.cookies.token;

            if (!token) {
                return res.json({ valid: false });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const result = await executeQuery(
                'SELECT id, email, name, role, xp, level, streak, avatar_url FROM users WHERE id = $1',
                [decoded.userId]
            );

            if (result.rows.length === 0) {
                return res.json({ valid: false });
            }

            res.json({
                valid: true,
                user: result.rows[0]
            });

        } catch {
            res.json({ valid: false });
        }
    }

    // =============================
    // LOGOUT
    // =============================
    static logout(req, res) {
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        res.json({ message: 'Logged out successfully' });
    }
}

module.exports = AuthController;
