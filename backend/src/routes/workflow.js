const express = require('express');
const WorkflowController = require('../controllers/WorkflowController');
const { authenticateToken } = require('../middleware/auth');
const { validateInternshipWorkflowTransition } = require('../middleware/validateInternshipWorkflowTransition');
const db = require('../database/connection');

const router = express.Router();
const strictMilestoneGuard =
  process.env.WORKFLOW_STRICT_MILESTONE === 'true' || process.env.NODE_ENV === 'production';

async function resolveMilestoneFromTimeline(req, currentRow) {
  const explicitMilestone = req.body.current_milestone || req.query.current_milestone;
  if (explicitMilestone) return explicitMilestone;

  const dotThucTapId =
    currentRow?.dot_thuc_tap_id || req.body.dot_thuc_tap_id || req.query.dot_thuc_tap_id;

  if (!dotThucTapId) return null;

  const rows = await db.query(
    `
      SELECT moc_code
      FROM internship_timeline_milestones
      WHERE dot_thuc_tap_id = ?
        AND is_active = 1
        AND NOW() BETWEEN start_at AND end_at
      ORDER BY sort_order ASC
      LIMIT 1
    `,
    [dotThucTapId]
  );

  return rows[0]?.moc_code || null;
}

// PATCH /api/workflow/dang-ky/:id/status
router.patch(
  '/dang-ky/:id/status',
  authenticateToken,
  validateInternshipWorkflowTransition({
    table: 'dang_ky_thuc_tap_sinh_vien',
    idParam: 'id',
    statusField: 'workflow_status',
    strictRoleGuard: true,
    strictMilestoneGuard,
    milestoneResolver: resolveMilestoneFromTimeline
  }),
  WorkflowController.updateDangKyStatus
);

// PATCH /api/workflow/assignment/:id/status
router.patch(
  '/assignment/:id/status',
  authenticateToken,
  validateInternshipWorkflowTransition({
    table: 'phan_cong_thuc_tap',
    idParam: 'id',
    statusField: 'workflow_status',
    strictRoleGuard: true,
    strictMilestoneGuard,
    milestoneResolver: resolveMilestoneFromTimeline
  }),
  WorkflowController.updateAssignmentStatus
);

module.exports = router;
