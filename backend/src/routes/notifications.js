const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { ensureNotificationsTable, createNotification } = require('../utils/notificationHelper');
const connection = require('../database/connection');

const verifyJWT = authenticateToken;

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeNotification = (row, userRole) => ({
  id: String(row.id),
  title: row.title,
  message: row.message,
  type: row.type,
  isRead: !!row.is_read,
  actionType: row.action_type,
  createdAt: row.created_at,
  userId: row.receiver_id ? String(row.receiver_id) : '',
  userRole
});

async function resolveCurrentStudent(accountId, user) {
  const maSinhVien = String(user?.maSinhVien || user?.ma_sinh_vien || '').trim();

  const rows = await connection.query(
    `SELECT id, account_id, ma_sinh_vien, ho_ten, giang_vien_huong_dan
     FROM sinh_vien
     WHERE account_id = ?
        OR (? <> '' AND ma_sinh_vien = ?)
     LIMIT 1`,
    [accountId, maSinhVien, maSinhVien]
  );

  return rows?.[0] || null;
}

async function getRequesterScope(user) {
  const accountId = toPositiveInt(user?.id);
  const userRole = user?.role;

  if (!accountId) {
    return { accountId: null, userRole, studentId: null, canRead: false };
  }

  if (userRole === 'sinh-vien') {
    const student = await resolveCurrentStudent(accountId, user);
    return {
      accountId,
      userRole,
      studentId: student?.id ? Number(student.id) : null,
      canRead: !!student?.id,
      student
    };
  }

  return {
    accountId,
    userRole,
    studentId: null,
    canRead: ['giang-vien', 'doanh-nghiep', 'admin'].includes(userRole)
  };
}

function buildNotificationScope(scope, alias = 'n') {
  const prefix = alias ? `${alias}.` : '';

  if (scope.userRole === 'sinh-vien') {
    return {
      clause: `(
        ${prefix}student_id = ?
        OR (
          ${prefix}receiver_id = ?
          AND (${prefix}student_id IS NULL OR ${prefix}student_id = ?)
        )
      )`,
      params: [scope.studentId, scope.accountId, scope.studentId]
    };
  }

  return {
    clause: `(${prefix}receiver_id = ? OR ${prefix}account_id = ?)`,
    params: [scope.accountId, scope.accountId]
  };
}

async function cleanupObsoleteAssignmentNotifications(accountId) {
  await connection.query(
    `DELETE FROM notifications
     WHERE (receiver_id = ? OR account_id = ?)
       AND action_type = 'assignment'
       AND (
         title IN ('Cập nhật đợt thực tập', 'Cập nhật đợt của sinh viên hướng dẫn')
         OR (
           title = 'Có sinh viên mới được phân công'
           AND (
             message LIKE '% - Đợt 1'
             OR message LIKE '% - Đợt 1.%'
             OR message LIKE '% - Đợt 2'
             OR message LIKE '% - Đợt 2.%'
           )
         )
         OR (
           title = 'Đã phân công giảng viên hướng dẫn'
           AND (
             message LIKE '%(Đợt 1)%'
             OR message LIKE '%(Đợt 2)%'
           )
         )
       )`,
    [accountId, accountId]
  );
}

const buildLecturerContactText = (lecturer) => {
  const phone = String(lecturer?.so_dien_thoai || '').trim();
  const email = String(lecturer?.email_ca_nhan || '').trim();
  if (!phone && !email) return '';

  const parts = [];
  if (phone) parts.push(`SĐT: ${phone}`);
  if (email) parts.push(`Email: ${email}`);
  return ` (${parts.join(' | ')})`;
};

async function ensureStudentAssignmentNotifications(accountId) {
  const [student] = await connection.query(
    `SELECT id, ma_sinh_vien, ho_ten, giang_vien_huong_dan
     FROM sinh_vien
     WHERE account_id = ?
     LIMIT 1`,
    [accountId]
  );

  if (!student) return;

  const lecturerName = String(student.giang_vien_huong_dan || '').trim();
  const [lecturer] = lecturerName
    ? await connection.query(
        `SELECT so_dien_thoai, email_ca_nhan
         FROM giang_vien
         WHERE LOWER(TRIM(ho_ten)) = LOWER(TRIM(?))
         LIMIT 1`,
        [lecturerName]
      )
    : [null];
  const lecturerContactText = buildLecturerContactText(lecturer);

  if (lecturerName) {
    const title = 'Đã phân công giảng viên hướng dẫn';
    const message = `Bạn đã được phân công giảng viên hướng dẫn: ${lecturerName}${lecturerContactText}.`;

    const [existingLecturerNoti] = await connection.query(
      `SELECT id
       FROM notifications
       WHERE (receiver_id = ? OR account_id = ?)
         AND (student_id = ? OR student_id IS NULL)
         AND action_type = 'assignment'
         AND title = ?
         AND message = ?
       LIMIT 1`,
      [accountId, accountId, student.id, title, message]
    );

    if (!existingLecturerNoti) {
      await createNotification(accountId, title, message, 'success', 'assignment', {
        studentId: student.id
      });
    }
  }
}

async function ensureTeacherAssignmentNotifications(accountId) {
  const [teacher] = await connection.query(
    `SELECT ho_ten
     FROM giang_vien
     WHERE account_id = ?
     LIMIT 1`,
    [accountId]
  );

  if (!teacher) return;

  const teacherName = String(teacher.ho_ten || '').trim();
  if (!teacherName) return;

  const students = await connection.query(
    `SELECT ho_ten, ma_sinh_vien
     FROM sinh_vien
     WHERE LOWER(TRIM(giang_vien_huong_dan)) = LOWER(TRIM(?))
     LIMIT 50`,
    [teacherName]
  );

  for (const student of students || []) {
    const studentName = String(student.ho_ten || 'Sinh viên').trim();
    const studentCode = String(student.ma_sinh_vien || '').trim();

    const titleAssigned = 'Có sinh viên mới được phân công';
    const messageAssigned = `Bạn được phân công hướng dẫn ${studentName}${studentCode ? ` (${studentCode})` : ''}.`;

    const [existingAssigned] = await connection.query(
      `SELECT id
       FROM notifications
       WHERE (receiver_id = ? OR account_id = ?)
         AND action_type = 'assignment'
         AND title = ?
         AND message = ?
       LIMIT 1`,
      [accountId, accountId, titleAssigned, messageAssigned]
    );

    if (!existingAssigned) {
      await createNotification(accountId, titleAssigned, messageAssigned, 'info', 'assignment');
    }
  }
}

async function getNotificationsForRequester(req, res) {
  try {
    await ensureNotificationsTable();

    const scope = await getRequesterScope(req.user);
    if (!scope.canRead) {
      return res.json({ success: true, notifications: [] });
    }

    await cleanupObsoleteAssignmentNotifications(scope.accountId);

    if (scope.userRole === 'sinh-vien') {
      await ensureStudentAssignmentNotifications(scope.accountId);
    }

    if (scope.userRole === 'giang-vien') {
      await ensureTeacherAssignmentNotifications(scope.accountId);
    }

    const scoped = buildNotificationScope(scope, 'n');
    const rows = await connection.query(
      `SELECT n.id, n.receiver_id, n.student_id, n.title, n.message, n.type, n.is_read, n.action_type, n.created_at
       FROM notifications n
       WHERE ${scoped.clause}
         AND NOT (n.receiver_id IS NULL AND n.student_id IS NULL)
       ORDER BY n.created_at DESC
       LIMIT 50`,
      scoped.params
    );

    const notifications = (rows || []).map((row) =>
      normalizeNotification(row, scope.userRole)
    );
    return res.json({ success: true, notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách thông báo'
    });
  }
}

router.get('/me', verifyJWT, getNotificationsForRequester);
router.get('/', verifyJWT, getNotificationsForRequester);

router.post('/', verifyJWT, async (req, res) => {
  try {
    const scope = await getRequesterScope(req.user);
    if (!scope.canRead) {
      return res.status(403).json({ success: false, message: 'Không xác định được người nhận thông báo' });
    }

    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const type = ['info', 'success', 'warning', 'error'].includes(req.body?.type)
      ? req.body.type
      : 'info';
    const actionType = req.body?.actionType || req.body?.action_type || null;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Thiếu tiêu đề hoặc nội dung thông báo' });
    }

    await createNotification(scope.accountId, title, message, type, actionType, {
      studentId: scope.studentId
    });

    return res.json({ success: true, message: 'Thông báo đã được tạo' });
  } catch (error) {
    console.error('Error creating notification:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi tạo thông báo' });
  }
});

router.patch('/bulk-update', verifyJWT, async (req, res) => {
  try {
    await ensureNotificationsTable();

    const scope = await getRequesterScope(req.user);
    if (!scope.canRead) {
      return res.status(403).json({ success: false, message: 'Không có quyền cập nhật thông báo' });
    }

    const scoped = buildNotificationScope(scope, 'n');
    const isRead = req.body?.isRead === false ? 0 : 1;
    const notificationIds = Array.isArray(req.body?.notificationIds)
      ? req.body.notificationIds.map(toPositiveInt).filter(Boolean)
      : [];

    if (notificationIds.length > 0) {
      const placeholders = notificationIds.map(() => '?').join(', ');
      await connection.query(
        `UPDATE notifications n
         SET n.is_read = ?
         WHERE n.id IN (${placeholders})
           AND ${scoped.clause}`,
        [isRead, ...notificationIds, ...scoped.params]
      );
    } else {
      await connection.query(
        `UPDATE notifications n
         SET n.is_read = ?
         WHERE ${scoped.clause}`,
        [isRead, ...scoped.params]
      );
    }

    return res.json({ success: true, message: 'Đã cập nhật trạng thái thông báo' });
  } catch (error) {
    console.error('Error bulk updating notifications:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thông báo' });
  }
});

router.patch('/:id', verifyJWT, async (req, res) => {
  try {
    await ensureNotificationsTable();

    const notificationId = toPositiveInt(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ success: false, message: 'ID thông báo không hợp lệ' });
    }

    const scope = await getRequesterScope(req.user);
    if (!scope.canRead) {
      return res.status(403).json({ success: false, message: 'Không có quyền cập nhật thông báo' });
    }

    const scoped = buildNotificationScope(scope, 'n');
    const isRead = req.body?.isRead === false ? 0 : 1;

    await connection.query(
      `UPDATE notifications n
       SET n.is_read = ?
       WHERE n.id = ?
         AND ${scoped.clause}`,
      [isRead, notificationId, ...scoped.params]
    );

    return res.json({ success: true, message: 'Đã cập nhật trạng thái thông báo' });
  } catch (error) {
    console.error('Error updating notification:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thông báo' });
  }
});

router.delete('/:id', verifyJWT, async (req, res) => {
  try {
    await ensureNotificationsTable();

    const notificationId = toPositiveInt(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ success: false, message: 'ID thông báo không hợp lệ' });
    }

    const scope = await getRequesterScope(req.user);
    if (!scope.canRead) {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa thông báo' });
    }

    const scoped = buildNotificationScope(scope, 'n');

    await connection.query(
      `DELETE n
       FROM notifications n
       WHERE n.id = ?
         AND ${scoped.clause}`,
      [notificationId, ...scoped.params]
    );

    return res.json({ success: true, message: 'Đã xóa thông báo' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi xóa thông báo' });
  }
});

module.exports = router;
