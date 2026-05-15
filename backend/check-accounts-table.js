const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkAccountsTable() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'quanly_thuctap'
    });

    console.log('📊 Kiểm tra cấu trúc bảng accounts...');
    
    // Lấy cấu trúc bảng
    const [columns] = await connection.execute('DESCRIBE accounts');
    console.log('\n🔍 Cấu trúc bảng accounts:');
    console.table(columns);

    // Lấy tất cả tài khoản admin
    console.log('\n👤 Danh sách tài khoản admin:');
    const [admins] = await connection.execute('SELECT * FROM accounts WHERE role = ?', ['admin']);
    console.table(admins);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkAccountsTable();