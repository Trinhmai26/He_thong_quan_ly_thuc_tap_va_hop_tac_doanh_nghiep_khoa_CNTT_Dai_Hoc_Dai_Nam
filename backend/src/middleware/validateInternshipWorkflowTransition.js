const db = require('../database/connection');

const STANDARD_STATUSES = [
  'CHUA_DANG_KY',
  'DA_DANG_KY',
  'CHO_DUYET',
  'DA_DUYET',
  'TU_CHOI',
  'DA_PHAN_CONG',
  'DANG_THUC_TAP',
  'CANH_BAO_TIEN_DO',
  'CHO_NOP_BAO_CAO_CUOI_KY',
  'CHO_CHAM_DIEM',
  'HOAN_THANH',
  'HUY'
];

const LEGACY_TO_STANDARD = {
  // dang_ky_thuc_tap_sinh_vien
  'cho-duyet': 'CHO_DUYET',
  'da-duyet': 'DA_DUYET',
  'tu-choi': 'TU_CHOI',

  // phan_cong_thuc_tap
  'chua-bat-dau': 'DA_PHAN_CONG',
  'dang-dien-ra': 'DANG_THUC_TAP',
  'tam-dung': 'CANH_BAO_TIEN_DO',
  'hoan-thanh': 'HOAN_THANH',

  // alternates used in some modules
  chua_nop: 'DANG_THUC_TAP',
  da_nop: 'CHO_CHAM_DIEM',
  da_duyet: 'HOAN_THANH',
  tu_choi: 'TU_CHOI'
};

const ALLOWED_TRANSITIONS = {
  CHUA_DANG_KY: ['DA_DANG_KY', 'HUY'],
  DA_DANG_KY: ['CHO_DUYET', 'HUY'],
  CHO_DUYET: ['DA_DUYET', 'TU_CHOI', 'HUY'],
  DA_DUYET: ['DA_PHAN_CONG', 'HUY'],
  TU_CHOI: ['DA_DANG_KY', 'HUY'],
  DA_PHAN_CONG: ['DANG_THUC_TAP', 'HUY'],
  DANG_THUC_TAP: ['CANH_BAO_TIEN_DO', 'CHO_NOP_BAO_CAO_CUOI_KY', 'HUY'],
  CANH_BAO_TIEN_DO: ['DANG_THUC_TAP', 'CHO_NOP_BAO_CAO_CUOI_KY', 'HUY'],
  CHO_NOP_BAO_CAO_CUOI_KY: ['CHO_CHAM_DIEM', 'HUY'],
  CHO_CHAM_DIEM: ['HOAN_THANH', 'CANH_BAO_TIEN_DO', 'HUY'],
  HOAN_THANH: [],
  HUY: []
};

const ROLE_GUARD_BY_TARGET_STATUS = {
  DA_DANG_KY: ['sinh-vien', 'admin'],
  CHO_DUYET: ['sinh-vien', 'admin'],
  DA_DUYET: ['giang-vien', 'admin'],
  TU_CHOI: ['giang-vien', 'admin'],
  DA_PHAN_CONG: ['admin'],
  DANG_THUC_TAP: ['admin', 'giang-vien'],
  CANH_BAO_TIEN_DO: ['admin', 'giang-vien'],
  CHO_NOP_BAO_CAO_CUOI_KY: ['admin', 'giang-vien'],
  CHO_CHAM_DIEM: ['sinh-vien', 'admin'],
  HOAN_THANH: ['admin', 'giang-vien', 'doanh-nghiep'],
  HUY: ['admin']
};

const MILESTONE_GUARD_BY_TARGET_STATUS = {
  DA_DANG_KY: ['M1', 'M2'],
  CHO_DUYET: ['M1', 'M2', 'M3'],
  DA_DUYET: ['M3'],
  TU_CHOI: ['M3'],
  DA_PHAN_CONG: ['M4'],
  DANG_THUC_TAP: ['M4', 'M5'],
  CHO_NOP_BAO_CAO_CUOI_KY: ['M5'],
  CHO_CHAM_DIEM: ['M5', 'M6'],
  HOAN_THANH: ['M6']
};

const ALLOWED_TABLES = new Set(['phan_cong_thuc_tap', 'dang_ky_thuc_tap_sinh_vien']);

function normalizeStatus(rawStatus) {
  if (!rawStatus || typeof rawStatus !== 'string') return null;

  const trimmed = rawStatus.trim();
  if (!trimmed) return null;

  if (STANDARD_STATUSES.includes(trimmed)) return trimmed;
  return LEGACY_TO_STANDARD[trimmed] || null;
}

function canTransition(fromStatus, toStatus) {
  return (ALLOWED_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

async function getCurrentStatus({ table, id }) {
  const sql = `
    SELECT id, trang_thai, workflow_status, dot_thuc_tap_id
    FROM ${table}
    WHERE id = ?
    LIMIT 1
  `;

  const rows = await db.query(sql, [id]);
  return rows[0] || null;
}

function validateInternshipWorkflowTransition(options = {}) {
  const {
    table = 'phan_cong_thuc_tap',
    idParam = 'id',
    statusField = 'workflow_status',
    strictRoleGuard = true,
    strictMilestoneGuard = false,
    milestoneResolver = null
  } = options;

  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Unsupported table for workflow middleware: ${table}`);
  }

  return async (req, res, next) => {
    try {
      const rawTarget = req.body[statusField] || req.body.trang_thai;
      if (!rawTarget) return next();

      const targetStatus = normalizeStatus(rawTarget);
      if (!targetStatus) {
        return res.status(400).json({
          success: false,
          message: 'Trang thai dich khong hop le',
          data: {
            received: rawTarget,
            allowed: STANDARD_STATUSES
          }
        });
      }

      const entityId = Number(req.params[idParam]);
      if (!Number.isInteger(entityId) || entityId <= 0) {
        return res.status(400).json({
          success: false,
          message: `Tham so ${idParam} khong hop le`
        });
      }

      const currentRow = await getCurrentStatus({ table, id: entityId });
      if (!currentRow) {
        return res.status(404).json({
          success: false,
          message: 'Khong tim thay doi tuong can chuyen trang thai'
        });
      }

      const fromStatus = normalizeStatus(currentRow.workflow_status) || normalizeStatus(currentRow.trang_thai);
      if (!fromStatus) {
        return res.status(409).json({
          success: false,
          message: 'Trang thai hien tai khong nam trong tap da chuan hoa',
          data: {
            rawCurrentStatus: currentRow.workflow_status || currentRow.trang_thai
          }
        });
      }

      if (fromStatus === targetStatus) {
        req.workflowTransition = {
          entityId,
          fromStatus,
          toStatus: targetStatus,
          isNoop: true
        };
        return next();
      }

      if (!canTransition(fromStatus, targetStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Chuyen trang thai khong hop le',
          data: {
            from: fromStatus,
            to: targetStatus,
            allowedTargets: ALLOWED_TRANSITIONS[fromStatus] || []
          }
        });
      }

      if (strictRoleGuard) {
        const userRole = req.user?.role;
        const allowedRoles = ROLE_GUARD_BY_TARGET_STATUS[targetStatus] || [];

        if (!userRole) {
          return res.status(401).json({
            success: false,
            message: 'Khong xac dinh duoc role de chuyen trang thai'
          });
        }

        if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
          return res.status(403).json({
            success: false,
            message: 'Role hien tai khong duoc phep chuyen sang trang thai dich',
            data: {
              role: userRole,
              allowedRoles
            }
          });
        }
      }

      if (strictMilestoneGuard) {
        const currentMilestone = typeof milestoneResolver === 'function'
          ? await milestoneResolver(req, currentRow)
          : (req.body.current_milestone || req.query.current_milestone || null);

        const allowedMilestones = MILESTONE_GUARD_BY_TARGET_STATUS[targetStatus] || [];
        if (allowedMilestones.length > 0 && !currentMilestone) {
          return res.status(400).json({
            success: false,
            message: 'Khong xac dinh duoc moc timeline hien tai',
            data: {
              allowedMilestones
            }
          });
        }

        if (allowedMilestones.length > 0 && currentMilestone && !allowedMilestones.includes(currentMilestone)) {
          return res.status(400).json({
            success: false,
            message: 'Trang thai dich khong thuoc moc timeline hien tai',
            data: {
              currentMilestone,
              allowedMilestones
            }
          });
        }
      }

      req.workflowTransition = {
        entityId,
        fromStatus,
        toStatus: targetStatus,
        dotThucTapId: currentRow.dot_thuc_tap_id || null,
        isNoop: false
      };

      return next();
    } catch (error) {
      console.error('Workflow transition middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Loi kiem tra chuyen trang thai workflow'
      });
    }
  };
}

module.exports = {
  STANDARD_STATUSES,
  ALLOWED_TRANSITIONS,
  ROLE_GUARD_BY_TARGET_STATUS,
  MILESTONE_GUARD_BY_TARGET_STATUS,
  normalizeStatus,
  canTransition,
  validateInternshipWorkflowTransition
};
