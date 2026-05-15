require('dotenv').config();

const db = require('../src/database/connection');

const WORKFLOW_ENUM_SQL = "ENUM('CHUA_DANG_KY','DA_DANG_KY','CHO_DUYET','DA_DUYET','TU_CHOI','DA_PHAN_CONG','DANG_THUC_TAP','CANH_BAO_TIEN_DO','CHO_NOP_BAO_CAO_CUOI_KY','CHO_CHAM_DIEM','HOAN_THANH','HUY')";

async function tableExists(tableName) {
  const rows = await db.query(
    `
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await db.query(
    `
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function indexExists(tableName, indexName) {
  const rows = await db.query(
    `
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function addColumnIfMissing(tableName, columnName, definitionSql) {
  if (!(await tableExists(tableName))) return;
  if (await columnExists(tableName, columnName)) return;

  await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  console.log(`+ Added column ${tableName}.${columnName}`);
}

async function addIndexIfMissing(tableName, indexName, columnsSql) {
  if (!(await tableExists(tableName))) return;
  if (await indexExists(tableName, indexName)) return;

  await db.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${columnsSql})`);
  console.log(`+ Added index ${indexName} on ${tableName}`);
}

async function normalizeDangKyStatuses() {
  if (!(await tableExists('dang_ky_thuc_tap_sinh_vien'))) return;

  await addColumnIfMissing(
    'dang_ky_thuc_tap_sinh_vien',
    'workflow_status',
    `${WORKFLOW_ENUM_SQL} DEFAULT 'CHO_DUYET' AFTER trang_thai`
  );

  await db.query(`
    UPDATE dang_ky_thuc_tap_sinh_vien
    SET workflow_status = CASE
      WHEN trang_thai = 'cho-duyet' THEN 'CHO_DUYET'
      WHEN trang_thai = 'da-duyet' THEN 'DA_DUYET'
      WHEN trang_thai = 'tu-choi' THEN 'TU_CHOI'
      ELSE COALESCE(workflow_status, 'CHO_DUYET')
    END
  `);

  await addIndexIfMissing('dang_ky_thuc_tap_sinh_vien', 'idx_dk_workflow_status', 'workflow_status');
}

async function normalizeAssignmentStatuses() {
  if (!(await tableExists('phan_cong_thuc_tap'))) return;

  await addColumnIfMissing(
    'phan_cong_thuc_tap',
    'workflow_status',
    `${WORKFLOW_ENUM_SQL} DEFAULT 'DA_PHAN_CONG' AFTER trang_thai`
  );

  await addColumnIfMissing(
    'phan_cong_thuc_tap',
    'workflow_updated_at',
    `TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER workflow_status`
  );

  await db.query(`
    UPDATE phan_cong_thuc_tap
    SET workflow_status = CASE
      WHEN trang_thai = 'chua-bat-dau' THEN 'DA_PHAN_CONG'
      WHEN trang_thai = 'dang-dien-ra' THEN 'DANG_THUC_TAP'
      WHEN trang_thai = 'tam-dung' THEN 'CANH_BAO_TIEN_DO'
      WHEN trang_thai = 'hoan-thanh' THEN 'HOAN_THANH'
      ELSE COALESCE(workflow_status, 'DA_PHAN_CONG')
    END,
    workflow_updated_at = CURRENT_TIMESTAMP
  `);

  await addIndexIfMissing('phan_cong_thuc_tap', 'idx_pc_workflow_status', 'workflow_status');
}

async function createTimelineTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS internship_timeline_milestones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dot_thuc_tap_id INT NOT NULL,
      moc_code ENUM('M1','M2','M3','M4','M5','M6') NOT NULL,
      ten_moc VARCHAR(255) NOT NULL,
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      sort_order TINYINT NOT NULL,
      owner_roles VARCHAR(255) NULL,
      recipient_roles VARCHAR(255) NULL,
      reminder_offsets VARCHAR(255) NULL,
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_timeline_dot_thuc_tap FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE CASCADE,
      UNIQUE KEY uq_dot_moc (dot_thuc_tap_id, moc_code),
      INDEX idx_timeline_window (start_at, end_at),
      INDEX idx_timeline_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS internship_workflow_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      entity_type ENUM('dang_ky_thuc_tap_sinh_vien','phan_cong_thuc_tap') NOT NULL,
      entity_id INT NOT NULL,
      from_status VARCHAR(50) NULL,
      to_status VARCHAR(50) NOT NULL,
      changed_by_account_id INT NULL,
      changed_by_role VARCHAR(30) NULL,
      note TEXT NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_history_entity (entity_type, entity_id),
      INDEX idx_history_status (from_status, to_status),
      INDEX idx_history_changed_at (changed_at),
      CONSTRAINT fk_workflow_history_account FOREIGN KEY (changed_by_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('+ Ensured timeline and workflow history tables');
}

async function seedMilestonesForBatch(batchId, startDate) {
  const milestones = [
    ['M1', 'Mo dang ky', -60, -45, 1, 'admin', 'sinh-vien', '-7,-3,-1'],
    ['M2', 'Dong dang ky', -44, -30, 2, 'admin', 'sinh-vien,giang-vien', '-7,-3,-1,+1'],
    ['M3', 'Han duyet ho so', -29, -20, 3, 'admin,giang-vien', 'giang-vien,admin', '-7,-3,-1'],
    ['M4', 'Han phan cong GV DN', -19, -10, 4, 'admin', 'admin,giang-vien,doanh-nghiep', '-7,-3,-1'],
    ['M5', 'Han nop bao cao cuoi ky', 0, 85, 5, 'sinh-vien', 'sinh-vien,giang-vien', '-14,-7,-3,-1,+1'],
    ['M6', 'Han cham diem va chot ket qua', 86, 100, 6, 'admin,giang-vien,doanh-nghiep', 'admin,giang-vien,doanh-nghiep', '-7,-3,-1,+1']
  ];

  for (const item of milestones) {
    const [mocCode, tenMoc, startOffset, endOffset, sortOrder, ownerRoles, recipientRoles, reminderOffsets] = item;

    await db.query(
      `
        INSERT INTO internship_timeline_milestones (
          dot_thuc_tap_id,
          moc_code,
          ten_moc,
          start_at,
          end_at,
          sort_order,
          owner_roles,
          recipient_roles,
          reminder_offsets,
          is_required,
          is_active
        )
        SELECT
          ?, ?, ?,
          DATE_ADD(CAST(? AS DATETIME), INTERVAL ? DAY),
          DATE_ADD(CAST(? AS DATETIME), INTERVAL ? DAY),
          ?, ?, ?, ?, 1, 1
        FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1 FROM internship_timeline_milestones
          WHERE dot_thuc_tap_id = ? AND moc_code = ?
        )
      `,
      [
        batchId,
        mocCode,
        tenMoc,
        startDate,
        startOffset,
        startDate,
        endOffset,
        sortOrder,
        ownerRoles,
        recipientRoles,
        reminderOffsets,
        batchId,
        mocCode
      ]
    );
  }
}

async function seedTimelineData() {
  if (!(await tableExists('dot_thuc_tap'))) return;

  const batches = await db.query('SELECT id, thoi_gian_bat_dau FROM dot_thuc_tap');
  for (const batch of batches) {
    await seedMilestonesForBatch(batch.id, batch.thoi_gian_bat_dau);
  }

  console.log(`+ Seeded M1-M6 milestones for ${batches.length} batches`);
}

async function run() {
  try {
    console.log('=== Workflow migration start ===');

    await normalizeDangKyStatuses();
    await normalizeAssignmentStatuses();
    await createTimelineTables();
    await seedTimelineData();

    console.log('=== Workflow migration completed ===');
    process.exit(0);
  } catch (error) {
    console.error('Workflow migration failed:', error);
    process.exit(1);
  }
}

run();
