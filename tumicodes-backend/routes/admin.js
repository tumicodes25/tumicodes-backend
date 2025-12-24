// routes/admin.js - Admin routes for PostgreSQL
const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/auth');
const { executeQuery } = require('../models/db');
const bcrypt = require('bcryptjs');

// Get all users
router.get('/users', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', role = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT id, email, name, role, avatar_url, xp, level, streak, 
                   last_active, email_verified, created_at, updated_at
            FROM users
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search) {
            query += ` AND (email LIKE $${params.length + 1} OR name LIKE $${params.length + 2})`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            query += ` AND role = $${params.length + 1}`;
            params.push(role);
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const users = await executeQuery(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const countParams = [];
        
        if (search) {
            countQuery += ` AND (email LIKE $${countParams.length + 1} OR name LIKE $${countParams.length + 2})`;
            countParams.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            countQuery += ` AND role = $${countParams.length + 1}`;
            countParams.push(role);
        }
        
        const countResult = await executeQuery(countQuery, countParams);
        
        res.json({
            users: users || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.total || 0,
                pages: Math.ceil((countResult[0]?.total || 0) / limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            error: 'Failed to get users',
            code: 'USERS_FETCH_FAILED'
        });
    }
});

// Get user by ID
router.get('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const users = await executeQuery(
            `SELECT id, email, name, role, avatar_url, bio, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at
             FROM users WHERE id = $1`,
            [req.params.id]
        );
        
        if (!users || users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Get user courses
        const courses = await executeQuery(
            `SELECT c.id, c.title, c.slug, uc.progress, uc.completed, uc.started_at, uc.completed_at
             FROM user_courses uc
             JOIN courses c ON uc.course_id = c.id
             WHERE uc.user_id = $1`,
            [req.params.id]
        );
        
        // Get user projects
        const projects = await executeQuery(
            `SELECT id, title, slug, status, progress, created_at, updated_at
             FROM projects WHERE user_id = $1`,
            [req.params.id]
        );
        
        // Get user certificates
        const certificates = await executeQuery(
            `SELECT id, certificate_id, course_title, issue_date, is_verified
             FROM certificates WHERE user_id = $1`,
            [req.params.id]
        );
        
        res.json({
            user: users[0],
            courses: courses || [],
            projects: projects || [],
            certificates: certificates || []
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to get user',
            code: 'USER_FETCH_FAILED'
        });
    }
});

// Update user
router.put('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const { name, email, role, xp, level, streak, email_verified } = req.body;
        
        // Build update query
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            params.push(name);
            paramIndex++;
        }
        
        if (email !== undefined) {
            updates.push(`email = $${paramIndex}`);
            params.push(email);
            paramIndex++;
        }
        
        if (role !== undefined) {
            updates.push(`role = $${paramIndex}`);
            params.push(role);
            paramIndex++;
        }
        
        if (xp !== undefined) {
            updates.push(`xp = $${paramIndex}`);
            params.push(xp);
            paramIndex++;
        }
        
        if (level !== undefined) {
            updates.push(`level = $${paramIndex}`);
            params.push(level);
            paramIndex++;
        }
        
        if (streak !== undefined) {
            updates.push(`streak = $${paramIndex}`);
            params.push(streak);
            paramIndex++;
        }
        
        if (email_verified !== undefined) {
            updates.push(`email_verified = $${paramIndex}`);
            params.push(email_verified);
            paramIndex++;
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update',
                code: 'NO_UPDATES'
            });
        }
        
        params.push(req.params.id);
        
        await executeQuery(
            `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
            params
        );
        
        // Get updated user
        const users = await executeQuery(
            `SELECT id, email, name, role, avatar_url, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at
             FROM users WHERE id = $1`,
            [req.params.id]
        );
        
        // Send real-time update to user if they're online
        if (global.sendToUser) {
            global.sendToUser(parseInt(req.params.id), 'profile_updated', users[0]);
        }
        
        res.json({
            message: 'User updated successfully',
            user: users[0]
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            error: 'Failed to update user',
            code: 'USER_UPDATE_FAILED'
        });
    }
});

// Delete user
router.delete('/users/:id', authenticateAdmin, async (req, res) => {
    try {
        // Check if user exists
        const users = await executeQuery(
            'SELECT id FROM users WHERE id = $1',
            [req.params.id]
        );
        
        if (!users || users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Don't allow deleting yourself
        if (parseInt(req.params.id) === req.user.id) {
            return res.status(400).json({
                error: 'Cannot delete your own account',
                code: 'SELF_DELETE_NOT_ALLOWED'
            });
        }
        
        // Delete user (cascade will handle related records)
        await executeQuery('DELETE FROM users WHERE id = $1', [req.params.id]);
        
        res.json({
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            code: 'USER_DELETE_FAILED'
        });
    }
});

// Create new user
router.post('/users', authenticateAdmin, async (req, res) => {
    try {
        const { email, name, password, role = 'user' } = req.body;
        
        // Validation
        if (!email || !password || !name) {
            return res.status(400).json({
                error: 'Email, password, and name are required',
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
        const existingUsers = await executeQuery(
            'SELECT id FROM users WHERE email = $1',
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
        const result = await executeQuery(
            'INSERT INTO users (email, name, password, role, email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [email, name, hashedPassword, role, true]
        );
        
        const userId = result[0]?.id;
        
        // Get created user
        const users = await executeQuery(
            `SELECT id, email, name, role, avatar_url, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at
             FROM users WHERE id = $1`,
            [userId]
        );
        
        // Create welcome notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES ($1, $2, $3, $4, $5)',
            [userId, 'info', 'Account Created', 'Your account has been created by an administrator.', 'user-plus']
        );
        
        res.status(201).json({
            message: 'User created successfully',
            user: users[0]
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            error: 'Failed to create user',
            code: 'USER_CREATE_FAILED'
        });
    }
});

// Get system statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        // Get counts in parallel
        const [
            totalUsers,
            activeUsers,
            adminUsers,
            totalCourses,
            publishedCourses,
            totalEnrollments,
            completedCourses,
            totalCertificates,
            totalProjects,
            totalPayments,
            revenue
        ] = await Promise.all([
            executeQuery('SELECT COUNT(*) as count FROM users'),
            executeQuery('SELECT COUNT(*) as count FROM users WHERE last_active >= NOW() - INTERVAL \'7 days\''),
            executeQuery('SELECT COUNT(*) as count FROM users WHERE role = \'admin\''),
            executeQuery('SELECT COUNT(*) as count FROM courses'),
            executeQuery('SELECT COUNT(*) as count FROM courses WHERE is_published = true'),
            executeQuery('SELECT COUNT(*) as count FROM user_courses'),
            executeQuery('SELECT COUNT(*) as count FROM user_courses WHERE completed = true'),
            executeQuery('SELECT COUNT(*) as count FROM certificates'),
            executeQuery('SELECT COUNT(*) as count FROM projects'),
            executeQuery('SELECT COUNT(*) as count FROM payments WHERE status = \'completed\''),
            executeQuery('SELECT SUM(amount) as total FROM payments WHERE status = \'completed\'')
        ]);
        
        // Get recent users (last 7 days)
        const recentUsers = await executeQuery(
            `SELECT id, email, name, role, created_at 
             FROM users 
             WHERE created_at >= NOW() - INTERVAL '7 days'
             ORDER BY created_at DESC 
             LIMIT 10`
        );
        
        // Get popular courses
        const popularCourses = await executeQuery(
            `SELECT c.id, c.title, c.slug, c.total_students, c.rating, 
                    COUNT(uc.id) as recent_enrollments
             FROM courses c
             LEFT JOIN user_courses uc ON c.id = uc.course_id AND uc.started_at >= NOW() - INTERVAL '7 days'
             WHERE c.is_published = true
             GROUP BY c.id
             ORDER BY c.total_students DESC
             LIMIT 10`
        );
        
        // Get daily user registrations (last 30 days)
        const dailyRegistrations = await executeQuery(
            `SELECT DATE(created_at) as date, COUNT(*) as count
             FROM users
             WHERE created_at >= NOW() - INTERVAL '30 days'
             GROUP BY DATE(created_at)
             ORDER BY date`
        );
        
        res.json({
            users: {
                total: totalUsers[0]?.count || 0,
                active: activeUsers[0]?.count || 0,
                admins: adminUsers[0]?.count || 0,
                recent: recentUsers || []
            },
            courses: {
                total: totalCourses[0]?.count || 0,
                published: publishedCourses[0]?.count || 0,
                enrollments: totalEnrollments[0]?.count || 0,
                completed: completedCourses[0]?.count || 0,
                popular: popularCourses || []
            },
            certificates: totalCertificates[0]?.count || 0,
            projects: totalProjects[0]?.count || 0,
            payments: {
                total: totalPayments[0]?.count || 0,
                revenue: revenue[0]?.total || 0
            },
            analytics: {
                daily_registrations: dailyRegistrations || []
            }
        });
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({
            error: 'Failed to get statistics',
            code: 'ADMIN_STATS_FETCH_FAILED'
        });
    }
});

// IMPORTANT: You need to update the rest of your admin.js file similarly
// The other routes (notifications/broadcast, courses, payments) also need conversion

// For now, let's add a simple test route at the root
router.get('/', authenticateAdmin, (req, res) => {
    res.json({
        message: 'Admin API is working',
        endpoints: [
            { path: '/users', method: 'GET', description: 'Get all users' },
            { path: '/users/:id', method: 'GET', description: 'Get user by ID' },
            { path: '/stats', method: 'GET', description: 'Get system statistics' },
            { path: '/courses', method: 'GET', description: 'Get all courses' },
            { path: '/payments', method: 'GET', description: 'Get all payments' }
        ]
    });
});

module.exports = router;
