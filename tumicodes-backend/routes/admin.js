// routes/admin.js - Admin routes
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
            query += ' AND (email LIKE ? OR name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            query += ' AND role = ?';
            params.push(role);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [users] = await executeQuery(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const countParams = [];
        
        if (search) {
            countQuery += ' AND (email LIKE ? OR name LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            countQuery += ' AND role = ?';
            countParams.push(role);
        }
        
        const [countResult] = await executeQuery(countQuery, countParams);
        
        res.json({
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
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
        const [users] = await executeQuery(
            `SELECT id, email, name, role, avatar_url, bio, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at
             FROM users WHERE id = ?`,
            [req.params.id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Get user courses
        const [courses] = await executeQuery(
            `SELECT c.id, c.title, c.slug, uc.progress, uc.completed, uc.started_at, uc.completed_at
             FROM user_courses uc
             JOIN courses c ON uc.course_id = c.id
             WHERE uc.user_id = ?`,
            [req.params.id]
        );
        
        // Get user projects
        const [projects] = await executeQuery(
            `SELECT id, title, slug, status, progress, created_at, updated_at
             FROM projects WHERE user_id = ?`,
            [req.params.id]
        );
        
        // Get user certificates
        const [certificates] = await executeQuery(
            `SELECT id, certificate_id, course_title, issue_date, is_verified
             FROM certificates WHERE user_id = ?`,
            [req.params.id]
        );
        
        res.json({
            user: users[0],
            courses,
            projects,
            certificates
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
        
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }
        
        if (role !== undefined) {
            updates.push('role = ?');
            params.push(role);
        }
        
        if (xp !== undefined) {
            updates.push('xp = ?');
            params.push(xp);
        }
        
        if (level !== undefined) {
            updates.push('level = ?');
            params.push(level);
        }
        
        if (streak !== undefined) {
            updates.push('streak = ?');
            params.push(streak);
        }
        
        if (email_verified !== undefined) {
            updates.push('email_verified = ?');
            params.push(email_verified);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update',
                code: 'NO_UPDATES'
            });
        }
        
        params.push(req.params.id);
        
        await executeQuery(
            `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params
        );
        
        // Get updated user
        const [users] = await executeQuery(
            `SELECT id, email, name, role, avatar_url, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at
             FROM users WHERE id = ?`,
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
        const [users] = await executeQuery(
            'SELECT id FROM users WHERE id = ?',
            [req.params.id]
        );
        
        if (users.length === 0) {
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
        await executeQuery('DELETE FROM users WHERE id = ?', [req.params.id]);
        
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
            'INSERT INTO users (email, name, password, role, email_verified) VALUES (?, ?, ?, ?, ?)',
            [email, name, hashedPassword, role, true]
        );
        
        // Get created user
        const [users] = await executeQuery(
            `SELECT id, email, name, role, avatar_url, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at
             FROM users WHERE id = ?`,
            [result.insertId]
        );
        
        // Create welcome notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [result.insertId, 'info', 'Account Created', 'Your account has been created by an administrator.', 'user-plus']
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
            [totalUsers],
            [activeUsers],
            [adminUsers],
            [totalCourses],
            [publishedCourses],
            [totalEnrollments],
            [completedCourses],
            [totalCertificates],
            [totalProjects],
            [totalPayments],
            [revenue]
        ] = await Promise.all([
            executeQuery('SELECT COUNT(*) as count FROM users'),
            executeQuery('SELECT COUNT(*) as count FROM users WHERE last_active >= DATE_SUB(NOW(), INTERVAL 7 DAY)'),
            executeQuery('SELECT COUNT(*) as count FROM users WHERE role = "admin"'),
            executeQuery('SELECT COUNT(*) as count FROM courses'),
            executeQuery('SELECT COUNT(*) as count FROM courses WHERE is_published = TRUE'),
            executeQuery('SELECT COUNT(*) as count FROM user_courses'),
            executeQuery('SELECT COUNT(*) as count FROM user_courses WHERE completed = TRUE'),
            executeQuery('SELECT COUNT(*) as count FROM certificates'),
            executeQuery('SELECT COUNT(*) as count FROM projects'),
            executeQuery('SELECT COUNT(*) as count FROM payments WHERE status = "completed"'),
            executeQuery('SELECT SUM(amount) as total FROM payments WHERE status = "completed"')
        ]);
        
        // Get recent users (last 7 days)
        const [recentUsers] = await executeQuery(
            `SELECT id, email, name, role, created_at 
             FROM users 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             ORDER BY created_at DESC 
             LIMIT 10`
        );
        
        // Get popular courses
        const [popularCourses] = await executeQuery(
            `SELECT c.id, c.title, c.slug, c.total_students, c.rating, 
                    COUNT(uc.id) as recent_enrollments
             FROM courses c
             LEFT JOIN user_courses uc ON c.id = uc.course_id AND uc.started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             WHERE c.is_published = TRUE
             GROUP BY c.id
             ORDER BY c.total_students DESC
             LIMIT 10`
        );
        
        // Get daily user registrations (last 30 days)
        const [dailyRegistrations] = await executeQuery(
            `SELECT DATE(created_at) as date, COUNT(*) as count
             FROM users
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at)
             ORDER BY date`
        );
        
        res.json({
            users: {
                total: totalUsers[0].count,
                active: activeUsers[0].count,
                admins: adminUsers[0].count,
                recent: recentUsers
            },
            courses: {
                total: totalCourses[0].count,
                published: publishedCourses[0].count,
                enrollments: totalEnrollments[0].count,
                completed: completedCourses[0].count,
                popular: popularCourses
            },
            certificates: totalCertificates[0].count,
            projects: totalProjects[0].count,
            payments: {
                total: totalPayments[0].count,
                revenue: revenue[0].total || 0
            },
            analytics: {
                daily_registrations: dailyRegistrations
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

// Send notification to all users
router.post('/notifications/broadcast', authenticateAdmin, async (req, res) => {
    try {
        const { title, message, type = 'info', icon = 'megaphone' } = req.body;
        
        if (!title || !message) {
            return res.status(400).json({
                error: 'Title and message are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Get all users
        const [users] = await executeQuery('SELECT id FROM users');
        
        if (users.length === 0) {
            return res.json({
                message: 'No users to notify',
                notified: 0
            });
        }
        
        // Prepare notifications
        const notifications = users.map(user => [
            user.id, type, title, message, icon
        ]);
        
        // Insert all notifications at once
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES ?',
            [notifications]
        );
        
        // Send real-time notifications
        users.forEach(user => {
            if (global.sendToUser) {
                global.sendToUser(user.id, 'notification', {
                    type,
                    title,
                    message,
                    icon,
                    created_at: new Date().toISOString()
                });
            }
        });
        
        res.json({
            message: 'Notification sent to all users',
            notified: users.length
        });
    } catch (error) {
        console.error('Broadcast notification error:', error);
        res.status(500).json({
            error: 'Failed to send notification',
            code: 'BROADCAST_FAILED'
        });
    }
});

// Get all courses with details
router.get('/courses', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT c.*, u.name as instructor_name, u.email as instructor_email,
                   COUNT(uc.id) as total_enrollments,
                   SUM(CASE WHEN uc.completed = TRUE THEN 1 ELSE 0 END) as completions,
                   AVG(uc.rating) as avg_rating
            FROM courses c
            LEFT JOIN users u ON c.instructor_id = u.id
            LEFT JOIN user_courses uc ON c.id = uc.course_id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search) {
            query += ' AND (c.title LIKE ? OR c.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (status === 'published') {
            query += ' AND c.is_published = TRUE';
        } else if (status === 'draft') {
            query += ' AND c.is_published = FALSE';
        }
        
        query += ' GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [courses] = await executeQuery(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM courses WHERE 1=1';
        const countParams = [];
        
        if (search) {
            countQuery += ' AND (title LIKE ? OR description LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        
        if (status === 'published') {
            countQuery += ' AND is_published = TRUE';
        } else if (status === 'draft') {
            countQuery += ' AND is_published = FALSE';
        }
        
        const [countResult] = await executeQuery(countQuery, countParams);
        
        res.json({
            courses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Get admin courses error:', error);
        res.status(500).json({
            error: 'Failed to get courses',
            code: 'ADMIN_COURSES_FETCH_FAILED'
        });
    }
});

// Update course
router.put('/courses/:id', authenticateAdmin, async (req, res) => {
    try {
        const {
            title, description, short_description, category, difficulty,
            price, discounted_price, thumbnail_url, is_published, is_featured
        } = req.body;
        
        // Build update query
        const updates = [];
        const params = [];
        
        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }
        
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        
        if (short_description !== undefined) {
            updates.push('short_description = ?');
            params.push(short_description);
        }
        
        if (category !== undefined) {
            updates.push('category = ?');
            params.push(category);
        }
        
        if (difficulty !== undefined) {
            updates.push('difficulty = ?');
            params.push(difficulty);
        }
        
        if (price !== undefined) {
            updates.push('price = ?');
            params.push(price);
        }
        
        if (discounted_price !== undefined) {
            updates.push('discounted_price = ?');
            params.push(discounted_price);
        }
        
        if (thumbnail_url !== undefined) {
            updates.push('thumbnail_url = ?');
            params.push(thumbnail_url);
        }
        
        if (is_published !== undefined) {
            updates.push('is_published = ?');
            params.push(is_published);
        }
        
        if (is_featured !== undefined) {
            updates.push('is_featured = ?');
            params.push(is_featured);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update',
                code: 'NO_UPDATES'
            });
        }
        
        params.push(req.params.id);
        
        await executeQuery(
            `UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params
        );
        
        // Get updated course
        const [courses] = await executeQuery(
            'SELECT * FROM courses WHERE id = ?',
            [req.params.id]
        );
        
        res.json({
            message: 'Course updated successfully',
            course: courses[0]
        });
    } catch (error) {
        console.error('Update course error:', error);
        res.status(500).json({
            error: 'Failed to update course',
            code: 'COURSE_UPDATE_FAILED'
        });
    }
});

// Get all payments
router.get('/payments', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status = '', start_date = '', end_date = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT p.*, u.email as user_email, u.name as user_name,
                   c.title as course_title, c.slug as course_slug
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN courses c ON p.course_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }
        
        if (start_date) {
            query += ' AND p.created_at >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND p.created_at <= ?';
            params.push(end_date + ' 23:59:59');
        }
        
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [payments] = await executeQuery(query, params);
        
        // Get total count and revenue
        let statsQuery = 'SELECT COUNT(*) as total, SUM(amount) as revenue FROM payments WHERE 1=1';
        const statsParams = [];
        
        if (status) {
            statsQuery += ' AND status = ?';
            statsParams.push(status);
        }
        
        if (start_date) {
            statsQuery += ' AND created_at >= ?';
            statsParams.push(start_date);
        }
        
        if (end_date) {
            statsQuery += ' AND created_at <= ?';
            statsParams.push(end_date + ' 23:59:59');
        }
        
        const [stats] = await executeQuery(statsQuery, statsParams);
        
        res.json({
            payments,
            stats: {
                total: stats[0].total,
                revenue: stats[0].revenue || 0
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: stats[0].total,
                pages: Math.ceil(stats[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({
            error: 'Failed to get payments',
            code: 'PAYMENTS_FETCH_FAILED'
        });
    }
});

module.exports = router;