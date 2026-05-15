const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const TeacherReportsController = require('../controllers/TeacherReportsController');

/**
 * @swagger
 * /api/teacher-reports/students:
 *   get:
 *     tags: [Teacher Reports]
 *     summary: Lấy danh sách sinh viên hướng dẫn
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách sinh viên thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: number
 */
// Admin endpoints
router.get('/supervision-overview', authenticateToken, requireRole(['admin']), TeacherReportsController.getSupervisionOverview);
router.get('/teacher/:maGiangVien/students', authenticateToken, requireRole(['admin']), TeacherReportsController.getTeacherStudentDetails);

router.get('/students', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.getStudents);

/**
 * @swagger
 * /api/teacher-reports/stats:
 *   get:
 *     tags: [Teacher Reports]
 *     summary: Lấy thống kê báo cáo của giảng viên
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê thành công
 */
router.get('/stats', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.getStats);

/**
 * @swagger
 * /api/teacher-reports:
 *   get:
 *     tags: [Teacher Reports]
 *     summary: Lấy danh sách báo cáo đã nộp
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách báo cáo thành công
 *   post:
 *     tags: [Teacher Reports]
 *     summary: Tạo báo cáo mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tieu_de:
 *                 type: string
 *               noi_dung:
 *                 type: string
 *               loai_bao_cao:
 *                 type: string
 *               ma_sinh_vien:
 *                 type: string
 *               file_dinh_kem:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo báo cáo thành công
 */
router.get('/', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.getReports);
router.post('/', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.createReport);

// Teacher grades a student (overall internship evaluation)
router.post('/students/:maSinhVien/grade', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.gradeStudent);

// Get a student's teacher evaluation (for teachers)
router.get('/students/:maSinhVien/evaluation', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.getStudentEvaluation);

// Student fetches own teacher evaluation
router.get('/student/evaluation', authenticateToken, requireRole(['sinh-vien']), TeacherReportsController.getMyEvaluation);

// JSON grades summary (for table display)
router.get('/grades-summary', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.getGradesSummary);

// Export teacher evaluations as Excel
router.get('/export-evaluations', authenticateToken, requireRole(['giang-vien']), TeacherReportsController.exportEvaluations);

module.exports = router;