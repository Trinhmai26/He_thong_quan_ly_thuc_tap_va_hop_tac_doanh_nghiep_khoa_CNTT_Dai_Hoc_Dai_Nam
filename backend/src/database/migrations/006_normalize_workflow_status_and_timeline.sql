-- Migration: 006_normalize_workflow_status_and_timeline.sql
-- Muc tieu:
-- 1) Chuan hoa cot status cho luong thuc tap (giu tuong thich voi du lieu cu)
-- 2) Tao bang timeline 6 moc M1-M6 cho moi dot thuc tap
-- 3) Tao bang lich su chuyen trang thai de audit

START TRANSACTION;

-- ---------------------------------------------------------------------------
-- Helper: add column/index neu chua ton tai
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    ) THEN
      SET @sql_stmt = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
      PREPARE stmt FROM @sql_stmt;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
    ) THEN
      SET @sql_stmt = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
      PREPARE stmt FROM @sql_stmt;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------------
-- 1) Chuan hoa status cho bang dang_ky_thuc_tap_sinh_vien
-- ---------------------------------------------------------------------------
CALL add_column_if_missing(
  'dang_ky_thuc_tap_sinh_vien',
  'workflow_status',
  "ENUM('CHUA_DANG_KY','DA_DANG_KY','CHO_DUYET','DA_DUYET','TU_CHOI','DA_PHAN_CONG','DANG_THUC_TAP','CANH_BAO_TIEN_DO','CHO_NOP_BAO_CAO_CUOI_KY','CHO_CHAM_DIEM','HOAN_THANH','HUY') DEFAULT 'CHO_DUYET' AFTER trang_thai"
);

SET @sql_stmt = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dang_ky_thuc_tap_sinh_vien'
    ),
    "UPDATE dang_ky_thuc_tap_sinh_vien
     SET workflow_status = CASE
       WHEN trang_thai = 'cho-duyet' THEN 'CHO_DUYET'
       WHEN trang_thai = 'da-duyet' THEN 'DA_DUYET'
       WHEN trang_thai = 'tu-choi' THEN 'TU_CHOI'
       ELSE COALESCE(workflow_status, 'CHO_DUYET')
     END",
    "SELECT 1"
  )
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CALL add_index_if_missing('dang_ky_thuc_tap_sinh_vien', 'idx_dk_workflow_status', '`workflow_status`');

-- ---------------------------------------------------------------------------
-- 2) Chuan hoa status cho bang phan_cong_thuc_tap
-- ---------------------------------------------------------------------------
CALL add_column_if_missing(
  'phan_cong_thuc_tap',
  'workflow_status',
  "ENUM('CHUA_DANG_KY','DA_DANG_KY','CHO_DUYET','DA_DUYET','TU_CHOI','DA_PHAN_CONG','DANG_THUC_TAP','CANH_BAO_TIEN_DO','CHO_NOP_BAO_CAO_CUOI_KY','CHO_CHAM_DIEM','HOAN_THANH','HUY') DEFAULT 'DA_PHAN_CONG' AFTER trang_thai"
);

CALL add_column_if_missing(
  'phan_cong_thuc_tap',
  'workflow_updated_at',
  "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER workflow_status"
);

SET @sql_stmt = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phan_cong_thuc_tap'
    ),
    "UPDATE phan_cong_thuc_tap
     SET workflow_status = CASE
       WHEN trang_thai = 'chua-bat-dau' THEN 'DA_PHAN_CONG'
       WHEN trang_thai = 'dang-dien-ra' THEN 'DANG_THUC_TAP'
       WHEN trang_thai = 'tam-dung' THEN 'CANH_BAO_TIEN_DO'
       WHEN trang_thai = 'hoan-thanh' THEN 'HOAN_THANH'
       ELSE COALESCE(workflow_status, 'DA_PHAN_CONG')
     END,
     workflow_updated_at = CURRENT_TIMESTAMP",
    "SELECT 1"
  )
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CALL add_index_if_missing('phan_cong_thuc_tap', 'idx_pc_workflow_status', '`workflow_status`');

-- ---------------------------------------------------------------------------
-- 3) Bang timeline M1-M6 theo dot_thuc_tap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internship_timeline_milestones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dot_thuc_tap_id INT NOT NULL,
  moc_code ENUM('M1','M2','M3','M4','M5','M6') NOT NULL,
  ten_moc VARCHAR(255) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  sort_order TINYINT NOT NULL,
  owner_roles VARCHAR(255) NULL COMMENT 'Role phu trach, phan tach bang dau phay',
  recipient_roles VARCHAR(255) NULL COMMENT 'Role nhan nhac viec, phan tach bang dau phay',
  reminder_offsets VARCHAR(255) NULL COMMENT 'Danh sach offset ngay, vd: -7,-3,-1,+1',
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_timeline_dot_thuc_tap
    FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE CASCADE,
  CONSTRAINT chk_milestone_time CHECK (start_at <= end_at),
  UNIQUE KEY uq_dot_moc (dot_thuc_tap_id, moc_code),
  INDEX idx_timeline_window (start_at, end_at),
  INDEX idx_timeline_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed 6 moc bat buoc cho tung dot_thuc_tap neu chua co
-- Lich offset theo ngay tu thoi_gian_bat_dau cua dot.
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
  d.id,
  m.moc_code,
  m.ten_moc,
  DATE_ADD(CAST(d.thoi_gian_bat_dau AS DATETIME), INTERVAL m.start_offset DAY),
  DATE_ADD(CAST(d.thoi_gian_bat_dau AS DATETIME), INTERVAL m.end_offset DAY),
  m.sort_order,
  m.owner_roles,
  m.recipient_roles,
  m.reminder_offsets,
  1,
  1
FROM dot_thuc_tap d
JOIN (
  SELECT 'M1' AS moc_code, 'Mo dang ky' AS ten_moc, -60 AS start_offset, -45 AS end_offset, 1 AS sort_order,
         'admin' AS owner_roles, 'sinh-vien' AS recipient_roles, '-7,-3,-1' AS reminder_offsets
  UNION ALL
  SELECT 'M2', 'Dong dang ky', -44, -30, 2,
         'admin', 'sinh-vien,giang-vien', '-7,-3,-1,+1'
  UNION ALL
  SELECT 'M3', 'Han duyet ho so', -29, -20, 3,
         'admin,giang-vien', 'giang-vien,admin', '-7,-3,-1'
  UNION ALL
  SELECT 'M4', 'Han phan cong GV DN', -19, -10, 4,
         'admin', 'admin,giang-vien,doanh-nghiep', '-7,-3,-1'
  UNION ALL
  SELECT 'M5', 'Han nop bao cao cuoi ky', 0, 85, 5,
         'sinh-vien', 'sinh-vien,giang-vien', '-14,-7,-3,-1,+1'
  UNION ALL
  SELECT 'M6', 'Han cham diem va chot ket qua', 86, 100, 6,
         'admin,giang-vien,doanh-nghiep', 'admin,giang-vien,doanh-nghiep', '-7,-3,-1,+1'
) m
LEFT JOIN internship_timeline_milestones t
  ON t.dot_thuc_tap_id = d.id
  AND t.moc_code = m.moc_code
WHERE t.id IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Bang log lich su chuyen trang thai
-- ---------------------------------------------------------------------------
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
  CONSTRAINT fk_workflow_history_account
    FOREIGN KEY (changed_by_account_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Cleanup helper procedures
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

COMMIT;
