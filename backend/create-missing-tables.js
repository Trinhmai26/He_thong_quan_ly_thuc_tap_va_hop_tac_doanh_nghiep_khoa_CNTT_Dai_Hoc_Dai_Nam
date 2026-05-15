require('dotenv').config();
const connection = require('./src/database/connection');

async function createMissingTables() {
  try {
    console.log('🔧 Tạo các bảng database còn thiếu...');

    // 1. Bảng đợt thực tập
    await connection.query(`
      CREATE TABLE IF NOT EXISTS dot_thuc_tap (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ten_dot VARCHAR(255) NOT NULL,
        thoi_gian_bat_dau DATE NOT NULL,
        thoi_gian_ket_thuc DATE NOT NULL,
        mo_ta TEXT,
        trang_thai ENUM('sap-mo', 'dang-dien-ra', 'ket-thuc') DEFAULT 'sap-mo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_trang_thai (trang_thai),
        INDEX idx_thoi_gian (thoi_gian_bat_dau, thoi_gian_ket_thuc)
      )
    `);

    // 2. Bảng phân công thực tập
    await connection.query(`
      CREATE TABLE IF NOT EXISTS phan_cong_thuc_tap (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sinh_vien_id INT NOT NULL,
        doanh_nghiep_id INT NOT NULL,
        dot_thuc_tap_id INT NOT NULL,
        giang_vien_id INT,
        ngay_bat_dau DATE NOT NULL,
        ngay_ket_thuc DATE NOT NULL,
        trang_thai ENUM('chua-bat-dau', 'dang-dien-ra', 'hoan-thanh', 'tam-dung') DEFAULT 'chua-bat-dau',
        diem_so DECIMAL(3,1) DEFAULT NULL,
        nhan_xet TEXT,
        ngay_nop_danh_gia TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (sinh_vien_id) REFERENCES sinh_vien(id) ON DELETE CASCADE,
        FOREIGN KEY (doanh_nghiep_id) REFERENCES doanh_nghiep(id) ON DELETE CASCADE,
        FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE CASCADE,
        FOREIGN KEY (giang_vien_id) REFERENCES giang_vien(id) ON DELETE SET NULL,
        INDEX idx_sinh_vien (sinh_vien_id),
        INDEX idx_doanh_nghiep (doanh_nghiep_id),
        INDEX idx_dot_thuc_tap (dot_thuc_tap_id),
        INDEX idx_trang_thai (trang_thai)
      )
    `);

    // 3. Bảng báo cáo thực tập
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bao_cao_thuc_tap (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phan_cong_id INT NOT NULL,
        loai_bao_cao ENUM('tuan', 'thang', 'cuoi-khoa') NOT NULL,
        tieu_de VARCHAR(255) NOT NULL,
        noi_dung TEXT NOT NULL,
        file_dinh_kem VARCHAR(500),
        ngay_nop DATE NOT NULL,
        trang_thai ENUM('chua-duyet', 'da-duyet', 'can-sua') DEFAULT 'chua-duyet',
        nhan_xet_gv TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (phan_cong_id) REFERENCES phan_cong_thuc_tap(id) ON DELETE CASCADE,
        INDEX idx_phan_cong (phan_cong_id),
        INDEX idx_loai_bao_cao (loai_bao_cao),
        INDEX idx_trang_thai (trang_thai),
        INDEX idx_ngay_nop (ngay_nop)
      )
    `);

    // 4. Bảng tin tuyển dụng
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tin_tuyen_dung (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doanh_nghiep_id INT NOT NULL,
        tieu_de VARCHAR(255) NOT NULL,
        mo_ta_cong_viec TEXT NOT NULL,
        yeu_cau TEXT NOT NULL,
        so_luong_tuyen INT DEFAULT 1,
        muc_luong VARCHAR(100),
        hinh_thuc_lam_viec VARCHAR(100),
        dia_diem VARCHAR(255),
        han_ung_tuyen DATE,
        trang_thai ENUM('dang-tuyen', 'tam-dung', 'het-han') DEFAULT 'dang-tuyen',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (doanh_nghiep_id) REFERENCES doanh_nghiep(id) ON DELETE CASCADE,
        INDEX idx_doanh_nghiep (doanh_nghiep_id),
        INDEX idx_trang_thai (trang_thai),
        INDEX idx_han_ung_tuyen (han_ung_tuyen)
      )
    `);

    // 5. Bảng ứng tuyển
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ung_tuyen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sinh_vien_id INT NOT NULL,
        tin_tuyen_dung_id INT NOT NULL,
        thu_xin_viec TEXT NOT NULL,
        cv_file VARCHAR(500),
        ngay_ung_tuyen DATE NOT NULL,
        trang_thai ENUM('dang-cho', 'duoc-chap-nhan', 'bi-tu-choi') DEFAULT 'dang-cho',
        ghi_chu TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (sinh_vien_id) REFERENCES sinh_vien(id) ON DELETE CASCADE,
        FOREIGN KEY (tin_tuyen_dung_id) REFERENCES tin_tuyen_dung(id) ON DELETE CASCADE,
        INDEX idx_sinh_vien (sinh_vien_id),
        INDEX idx_tin_tuyen_dung (tin_tuyen_dung_id),
        INDEX idx_trang_thai (trang_thai),
        UNIQUE KEY unique_ung_tuyen (sinh_vien_id, tin_tuyen_dung_id)
      )
    `);

    console.log('✅ Tạo các bảng thành công!');
    console.log('📋 Các bảng đã tạo:');
    console.log('  - dot_thuc_tap');
    console.log('  - phan_cong_thuc_tap');
    console.log('  - bao_cao_thuc_tap');
    console.log('  - tin_tuyen_dung');
    console.log('  - ung_tuyen');

  } catch (error) {
    console.error('❌ Lỗi tạo bảng:', error);
    throw error;
  }
}

if (require.main === module) {
  const { createDatabaseConnection, closeConnections } = require('./src/database/connection');

  createDatabaseConnection()
    .then(() => createMissingTables())
    .then(() => closeConnections())
    .then(() => {
      console.log('🎉 Hoàn tất tạo các bảng bổ sung!');
      process.exit(0);
    })
    .catch(async (error) => {
      try {
        await closeConnections();
      } catch (_) {
        // Ignore close errors in CLI mode
      }
      console.error('💥 Tạo các bảng bổ sung thất bại:', error.message);
      process.exit(1);
    });
}

module.exports = { createMissingTables };