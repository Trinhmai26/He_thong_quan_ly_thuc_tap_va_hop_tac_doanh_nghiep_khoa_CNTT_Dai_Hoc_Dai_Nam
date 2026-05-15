'use strict';

/**
 * Zalo Message Queue Service
 * Quản lý hàng đợi tin nhắn Zalo, tránh xung đột khi nhiều giảng viên
 * gửi đồng thời qua cùng 1 tài khoản Zalo cá nhân.
 */

const db = require('../database/connection');

// ─── Tạo bảng hàng đợi ───────────────────────────────────────────────────────

async function ensureQueueTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS zalo_message_queue (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      lecturer_id   INT          NULL,
      student_id    INT          NOT NULL,
      phone         VARCHAR(20)  NULL,
      title         VARCHAR(255) NOT NULL,
      message       TEXT         NOT NULL,
      type          ENUM('new_report_period','new_diary_period','deadline_24h_reminder','manual') NOT NULL,
      related_id    INT          NULL,
      status        ENUM('pending','processing','sent','failed','cancelled') DEFAULT 'pending',
      priority      INT          DEFAULT 5,
      scheduled_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
      sent_at       DATETIME     NULL,
      failed_reason TEXT         NULL,
      retry_count   INT          DEFAULT 0,
      created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_msg (student_id, type, related_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ─── Thêm 1 tin nhắn vào hàng đợi ────────────────────────────────────────────

async function enqueueMessage({
  lecturerId  = null,
  studentId,
  phone       = null,
  title,
  message,
  type,
  relatedId   = null,
  scheduledAt = null,
  priority    = 5,
}) {
  try {
    await db.query(
      `INSERT IGNORE INTO zalo_message_queue
         (lecturer_id, student_id, phone, title, message, type, related_id,
          status, priority, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW(), NOW())`,
      [
        lecturerId,
        studentId,
        phone,
        title,
        message,
        type,
        relatedId,
        priority,
        scheduledAt ? new Date(scheduledAt) : new Date(),
      ]
    );
  } catch (err) {
    // Lỗi INSERT IGNORE vẫn log nếu không phải duplicate key
    if (!err.message?.includes('Duplicate')) {
      console.warn('[ZaloQueue] enqueueMessage error:', err.message);
    }
  }
}

// ─── Thêm nhiều tin nhắn (batch) ─────────────────────────────────────────────

async function enqueueBatch(messages) {
  let count = 0;
  for (const msg of messages) {
    await enqueueMessage(msg);
    count++;
  }
  return count;
}

// ─── Lấy trạng thái hàng đợi (debug/admin) ───────────────────────────────────

async function getQueueStats() {
  const rows = await db.query(`
    SELECT status, COUNT(*) AS cnt
    FROM zalo_message_queue
    GROUP BY status
  `);
  return Object.fromEntries(rows.map(r => [r.status, r.cnt]));
}

module.exports = { ensureQueueTable, enqueueMessage, enqueueBatch, getQueueStats };
