require('dotenv').config();
const db = require('../src/database/connection');

async function run() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS dang_ky_thuc_tap_sinh_vien (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sinh_vien_id INT NOT NULL,
      nguyen_vong_thuc_tap ENUM('khoa-gioi-thieu','tu-lien-he') NOT NULL,
      vi_tri_thuc_tap_mong_muon VARCHAR(255) NOT NULL,
      ten_cong_ty VARCHAR(255) NULL,
      dia_chi_cong_ty TEXT NULL,
      nguoi_lien_he VARCHAR(255) NULL,
      so_dien_thoai_lien_he VARCHAR(20) NULL,
      ghi_chu TEXT NULL,
      trang_thai ENUM('cho-duyet','da-duyet','tu-choi') DEFAULT 'cho-duyet',
      ly_do_tu_choi TEXT NULL,
      nguoi_duyet_id INT NULL,
      ngay_duyet DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sinh_vien_id (sinh_vien_id),
      INDEX idx_trang_thai (trang_thai),
      INDEX idx_nguyen_vong (nguyen_vong_thuc_tap),
      CONSTRAINT fk_dk_sv FOREIGN KEY (sinh_vien_id) REFERENCES sinh_vien(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('created_or_exists:dang_ky_thuc_tap_sinh_vien');

  const rows = await db.query('SELECT COUNT(*) AS c FROM dot_thuc_tap');
  if (Number(rows[0].c) === 0) {
    await db.query(`
      INSERT INTO dot_thuc_tap (
        ten_dot,
        thoi_gian_bat_dau,
        thoi_gian_ket_thuc,
        mo_ta,
        trang_thai
      ) VALUES (
        'Dot thuc tap mau 2026',
        '2026-06-01',
        '2026-09-30',
        'Du lieu mau de khoi tao timeline M1-M6',
        'sap-mo'
      )
    `);
    console.log('seeded:dot_thuc_tap');
  } else {
    console.log('skip_seed:dot_thuc_tap_has_data');
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
