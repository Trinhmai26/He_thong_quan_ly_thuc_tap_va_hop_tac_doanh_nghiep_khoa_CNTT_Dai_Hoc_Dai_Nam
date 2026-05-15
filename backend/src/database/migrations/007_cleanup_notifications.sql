-- Cleanup and harden personal notifications.
-- Run against the application database after deploying the /api/notifications/me endpoint.

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notifications ADD COLUMN receiver_id INT NULL COMMENT ''accounts.id cua nguoi nhan'' AFTER account_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'receiver_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE notifications ADD COLUMN student_id INT NULL COMMENT ''sinh_vien.id neu nguoi nhan la sinh vien'' AFTER receiver_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'student_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE notifications
SET receiver_id = account_id
WHERE receiver_id IS NULL
  AND account_id IS NOT NULL;

UPDATE notifications n
INNER JOIN sinh_vien sv ON sv.account_id = n.receiver_id
SET n.student_id = sv.id
WHERE n.student_id IS NULL
  AND n.receiver_id IS NOT NULL;

UPDATE notifications n
INNER JOIN sinh_vien sv ON sv.id = n.student_id
SET n.receiver_id = sv.account_id,
    n.account_id = COALESCE(n.account_id, sv.account_id)
WHERE n.student_id IS NOT NULL
  AND n.receiver_id IS NULL;

DELETE FROM notifications
WHERE receiver_id IS NULL
  AND student_id IS NULL;

DELETE n
FROM notifications n
LEFT JOIN accounts a ON a.id = n.receiver_id
WHERE n.receiver_id IS NOT NULL
  AND a.id IS NULL;

DELETE n
FROM notifications n
LEFT JOIN sinh_vien sv ON sv.id = n.student_id
WHERE n.student_id IS NOT NULL
  AND sv.id IS NULL;

DELETE n
FROM notifications n
INNER JOIN accounts a ON a.id = n.receiver_id AND a.role = 'sinh-vien'
LEFT JOIN sinh_vien sv ON sv.id = n.student_id
WHERE n.student_id IS NULL
   OR sv.account_id <> n.receiver_id;

DELETE FROM notifications
WHERE LOWER(CONCAT_WS(' ', title, message, COALESCE(action_type, ''))) REGEXP
  'test|demo|dummy|sample|rac|rác|thu nghiem|thử nghiệm';

DELETE FROM notifications
WHERE receiver_id IS NULL
  AND student_id IS NULL;

SELECT
  COUNT(*) AS remaining_notifications,
  SUM(CASE WHEN receiver_id IS NULL AND student_id IS NULL THEN 1 ELSE 0 END) AS missing_recipient_rows
FROM notifications;
