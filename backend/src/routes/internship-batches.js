const express = require('express');
const InternshipBatchesController = require('../controllers/InternshipBatchesController');
const { authenticateToken, requireRole, optionalAuthenticateToken } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

// GET /api/internship-batches - Lấy danh sách đợt thực tập (Public read)
router.get('/', optionalAuthenticateToken, InternshipBatchesController.getAllBatches);

// GET /api/internship-batches/active - Lấy đợt thực tập đang mở (Public read)
router.get('/active', optionalAuthenticateToken, InternshipBatchesController.getActiveBatches);

// GET /api/internship-batches/stats - Thống kê đợt thực tập (Admin)
router.get('/stats', authenticateToken, requireRole(['admin']), InternshipBatchesController.getBatchStats);

// GET /api/internship-batches/:id - Lấy thông tin chi tiết đợt thực tập (Public read)
router.get('/:id', optionalAuthenticateToken, InternshipBatchesController.getBatchById);

// POST /api/internship-batches - Tạo đợt thực tập mới (Admin only)
router.post('/', authenticateToken, requireRole(['admin']), InternshipBatchesController.createBatch);

// PUT /api/internship-batches/:id - Cập nhật thông tin đợt thực tập (Admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), InternshipBatchesController.updateBatch);

// PATCH /api/internship-batches/:id/sub-batch-schedule - Cập nhật ngày thực tập cho đợt nhỏ (Admin only)
router.patch('/:id/sub-batch-schedule', authenticateToken, requireRole(['admin']), InternshipBatchesController.updateSubBatchSchedule);

// DELETE /api/internship-batches/:id - Xóa đợt thực tập (Admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), InternshipBatchesController.deleteBatch);

// POST /api/internship-batches/:id/import-participants - Import danh sách tham gia vào đợt thực tập (Admin only)
router.post('/:id/import-participants', authenticateToken, requireRole(['admin']), upload.single('file'), InternshipBatchesController.importParticipants);

// GET /api/internship-batches/:id/export - Xuất thông tin đợt thực tập (Admin only)
router.get('/:id/export', authenticateToken, requireRole(['admin']), InternshipBatchesController.exportBatch);

// GET /api/internship-batches/:id/participants - Lấy danh sách chi tiết người tham gia (Admin)
router.get('/:id/participants', authenticateToken, requireRole(['admin']), InternshipBatchesController.getBatchParticipants);

module.exports = router;