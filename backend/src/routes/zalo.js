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

// Giảng viên gửi thủ công cho sinh viên CỦA MÌNH qua hàng đợi
// Backend tự lấy lecturer_id từ JWT, không nhận từ frontend
router.post(
  '/send-to-my-students',
  authenticateToken,
  requireRole(['admin', 'giang-vien']),
  ZaloController.sendToMyStudents
);

module.exports = router;
