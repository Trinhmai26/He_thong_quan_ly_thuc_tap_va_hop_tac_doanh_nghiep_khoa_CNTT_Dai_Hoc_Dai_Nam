const connection = require('../database/connection');

let notificationSchemaReady = false;

async function columnExists(table, column) {
  const rows = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function indexExists(table, indexName) {
  const rows = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function addColumnIfMissing(table, column, ddl) {
  if (!(await columnExists(table, column))) {
    await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

async function addIndexIfMissing(table, indexName, ddl) {
  if (!(await indexExists(table, indexName))) {
    await connection.query(`ALTER TABLE ${table} ADD INDEX ${indexName} ${ddl}`);
  }
}

async function resolveStudentIdByAccountId(accountId) {
  if (!accountId) return null;

  const rows = await connection.query(
    `SELECT id
     FROM sinh_vien
     WHERE account_id = ?
     LIMIT 1`,
    [accountId]
  );

  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

async function ensureNotificationsTable() {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_id INT NULL COMMENT 'Legacy accounts.id cua nguoi nhan',
      receiver_id INT NULL COMMENT 'accounts.id cua nguoi nhan',
      student_id INT NULL COMMENT 'sinh_vien.id neu nguoi nhan la sinh vien',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type ENUM('info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      action_type VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_account_id (account_id),
      INDEX idx_receiver_id (receiver_id),
      INDEX idx_student_id (student_id),
      INDEX idx_is_read (is_read),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!notificationSchemaReady) {
    await addColumnIfMissing('notifications', 'account_id', "INT NULL COMMENT 'Legacy accounts.id cua nguoi nhan'");
    await addColumnIfMissing('notifications', 'receiver_id', "INT NULL COMMENT 'accounts.id cua nguoi nhan'");
    await addColumnIfMissing('notifications', 'student_id', "INT NULL COMMENT 'sinh_vien.id neu nguoi nhan la sinh vien'");
    await addColumnIfMissing('notifications', 'action_type', 'VARCHAR(100) NULL');
    await addColumnIfMissing('notifications', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    await addIndexIfMissing('notifications', 'idx_account_id', '(account_id)');
    await addIndexIfMissing('notifications', 'idx_receiver_id', '(receiver_id)');
    await addIndexIfMissing('notifications', 'idx_student_id', '(student_id)');
    await addIndexIfMissing('notifications', 'idx_is_read', '(is_read)');
    await addIndexIfMissing('notifications', 'idx_created_at', '(created_at)');

    await connection.query(
      `UPDATE notifications
       SET receiver_id = account_id
       WHERE receiver_id IS NULL
         AND account_id IS NOT NULL`
    );

    await connection.query(
      `UPDATE notifications n
       INNER JOIN sinh_vien sv ON sv.account_id = n.receiver_id
       SET n.student_id = sv.id
       WHERE n.student_id IS NULL
         AND n.receiver_id IS NOT NULL`
    );

    notificationSchemaReady = true;
  }
}

async function createNotification(accountId, title, message, type = 'info', actionType = null, options = {}) {
  const receiverId = Number(options.receiverId || accountId || 0) || null;
  if (!receiverId) {
    throw new Error('Cannot create notification without receiver account id');
  }

  await ensureNotificationsTable();

  const studentId =
    options.studentId !== undefined && options.studentId !== null
      ? Number(options.studentId)
      : await resolveStudentIdByAccountId(receiverId);

  await connection.query(
    `INSERT INTO notifications (account_id, receiver_id, student_id, title, message, type, action_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      receiverId,
      receiverId,
      Number.isFinite(studentId) && studentId > 0 ? studentId : null,
      title,
      message,
      type,
      actionType
    ]
  );
}

module.exports = {
  createNotification,
  ensureNotificationsTable,
  resolveStudentIdByAccountId
};
