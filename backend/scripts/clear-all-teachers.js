const db = require('../src/database/connection');
const SinhVien = require('../src/models/SinhVien');

(async () => {
  try {
    const before = await db.query('SELECT COUNT(*) AS total FROM giang_vien');
    const assigned = await db.query(
      "SELECT COUNT(*) AS total FROM sinh_vien WHERE COALESCE(TRIM(giang_vien_huong_dan), '') <> ''"
    );

    await db.query(
      "UPDATE sinh_vien SET giang_vien_huong_dan = NULL, updated_at = NOW() WHERE COALESCE(TRIM(giang_vien_huong_dan), '') <> ''"
    );

    try {
      await db.query('DELETE FROM sinh_vien_huong_dan');
    } catch (error) {
      const message = String((error && error.message) || '');
      if (!message.includes("doesn't exist") && !message.includes('does not exist')) {
        throw error;
      }
    }

    await db.query('DELETE FROM giang_vien');
    await SinhVien.recalcAssignmentStatus();

    const after = await db.query('SELECT COUNT(*) AS total FROM giang_vien');

    const summary = {
      deletedTeachers: Number(before[0]?.total || 0) - Number(after[0]?.total || 0),
      teachersBefore: Number(before[0]?.total || 0),
      teachersAfter: Number(after[0]?.total || 0),
      resetAssignedStudents: Number(assigned[0]?.total || 0)
    };

    console.log(JSON.stringify(summary));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
