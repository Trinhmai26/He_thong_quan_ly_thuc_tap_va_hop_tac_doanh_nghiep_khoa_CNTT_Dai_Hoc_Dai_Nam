'use strict';

/**
 * Deadline Reminder Service
 * Quét các đợt nộp sắp hết hạn trong 23–25h tới và đưa vào hàng đợi Zalo.
 * KHÔNG gửi Zalo trực tiếp — chỉ INSERT vào zalo_message_queue.
 * Worker (zaloWorker.js) sẽ gửi tuần tự qua Flask.
 */

const db            = require('../database/connection');
const { enqueueMessage } = require('./zaloQueue');

const WINDOW_START = 23; // giờ trước deadline
const WINDOW_END   = 25; // giờ trước deadline (buffer)

// ─── Tạo bảng lưu lịch sử (để tránh insert duplicate khi cron chạy lại) ──────

async function ensureReminderTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS deadline_reminders (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      submission_period_id INT          NOT NULL,
      student_id           INT          NOT NULL,
      type                 ENUM('report','diary') NOT NULL,
      reminder_type        VARCHAR(50)  NOT NULL DEFAULT 'before_24h',
      sent_at              DATETIME     DEFAULT CURRENT_TIMESTAMP,
      created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_reminder (submission_period_id, student_id, type, reminder_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ─── Hàm chính: quét deadline và đưa vào queue ───────────────────────────────

async function remindStudentsBeforeDeadline() {
  try {
    // Đợt nộp có deadline còn 23–25 giờ tới
    const slots = await db.query(`
      SELECT id, ma_giang_vien, tieu_de, loai_bao_cao, end_at
      FROM dot_nop_bao_cao_theo_tuan
      WHERE end_at >= NOW() + INTERVAL ${WINDOW_START} HOUR
        AND end_at <  NOW() + INTERVAL ${WINDOW_END}  HOUR
    `);

    if (!slots.length) return;

    console.log(`[Reminder] ${slots.length} đợt sắp hết hạn — đang queue nhắc 24h...`);

    for (const slot of slots) {
      await _enqueueRemindersForSlot(slot);
    }
  } catch (err) {
    console.error('[Reminder] Lỗi khi quét deadline:', err.message);
  }
}

// ─── Đưa nhắc hạn vào queue cho 1 đợt ───────────────────────────────────────

function _fmtDate(dt) {
  if (!dt) return 'chưa xác định';
  try {
    return new Date(dt).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return String(dt); }
}

async function _enqueueRemindersForSlot(slot) {
  const typeName = slot.loai_bao_cao === 'tuan' ? 'nhật ký thực tập' : 'báo cáo thực tập';
  const endFmt   = _fmtDate(slot.end_at);

  // giang_vien_huong_dan lưu ho_ten của GV → JOIN để lấy ho_ten từ ma_giang_vien
  // Lấy thêm sv.ho_ten để cá nhân hoá tin nhắn
  const students = await db.query(`
    SELECT sv.id, sv.ma_sinh_vien, sv.so_dien_thoai, sv.ho_ten
    FROM sinh_vien sv
    INNER JOIN giang_vien gv ON gv.ho_ten = sv.giang_vien_huong_dan
                             AND gv.ma_giang_vien = ?
    WHERE sv.so_dien_thoai IS NOT NULL AND TRIM(sv.so_dien_thoai) != ''
      AND NOT EXISTS (
        SELECT 1 FROM bai_nop_cua_sinh_vien bnop
        WHERE bnop.slot_id = ? AND bnop.ma_sinh_vien = sv.ma_sinh_vien
      )
      AND NOT EXISTS (
        SELECT 1 FROM zalo_message_queue q
        WHERE q.student_id = sv.id
          AND q.type = 'deadline_24h_reminder'
          AND q.related_id = ?
          AND q.status IN ('pending','processing','sent')
      )
  `, [slot.ma_giang_vien, slot.id, slot.id]);

  if (!students.length) {
    console.log(`[Reminder] Slot #${slot.id}: không còn SV cần nhắc.`);
    return;
  }

  let count = 0;
  for (const sv of students) {
    const svName = sv.ho_ten || 'Sinh viên';

    const title = '⏰ NHẮC HẠN NỘP';
    const body  = [
      `Xin chào ${svName},`,
      '',
      `Đợt nộp ${typeName} của bạn sắp hết hạn trong vòng 24 giờ.`,
      '',
      `📌 Tên đợt: ${slot.tieu_de}`,
      `⏰ Hạn nộp: ${endFmt}`,
      '',
      'Bạn vui lòng hoàn thành và nộp trên hệ thống trước thời hạn để tránh bị ghi nhận nộp muộn.',
      '',
      'Trân trọng,',
      'Khoa Công nghệ Thông tin - Trường Đại học Đại Nam',
    ].join('\n');

    console.log(`[Reminder] Tin nhắc → SV "${svName}" (${sv.so_dien_thoai}) | Slot #${slot.id}:\n${body}`);

    await enqueueMessage({
      lecturerId:  null,
      studentId:   sv.id,
      phone:       sv.so_dien_thoai,
      title,
      message:     body,
      type:        'deadline_24h_reminder',
      relatedId:   slot.id,
      scheduledAt: new Date(),
      priority:    3,
    });
    count++;
  }

  console.log(`[Reminder] Slot #${slot.id} "${slot.tieu_de}": queued ${count} nhắc hạn`);
}

module.exports = { ensureReminderTable, remindStudentsBeforeDeadline };
