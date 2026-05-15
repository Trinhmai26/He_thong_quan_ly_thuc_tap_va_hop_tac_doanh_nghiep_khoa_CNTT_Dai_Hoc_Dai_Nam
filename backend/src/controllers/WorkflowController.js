const connection = require('../database/connection');
const { normalizeStatus } = require('../middleware/validateInternshipWorkflowTransition');

const WORKFLOW_TO_LEGACY = {
  dang_ky_thuc_tap_sinh_vien: {
    CHO_DUYET: 'cho-duyet',
    DA_DUYET: 'da-duyet',
    TU_CHOI: 'tu-choi'
  },
  phan_cong_thuc_tap: {
    DA_PHAN_CONG: 'chua-bat-dau',
    DANG_THUC_TAP: 'dang-dien-ra',
    CANH_BAO_TIEN_DO: 'tam-dung',
    HOAN_THANH: 'hoan-thanh'
  }
};

async function writeWorkflowHistory({
  entityType,
  entityId,
  fromStatus,
  toStatus,
  changedByAccountId,
  changedByRole,
  note
}) {
  try {
    await connection.query(
      `
        INSERT INTO internship_workflow_history (
          entity_type,
          entity_id,
          from_status,
          to_status,
          changed_by_account_id,
          changed_by_role,
          note
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entityType,
        entityId,
        fromStatus || null,
        toStatus,
        changedByAccountId || null,
        changedByRole || null,
        note || null
      ]
    );
  } catch (error) {
    // Do not fail request if audit table is not deployed yet.
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146)) {
      console.warn('internship_workflow_history table not found. Skip audit log.');
      return;
    }
    throw error;
  }
}

class WorkflowController {
  static async updateDangKyStatus(req, res) {
    try {
      const transition = req.workflowTransition;
      if (!transition) {
        return res.status(400).json({
          success: false,
          message: 'Thieu thong tin workflow transition'
        });
      }

      const { id } = req.params;
      const note = req.body.note || null;
      const targetStatus = normalizeStatus(req.body.workflow_status || req.body.trang_thai);

      const legacyStatus = WORKFLOW_TO_LEGACY.dang_ky_thuc_tap_sinh_vien[targetStatus] || null;

      let sql = `
        UPDATE dang_ky_thuc_tap_sinh_vien
        SET workflow_status = ?,
            updated_at = CURRENT_TIMESTAMP
      `;
      const params = [targetStatus];

      if (legacyStatus) {
        sql += `, trang_thai = ?`;
        params.push(legacyStatus);
      }

      sql += ` WHERE id = ?`;
      params.push(Number(id));

      const result = await connection.query(sql, params);
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khong tim thay ho so dang ky'
        });
      }

      await writeWorkflowHistory({
        entityType: 'dang_ky_thuc_tap_sinh_vien',
        entityId: Number(id),
        fromStatus: transition.fromStatus,
        toStatus: targetStatus,
        changedByAccountId: req.user?.id,
        changedByRole: req.user?.role,
        note
      });

      return res.json({
        success: true,
        message: 'Cap nhat trang thai dang ky thanh cong',
        data: {
          id: Number(id),
          fromStatus: transition.fromStatus,
          toStatus: targetStatus,
          legacyStatus: legacyStatus || null
        }
      });
    } catch (error) {
      console.error('Workflow updateDangKyStatus error:', error);
      return res.status(500).json({
        success: false,
        message: 'Loi cap nhat workflow dang ky'
      });
    }
  }

  static async updateAssignmentStatus(req, res) {
    try {
      const transition = req.workflowTransition;
      if (!transition) {
        return res.status(400).json({
          success: false,
          message: 'Thieu thong tin workflow transition'
        });
      }

      const { id } = req.params;
      const note = req.body.note || null;
      const targetStatus = normalizeStatus(req.body.workflow_status || req.body.trang_thai);

      const legacyStatus = WORKFLOW_TO_LEGACY.phan_cong_thuc_tap[targetStatus] || null;

      let sql = `
        UPDATE phan_cong_thuc_tap
        SET workflow_status = ?,
            workflow_updated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      `;
      const params = [targetStatus];

      if (legacyStatus) {
        sql += `, trang_thai = ?`;
        params.push(legacyStatus);
      }

      sql += ` WHERE id = ?`;
      params.push(Number(id));

      const result = await connection.query(sql, params);
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khong tim thay phan cong thuc tap'
        });
      }

      await writeWorkflowHistory({
        entityType: 'phan_cong_thuc_tap',
        entityId: Number(id),
        fromStatus: transition.fromStatus,
        toStatus: targetStatus,
        changedByAccountId: req.user?.id,
        changedByRole: req.user?.role,
        note
      });

      return res.json({
        success: true,
        message: 'Cap nhat trang thai phan cong thanh cong',
        data: {
          id: Number(id),
          fromStatus: transition.fromStatus,
          toStatus: targetStatus,
          legacyStatus: legacyStatus || null
        }
      });
    } catch (error) {
      console.error('Workflow updateAssignmentStatus error:', error);
      return res.status(500).json({
        success: false,
        message: 'Loi cap nhat workflow phan cong'
      });
    }
  }
}

module.exports = WorkflowController;
