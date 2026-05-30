'use strict';

/**
 * Zalo Worker Service
 * Lấy tin nhắn từ hàng đợi, gửi tuần tự qua Flask Zalo Local Service.
 * - Chỉ lấy BATCH_SIZE = 3 tin/lần để tránh spam
 * - Delay SEND_DELAY_MS = 4 giây giữa mỗi tin
 * - Retry tối đa MAX_RETRIES = 3 lần, lùi lịch RETRY_MINUTES = 5 phút
 * - deadline_24h_reminder: kiểm tra sinh viên đã nộp trước khi gửi
 */

const axios = require('axios');
const db    = require('../database/connection');

const FLASK_URL      = () => (process.env.ZALO_LOCAL_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');
const BATCH_SIZE     = 3;
const SEND_DELAY_MS  = 4000;
const MAX_RETRIES    = 3;
const RETRY_MINUTES  = 5;

// ─── Entry point cho cron job ─────────────────────────────────────────────────

async function processQueue() {
  let messages;
  try {
    messages = await db.query(`
      SELECT *
      FROM zalo_message_queue
      WHERE status = 'pending'
        AND scheduled_at <= NOW()
      ORDER BY priority ASC, scheduled_at ASC, created_at ASC
      LIMIT ${BATCH_SIZE}
    `);
  } catch (err) {
    console.error('[ZaloWorker] Không đọc được queue:', err.message);
    return;
  }

  if (!messages.length) return;

  console.log(`[ZaloWorker] Xử lý ${messages.length} tin nhắn...`);

  for (let i = 0; i < messages.length; i++) {
    await _processOne(messages[i]);
    if (i < messages.length - 1) {
      await _delay(SEND_DELAY_MS);
    }
  }
}

// ─── Xử lý 1 tin nhắn ────────────────────────────────────────────────────────

async function _processOne(msg) {
  // 1. Đánh dấu processing
  try {
    await db.query(
      `UPDATE zalo_message_queue SET status = 'processing', updated_at = NOW() WHERE id = ?`,
      [msg.id]
    );
  } catch (err) {
    console.error(`[ZaloWorker] Không mark processing msg#${msg.id}:`, err.message);
    return;
  }

  // 2. Nếu là nhắc hạn: kiểm tra sinh viên đã nộp chưa → cancelled nếu đã nộp
  if (msg.type === 'deadline_24h_reminder' && msg.related_id) {
    const cancelled = await _cancelIfSubmitted(msg);
    if (cancelled) return;
  }

  // 3. Lấy SĐT và zalo_user_id
  const phone      = await _resolvePhone(msg);
  const zaloUserId = await _resolveZaloUserId(msg);

  if (!phone && !zaloUserId) {
    await _markFailed(msg.id, msg.retry_count, 'Không có số điện thoại hoặc zalo_user_id');
    return;
  }

  // 4. Gọi Flask /send-message — ưu tiên zaloUserId (không cần kết bạn)
  let success = false;
  let failReason = '';
  try {
    const payload = { title: msg.title, message: msg.message };
    if (zaloUserId) payload.zaloUserId = zaloUserId;
    if (phone)      payload.phone      = phone;

    const resp = await axios.post(
      `${FLASK_URL()}/send-message`,
      payload,
      { timeout: 30000, validateStatus: () => true }
    );
    success    = resp.data?.success === true;
    failReason = resp.data?.message || (success ? '' : `Flask HTTP ${resp.status}`);
  } catch (err) {
    failReason = err.message;
  }

  // 5. Cập nhật kết quả
  if (success) {
    await db.query(
      `UPDATE zalo_message_queue SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [msg.id]
    );
    console.log(`[ZaloWorker] ✅ Msg#${msg.id} SV#${msg.student_id} (${phone})`);
  } else {
    await _markFailed(msg.id, msg.retry_count, failReason);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _cancelIfSubmitted(msg) {
  try {
    const sv = await db.query('SELECT ma_sinh_vien FROM sinh_vien WHERE id = ? LIMIT 1', [msg.student_id]);
    if (!sv.length) return false;

    const done = await db.query(
      'SELECT id FROM bai_nop_cua_sinh_vien WHERE slot_id = ? AND ma_sinh_vien = ? LIMIT 1',
      [msg.related_id, sv[0].ma_sinh_vien]
    );
    if (done.length) {
      await db.query(
        `UPDATE zalo_message_queue SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [msg.id]
      );
      console.log(`[ZaloWorker] Msg#${msg.id} cancelled — SV#${msg.student_id} đã nộp bài`);
      return true;
    }
  } catch { /* ignore, tiếp tục gửi */ }
  return false;
}

async function _resolvePhone(msg) {
  const p = msg.phone?.trim();
  if (p) return p;
  try {
    const rows = await db.query('SELECT so_dien_thoai FROM sinh_vien WHERE id = ? LIMIT 1', [msg.student_id]);
    return rows[0]?.so_dien_thoai?.trim() || null;
  } catch { return null; }
}

async function _resolveZaloUserId(msg) {
  if (!msg.student_id) return null;
  try {
    const rows = await db.query('SELECT zalo_user_id FROM sinh_vien WHERE id = ? LIMIT 1', [msg.student_id]);
    return rows[0]?.zalo_user_id?.trim() || null;
  } catch { return null; }
}

async function _markFailed(msgId, currentRetry, reason) {
  const newRetry = (currentRetry || 0) + 1;
  if (newRetry < MAX_RETRIES) {
    await db.query(
      `UPDATE zalo_message_queue
       SET status = 'pending', retry_count = ?, failed_reason = ?,
           scheduled_at = NOW() + INTERVAL ${RETRY_MINUTES} MINUTE, updated_at = NOW()
       WHERE id = ?`,
      [newRetry, reason, msgId]
    );
    console.warn(`[ZaloWorker] ⚠️ Msg#${msgId} retry ${newRetry}/${MAX_RETRIES}: ${reason}`);
  } else {
    await db.query(
      `UPDATE zalo_message_queue
       SET status = 'failed', retry_count = ?, failed_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [newRetry, reason, msgId]
    );
    console.error(`[ZaloWorker] ❌ Msg#${msgId} failed permanently: ${reason}`);
  }
}

const _delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = { processQueue };
