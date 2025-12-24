// routes/notifications.js - Notification routes for PostgreSQL
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { executeQuery } = require('../models/db');

// Notification Controller functions
const NotificationController = {
    // Get notifications
    getNotifications: async (req, res) => {
        try {
            const { limit = 50, offset = 0, unread_only = false } = req.query;
            
            let query = `SELECT id, type, title, message, icon, data, is_read, created_at, read_at 
                         FROM notifications WHERE user_id = $1`;
            const params = [req.user.id];
            let paramIndex = 2;
            
            if (unread_only === 'true') {
                query += ` AND is_read = false`;
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(parseInt(limit), parseInt(offset));
            
            const notifications = await executeQuery(query, params);
            
            // Get unread count
            const unreadCount = await executeQuery(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
                [req.user.id]
            );
            
            res.json({
                notifications: notifications || [],
                unread_count: unreadCount[0]?.count || 0,
                total: notifications?.length || 0
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                error: 'Failed to get notifications',
                code: 'NOTIFICATIONS_FETCH_FAILED'
            });
        }
    },

    // Mark notification as read
    markAsRead: async (req, res) => {
        try {
            await executeQuery(
                'UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'notification_read', { id: req.params.id });
            }
            
            res.json({
                message: 'Notification marked as read'
            });
        } catch (error) {
            console.error('Mark notification read error:', error);
            res.status(500).json({
                error: 'Failed to mark notification as read',
                code: 'NOTIFICATION_UPDATE_FAILED'
            });
        }
    },

    // Mark all notifications as read
    markAllAsRead: async (req, res) => {
        try {
            await executeQuery(
                'UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND is_read = false',
                [req.user.id]
            );
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'all_notifications_read', {});
            }
            
            res.json({
                message: 'All notifications marked as read'
            });
        } catch (error) {
            console.error('Mark all notifications read error:', error);
            res.status(500).json({
                error: 'Failed to mark notifications as read',
                code: 'NOTIFICATIONS_UPDATE_FAILED'
            });
        }
    },

    // Create notification (admin or system use)
    createNotification: async (req, res) => {
        try {
            const { user_id, type = 'info', title, message, icon = 'bell', data } = req.body;
            
            if (!user_id || !title || !message) {
                return res.status(400).json({
                    error: 'User ID, title, and message are required',
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Check if user exists
            const users = await executeQuery(
                'SELECT id FROM users WHERE id = $1',
                [user_id]
            );
            
            if (!users || users.length === 0) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            // Create notification
            const result = await executeQuery(
                `INSERT INTO notifications (user_id, type, title, message, icon, data) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [user_id, type, title, message, icon, data || null]
            );
            
            // Get created notification
            const notifications = await executeQuery(
                'SELECT * FROM notifications WHERE id = $1',
                [result[0]?.id]
            );
            
            // Send real-time notification
            if (global.sendToUser) {
                global.sendToUser(user_id, 'notification', notifications[0]);
            }
            
            res.status(201).json({
                message: 'Notification created successfully',
                notification: notifications[0]
            });
        } catch (error) {
            console.error('Create notification error:', error);
            res.status(500).json({
                error: 'Failed to create notification',
                code: 'NOTIFICATION_CREATE_FAILED'
            });
        }
    },

    // Delete notification
    deleteNotification: async (req, res) => {
        try {
            // Check if notification exists and belongs to user
            const notifications = await executeQuery(
                'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
            
            if (!notifications || notifications.length === 0) {
                return res.status(404).json({
                    error: 'Notification not found',
                    code: 'NOTIFICATION_NOT_FOUND'
                });
            }
            
            // Delete notification
            await executeQuery(
                'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
            
            res.json({
                message: 'Notification deleted successfully'
            });
        } catch (error) {
            console.error('Delete notification error:', error);
            res.status(500).json({
                error: 'Failed to delete notification',
                code: 'NOTIFICATION_DELETE_FAILED'
            });
        }
    },

    // Get notification preferences
    getPreferences: async (req, res) => {
        try {
            // Get user's notification preferences
            // In a real app, you'd have a separate preferences table
            // For now, return default preferences
            const defaultPreferences = {
                email_notifications: true,
                push_notifications: true,
                course_updates: true,
                achievement_alerts: true,
                project_updates: true,
                community_messages: true,
                marketing_emails: false
            };
            
            // Check if user has saved preferences
            const preferences = await executeQuery(
                'SELECT notification_preferences FROM users WHERE id = $1',
                [req.user.id]
            );
            
            if (preferences[0]?.notification_preferences) {
                res.json(preferences[0].notification_preferences);
            } else {
                res.json(defaultPreferences);
            }
        } catch (error) {
            console.error('Get preferences error:', error);
            res.status(500).json({
                error: 'Failed to get preferences',
                code: 'PREFERENCES_FETCH_FAILED'
            });
        }
    },

    // Update notification preferences
    updatePreferences: async (req, res) => {
        try {
            const preferences = req.body;
            
            // Validate preferences object
            if (!preferences || typeof preferences !== 'object') {
                return res.status(400).json({
                    error: 'Invalid preferences format',
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Update user preferences
            await executeQuery(
                'UPDATE users SET notification_preferences = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [preferences, req.user.id]
            );
            
            res.json({
                message: 'Notification preferences updated successfully',
                preferences
            });
        } catch (error) {
            console.error('Update preferences error:', error);
            res.status(500).json({
                error: 'Failed to update preferences',
                code: 'PREFERENCES_UPDATE_FAILED'
            });
        }
    }
};

// Apply authentication middleware
router.use(authenticateToken);

// Routes
router.get('/', NotificationController.getNotifications);
router.post('/:id/read', NotificationController.markAsRead);
router.post('/read-all', NotificationController.markAllAsRead);
router.post('/', NotificationController.createNotification);
router.delete('/:id', NotificationController.deleteNotification);
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);

module.exports = router;
