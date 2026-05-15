require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'quanly_thuctap'
  });
  const [cols] = await conn.execute('DESCRIBE accounts');
  console.log('Columns:', cols.map(c => c.Field).join(', '));
  const [admins] = await conn.execute("SELECT id, role FROM accounts WHERE role = 'admin' LIMIT 5");
  console.log('Admins:', JSON.stringify(admins));
  await conn.end();
})().catch(e => console.error(e.message));
