const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/AdminController');
const { authenticateToken } = require('../middleware/auth');

// Middleware to check admin role
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Chỉ quản trị viên mới có quyền truy cập'
    });
  }
  next();
};

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(adminOnly);

/**
 * @swagger
 * /api/admin/internship-batches/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Lấy thống kê các đợt thực tập
 *     description: Lấy danh sách đợt thực tập kèm thống kê đăng ký doanh nghiệp
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách đợt thực tập với thống kê
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       ten_dot:
 *                         type: string
 *                       mo_ta:
 *                         type: string
 *                       ngay_bat_dau:
 *                         type: string
 *                         format: date
 *                       ngay_ket_thuc:
 *                         type: string
 *                         format: date
 *                       tong_dang_ky:
 *                         type: integer
 *                         description: Tổng số đăng ký
 *                       cho_duyet:
 *                         type: integer
 *                         description: Số đăng ký chờ duyệt
 *                       da_duyet:
 *                         type: integer
 *                         description: Số đăng ký đã duyệt
 *                       bi_tu_choi:
 *                         type: integer
 *                         description: Số đăng ký bị từ chối
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Chỉ admin mới có quyền truy cập
 */
router.get('/internship-batches/stats', AdminController.getInternshipBatchesWithStats);

/**
 * @swagger
 * /api/admin/internship-batches/{batchId}/company-registrations:
 *   get:
 *     tags: [Admin]
 *     summary: Lấy danh sách đăng ký doanh nghiệp trong đợt
 *     description: Lấy chi tiết các đăng ký doanh nghiệp trong một đợt thực tập cụ thể
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đợt thực tập
 *         example: 1
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [cho-duyet, da-duyet, bi-tu-choi]
 *         description: Lọc theo trạng thái
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Số lượng bản ghi mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách đăng ký doanh nghiệp
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/internship-batches/:batchId/company-registrations', AdminController.getCompanyRegistrationsInBatch);

/**
 * @swagger
 * /api/admin/company-registrations/{registrationId}/approve:
 *   put:
 *     tags: [Admin]
 *     summary: Phê duyệt đăng ký doanh nghiệp
 *     description: Phê duyệt một đăng ký doanh nghiệp tham gia đợt thực tập
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đăng ký
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ghi_chu:
 *                 type: string
 *                 description: Ghi chú từ admin
 *                 example: "Đăng ký được chấp nhận"
 *     responses:
 *       200:
 *         description: Phê duyệt thành công
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/company-registrations/:registrationId/approve', AdminController.approveCompanyRegistration);

/**
 * @swagger
 * /api/admin/company-registrations/{registrationId}/reject:
 *   put:
 *     tags: [Admin]
 *     summary: Từ chối đăng ký doanh nghiệp
 *     description: Từ chối một đăng ký doanh nghiệp tham gia đợt thực tập
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đăng ký
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ly_do_tu_choi]
 *             properties:
 *               ly_do_tu_choi:
 *                 type: string
 *                 description: Lý do từ chối
 *                 example: "Không đủ điều kiện tham gia"
 *               ghi_chu:
 *                 type: string
 *                 description: Ghi chú thêm
 *     responses:
 *       200:
 *         description: Từ chối thành công
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/company-registrations/:registrationId/reject', AdminController.rejectCompanyRegistration);

/**
 * @swagger
 * /api/admin/student-registrations/overview:
 *   get:
 *     tags: [Admin]
 *     summary: Tổng quan đăng ký sinh viên
 *     description: Lấy thống kê tổng quan về đăng ký thực tập của sinh viên
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê đăng ký sinh viên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tong_sinh_vien:
 *                       type: integer
 *                     da_dang_ky:
 *                       type: integer
 *                     chua_dang_ky:
 *                       type: integer
 *                     theo_dot:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/student-registrations/overview', AdminController.getStudentRegistrationsOverview);

router.put('/student-registrations/:registrationId/approve', AdminController.approveStudentRegistration);

router.put('/student-registrations/:registrationId/reject', AdminController.rejectStudentRegistration);

router.post('/students/bulk-approve-by-preference', AdminController.bulkApproveByPreference);

router.get('/students/diagnose-khoa-gioi-thieu', AdminController.diagnoseKhoaGioiThieu);
router.post('/students/auto-assign-company-khoa-gioi-thieu', AdminController.autoAssignCompanyForKhoaGioiThieu);

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Thống kê dashboard admin
 *     description: Lấy các số liệu thống kê tổng quan cho dashboard admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê dashboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tong_sinh_vien:
 *                       type: integer
 *                       description: Tổng số sinh viên
 *                     tong_doanh_nghiep:
 *                       type: integer
 *                       description: Tổng số doanh nghiệp
 *                     tong_giang_vien:
 *                       type: integer
 *                       description: Tổng số giảng viên
 *                     dot_thuc_tap_active:
 *                       type: integer
 *                       description: Số đợt thực tập đang hoạt động
 *                     sinh_vien_dang_thuc_tap:
 *                       type: integer
 *                       description: Sinh viên đang thực tập
 *                     cho_duyet_dang_ky:
 *                       type: integer
 *                       description: Số đăng ký chờ duyệt
 */
router.get('/dashboard/stats', AdminController.getDashboardStats);

module.exports = router;