const express = require('express');
const router = express.Router();
const ZaloController = require('../controllers/ZaloController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// === PUBLIC (Zalo webhook - không cần auth) ===
// Zalo gửi GET để xác thực URL
router.get('/webhook', ZaloController.verifyWebhook);
// Zalo gửi POST khi có sự kiện (follow, message, ...)
router.post('/webhook', ZaloController.handleWebhook);

// === PROTECTED (cần đăng nhập) ===

// Gửi thông báo Zalo - Admin và Giảng viên
router.post(
  '/send',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendNotification
);

// Thống kê trạng thái liên kết Zalo
router.get(
  '/linked-status',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.getLinkedStatus
);

// Danh sách sinh viên kèm trạng thái Zalo
router.get(
  '/students',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.getStudentZaloList
);

// === ZALO LOCAL SERVICE (Flask proxy - gửi qua nhóm Zalo) ===

// Kiểm tra trạng thái Flask service
router.get(
  '/local/status',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.getLocalStatus
);

// Lấy danh sách nhóm Zalo từ Flask service
router.get(
  '/local/groups',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.getLocalGroups
);

// Gửi tin nhắn vào nhóm Zalo qua Flask service
router.post(
  '/local/send',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendLocalMessage
);

// Gửi tin nhắn đến 1 số điện thoại qua Flask service
router.post(
  '/local/send-individual',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendLocalIndividual
);

// Gửi tin nhắn đến nhiều số điện thoại qua Flask service
router.post(
  '/local/send-bulk',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendLocalBulk
);

// Gửi Zalo riêng từng sinh viên theo studentIds (admin/gv, gọi trực tiếp Flask)
router.post(
  '/send-to-students',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendToStudents
);

// Danh sách giảng viên kèm SĐT (chỉ admin)
router.get(
  '/lecturers',
  authenticateToken,
  requireRole(['admin']),
  ZaloController.getLecturerZaloList
);

// Gửi Zalo riêng từng giảng viên theo lecturerIds (chỉ admin)
router.post(
  '/send-to-lecturers',
  authenticateToken,
  requireRole(['admin']),
  ZaloController.sendToLecturers
);

// Giảng viên gửi thủ công cho sinh viên CỦA MÌNH qua hàng đợi
// Backend tự lấy lecturer_id từ JWT, không nhận từ frontend
router.post(
  '/send-to-my-students',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendToMyStudents
);

// Kích hoạt gửi thông báo tự động ngay (admin + giảng viên)
router.post(
  '/trigger-reminders',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.triggerReminders
);

// === DEBUG: xem trạng thái queue (chỉ admin) ===
router.get(
  '/queue-debug',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    const db = require('../database/connection');
    try {
      // Thống kê queue theo status
      const stats = await db.query(
        `SELECT status, COUNT(*) AS cnt FROM zalo_message_queue GROUP BY status ORDER BY status`
      );

      // 10 tin nhắn mới nhất trong queue
      const recent = await db.query(
        `SELECT id, student_id, phone, title, type, status, failed_reason, retry_count,
                scheduled_at, sent_at, created_at
         FROM zalo_message_queue
         ORDER BY created_at DESC LIMIT 10`
      );

      // Tất cả sinh viên + SĐT (debug không cần lọc theo GV)
      const students = await db.query(
        `SELECT sv.id, sv.ma_sinh_vien, sv.ho_ten, sv.so_dien_thoai,
                sv.giang_vien_huong_dan
         FROM sinh_vien sv
         ORDER BY sv.ho_ten
         LIMIT 20`
      );

      // Thống kê SĐT
      const phoneStats = await db.query(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN so_dien_thoai IS NOT NULL AND TRIM(so_dien_thoai) != '' THEN 1 ELSE 0 END) AS co_sdt
         FROM sinh_vien`
      );

      return res.json({
        success: true,
        data: {
          queue_stats: stats,
          recent_messages: recent,
          student_phone_summary: phoneStats[0],
          sample_students: students,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

module.exports = router;
