const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../auth');

// Get notifications
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ? AND user_type = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id, req.user.role);

    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND user_type = ? AND is_read = 0
    `).get(req.user.id, req.user.role);

    res.json({ notifications, unread_count: unreadCount.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all as read
router.put('/read-all', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND user_type = ?').run(req.user.id, req.user.role);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
