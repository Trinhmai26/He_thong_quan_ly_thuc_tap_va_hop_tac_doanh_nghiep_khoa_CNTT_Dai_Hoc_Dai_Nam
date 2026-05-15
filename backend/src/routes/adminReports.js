const express = require('express');
const router = express.Router();
const AdminReportsController = require('../controllers/AdminReportsController');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Admin Reports
 *   description: Admin reports management API
 */

/**
 * @swagger
 * /api/admin/reports/stats:
 *   get:
 *     summary: Get reports statistics for admin dashboard
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reports statistics retrieved successfully
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
 *                     totalTeachers:
 *                       type: number
 *                     submittedTeacherReports:
 *                       type: number
 *                     totalCompanies:
 *                       type: number
 *                     submittedCompanyReports:
 *                       type: number
 *                     totalStudents:
 *                       type: number
 *                     completedInternships:
 *                       type: number
 */
router.get('/stats', authenticateToken, requireRole(['admin']), AdminReportsController.getReportsStats);

/**
 * @swagger
 * /api/admin/reports:
 *   get:
 *     summary: Get all submitted reports with pagination and filtering
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: submitterType
 *         schema:
 *           type: string
 *           enum: [giang_vien, doanh_nghiep]
 *         description: Filter by submitter type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [da_nop, da_duyet, tu_choi]
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, submitter name, or code
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 */
router.get('/', authenticateToken, requireRole(['admin']), AdminReportsController.getSubmittedReports);

/**
 * @swagger
 * /api/admin/reports/export:
 *   get:
 *     summary: Export reports to Excel
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: submitterType
 *         schema:
 *           type: string
 *           enum: [giang_vien, doanh_nghiep]
 *         description: Filter by submitter type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [da_nop, da_duyet, tu_choi]
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, submitter name, or code
 *     responses:
 *       200:
 *         description: Excel file downloaded successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/export', authenticateToken, requireRole(['admin']), AdminReportsController.exportReports);

// ===== Periodic updates (daily / weekly / overall) =====
// Must be declared BEFORE the '/:id' route below to avoid being captured as an ID.
router.get('/periodic-updates', authenticateToken, requireRole(['admin']), AdminReportsController.getPeriodicUpdates);
router.get('/periodic-updates/details', authenticateToken, requireRole(['admin']), AdminReportsController.getPeriodicUpdateDetails);

/**
 * @swagger
 * /api/admin/reports/{id}:
 *   get:
 *     summary: Get detailed report by ID
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ID
 *     responses:
 *       200:
 *         description: Report retrieved successfully
 *       404:
 *         description: Report not found
 */
router.get('/:id', authenticateToken, requireRole(['admin']), AdminReportsController.getReportById);

/**
 * @swagger
 * /api/admin/reports/{id}/approve:
 *   put:
 *     summary: Approve a report
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ID
 *     responses:
 *       200:
 *         description: Report approved successfully
 *       404:
 *         description: Report not found
 */
router.put('/:id/approve', authenticateToken, requireRole(['admin']), AdminReportsController.approveReport);

/**
 * @swagger
 * /api/admin/reports/{id}/reject:
 *   put:
 *     summary: Reject a report
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejection
 *     responses:
 *       200:
 *         description: Report rejected successfully
 *       400:
 *         description: Reason is required
 *       404:
 *         description: Report not found
 */
router.put('/:id/reject', authenticateToken, requireRole(['admin']), AdminReportsController.rejectReport);

/**
 * @swagger
 * /api/admin/reports/missing/teachers/{dotThucTapId}:
 *   get:
 *     summary: Get teachers who haven't submitted reports
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dotThucTapId
 *         required: true
 *         schema:
 *           type: string
 *         description: Internship batch ID
 *     responses:
 *       200:
 *         description: Teachers list retrieved successfully
 *       400:
 *         description: Internship batch ID is required
 */
router.get('/missing/teachers/:dotThucTapId', authenticateToken, requireRole(['admin']), AdminReportsController.getTeachersWithoutReports);

/**
 * @swagger
 * /api/admin/reports/missing/companies/{dotThucTapId}:
 *   get:
 *     summary: Get companies who haven't submitted reports
 *     tags: [Admin Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dotThucTapId
 *         required: true
 *         schema:
 *           type: string
 *         description: Internship batch ID
 *     responses:
 *       200:
 *         description: Companies list retrieved successfully
 *       400:
 *         description: Internship batch ID is required
 */
router.get('/missing/companies/:dotThucTapId', authenticateToken, requireRole(['admin']), AdminReportsController.getCompaniesWithoutReports);

module.exports = router;