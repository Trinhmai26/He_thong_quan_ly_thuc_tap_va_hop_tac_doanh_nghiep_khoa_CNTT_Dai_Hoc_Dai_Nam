const { createDatabaseConnection, closeConnections } = require('./src/database/connection');
const { createTables } = require('./create-new-tables');
const { createMissingTables } = require('./create-missing-tables');

const setupDatabase = async () => {
  try {
    console.log('🎯 ===== THIẾT LẬP DATABASE THỰC TẬP =====');
    console.log('📍 Khoa CNTT - Đại học Đại Nam');
    console.log('');

    // Bước 1: Tạo database nếu chưa tồn tại
    console.log('📝 Bước 1: Tạo database...');
    await createDatabaseConnection();
    console.log('✅ Database đã sẵn sàng!');
    console.log('');

    // Bước 2: Tạo schema lõi
    console.log('📝 Bước 2: Tạo schema lõi...');
    await createTables();
    console.log('✅ Hoàn thành tạo schema lõi!');
    console.log('');

    // Bước 3: Tạo các bảng bổ sung
    console.log('📝 Bước 3: Tạo các bảng bổ sung...');
    await createMissingTables();
    console.log('✅ Hoàn thành tạo tất cả bảng!');
    console.log('');

    console.log('🎉 ===== THIẾT LẬP HOÀN TẤT =====');
    console.log('');
    console.log('📊 Hệ thống đã sẵn sàng với:');
    console.log('   ✓ 10 bảng dữ liệu');
    console.log('');
    console.log('🚀 Bây giờ bạn có thể chạy: npm run dev');
    console.log('───────────────────────────────────────');

    await closeConnections();

  } catch (error) {
    console.error('💥 Lỗi thiết lập database:', error);
    try {
      await closeConnections();
    } catch (_) {
      // Ignore close errors during setup failure
    }
    process.exit(1);
  }
};

// Chạy setup
setupDatabase();