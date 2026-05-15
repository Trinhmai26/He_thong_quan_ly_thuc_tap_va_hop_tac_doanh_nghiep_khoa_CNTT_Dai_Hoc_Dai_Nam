// Script migration đơn giản - chạy trực tiếp SQL
// File: create-new-tables.js

const { query } = require('./src/database/connection');

async function createTables() {
  try {
    console.log('🚀 Bắt đầu tạo cấu trúc database mới...');

    // 1. Drop bảng accounts cũ nếu tồn tại
    console.log('🗑️  Xóa bảng accounts cũ...');
    await query('DROP TABLE IF EXISTS accounts');

    // 2. Tạo bảng accounts mới (chỉ cho authentication)
    console.log('🏗️  Tạo bảng accounts...');
    await query(`
      CREATE TABLE accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL UNIQUE COMMENT 'Mã đăng nhập',
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'sinh-vien', 'giang-vien', 'doanh-nghiep') NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_user_id (user_id),
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng tài khoản đăng nhập'
    `);

    // 3. Tạo bảng admin
    console.log('🏗️  Tạo bảng admin...');
    await query(`
      CREATE TABLE admin (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NULL,
        position VARCHAR(100) NULL COMMENT 'Chức vụ quản trị',
        permissions JSON NULL COMMENT 'Quyền hạn cụ thể',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        INDEX idx_account_id (account_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng thông tin quản trị viên'
    `);

    // 4. Tạo bảng sinh_vien
    console.log('🏗️  Tạo bảng sinh_vien...');
    await query(`
      CREATE TABLE sinh_vien (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        ma_sinh_vien VARCHAR(20) NOT NULL UNIQUE COMMENT 'Mã sinh viên',
        ho_ten VARCHAR(255) NOT NULL,
        lop VARCHAR(50) NULL,
        khoa VARCHAR(100) NULL,
        nganh VARCHAR(100) NULL,
        khoa_hoc VARCHAR(20) NULL COMMENT 'Khóa học (VD: K17, K18)',
        ngay_sinh DATE NULL,
        gioi_tinh ENUM('Nam', 'Nữ', 'Khác') NULL,
        dia_chi TEXT NULL,
        so_dien_thoai VARCHAR(20) NULL,
        email_ca_nhan VARCHAR(255) NULL,
        gpa DECIMAL(3,2) NULL COMMENT 'Điểm trung bình tích lũy',
        tinh_trang_hoc_tap ENUM('Đang học', 'Tạm nghỉ', 'Thôi học', 'Tốt nghiệp') DEFAULT 'Đang học',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        INDEX idx_account_id (account_id),
        INDEX idx_ma_sinh_vien (ma_sinh_vien),
        INDEX idx_lop (lop),
        INDEX idx_khoa (khoa)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng thông tin sinh viên'
    `);

    // 5. Tạo bảng giang_vien
    console.log('🏗️  Tạo bảng giang_vien...');
    await query(`
      CREATE TABLE giang_vien (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        ma_giang_vien VARCHAR(20) NOT NULL UNIQUE COMMENT 'Mã giảng viên',
        ho_ten VARCHAR(255) NOT NULL,
        khoa VARCHAR(100) NOT NULL,
        bo_mon VARCHAR(100) NULL,
        chuc_vu VARCHAR(100) NULL COMMENT 'Chức vụ (Giảng viên, Phó trưởng khoa, Trưởng khoa, ...)',
        hoc_vi VARCHAR(50) NULL COMMENT 'Học vị (Thạc sĩ, Tiến sĩ, ...)',
        chuyen_mon TEXT NULL COMMENT 'Chuyên môn, lĩnh vực nghiên cứu',
        so_dien_thoai VARCHAR(20) NULL,
        email_ca_nhan VARCHAR(255) NULL,
        dia_chi TEXT NULL,
        kinh_nghiem_lam_viec TEXT NULL,
        bang_cap TEXT NULL COMMENT 'Các bằng cấp đã có',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        INDEX idx_account_id (account_id),
        INDEX idx_ma_giang_vien (ma_giang_vien),
        INDEX idx_khoa (khoa),
        INDEX idx_bo_mon (bo_mon)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng thông tin giảng viên'
    `);

    // 6. Tạo bảng doanh_nghiep
    console.log('🏗️  Tạo bảng doanh_nghiep...');
    await query(`
      CREATE TABLE doanh_nghiep (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        ma_doanh_nghiep VARCHAR(20) NOT NULL UNIQUE COMMENT 'Mã đối tác doanh nghiệp',
        ten_cong_ty VARCHAR(255) NOT NULL,
        ten_nguoi_lien_he VARCHAR(255) NOT NULL COMMENT 'Tên người đại diện liên hệ',
        chuc_vu_nguoi_lien_he VARCHAR(100) NULL COMMENT 'Chức vụ người liên hệ',
        dia_chi_cong_ty TEXT NOT NULL,
        so_dien_thoai VARCHAR(20) NOT NULL,
        email_cong_ty VARCHAR(255) NULL,
        website VARCHAR(255) NULL,
        linh_vuc_hoat_dong VARCHAR(255) NULL COMMENT 'Lĩnh vực kinh doanh',
        quy_mo_nhan_su VARCHAR(50) NULL COMMENT 'Quy mô nhân sự (VD: 10-50, 51-200, 200+)',
        mo_ta_cong_ty TEXT NULL,
        yeu_cau_thuc_tap TEXT NULL COMMENT 'Yêu cầu đối với sinh viên thực tập',
        so_luong_nhan_thuc_tap INT DEFAULT 0 COMMENT 'Số lượng sinh viên có thể nhận thực tập',
        thoi_gian_thuc_tap VARCHAR(100) NULL COMMENT 'Thời gian thực tập (VD: 3 tháng, 6 tháng)',
        dia_chi_thuc_tap TEXT NULL COMMENT 'Địa chỉ nơi thực tập (có thể khác với địa chỉ công ty)',
        trang_thai_hop_tac ENUM('Đang hợp tác', 'Tạm dừng', 'Ngừng hợp tác') DEFAULT 'Đang hợp tác',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        INDEX idx_account_id (account_id),
        INDEX idx_ma_doanh_nghiep (ma_doanh_nghiep),
        INDEX idx_ten_cong_ty (ten_cong_ty),
        INDEX idx_linh_vuc (linh_vuc_hoat_dong),
        INDEX idx_trang_thai (trang_thai_hop_tac)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng thông tin doanh nghiệp'
    `);

    // 7. Insert tài khoản admin mặc định
    console.log('📥 Tạo tài khoản admin mặc định...');
    await query(`
      INSERT INTO accounts (user_id, email, password_hash, role, is_active) 
      VALUES ('admin001', 'admin@dainam.edu.vn', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', TRUE)
    `);

    // 8. Insert profile admin
    console.log('📥 Tạo profile admin...');
    await query(`
      INSERT INTO admin (account_id, full_name, position) 
      VALUES (1, 'Quản trị viên hệ thống', 'Quản trị viên')
    `);

    console.log('✅ Tạo cấu trúc database thành công!');

    // Kiểm tra các bảng đã được tạo
    console.log('\n🔍 Kiểm tra các bảng đã tạo:');
    
    const tables = ['accounts', 'admin', 'sinh_vien', 'giang_vien', 'doanh_nghiep'];
    
    for (const table of tables) {
      try {
        const rows = await query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✓ Bảng ${table}: ${rows[0].count} bản ghi`);
      } catch (error) {
        console.log(`✗ Bảng ${table}: Lỗi - ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Lỗi tạo cấu trúc database:', error);
    throw error;
  }
}

if (require.main === module) {
  const { createDatabaseConnection, closeConnections } = require('./src/database/connection');

  createDatabaseConnection()
    .then(() => createTables())
    .then(() => closeConnections())
    .then(() => {
      console.log('🎉 Hoàn tất tạo các bảng lõi!');
      process.exit(0);
    })
    .catch(async (error) => {
      try {
        await closeConnections();
      } catch (_) {
        // Ignore close errors in CLI mode
      }
      console.error('💥 Tạo các bảng lõi thất bại:', error.message);
      process.exit(1);
    });
}

module.exports = { createTables };