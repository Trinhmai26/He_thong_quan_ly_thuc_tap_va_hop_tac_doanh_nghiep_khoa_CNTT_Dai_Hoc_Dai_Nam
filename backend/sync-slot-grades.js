/**
 * sync-slot-grades.js
 * Sync latest grade from phan_cong_thuc_tap -> diem_theo_dot_nop for all submitted slots.
 * Safe to run multiple times (uses ON DUPLICATE KEY UPDATE).
 */
const conn = require('./src/database/connection');

(async () => {
  try {
    // Get all students with a grade
    const grades = await conn.query(`
      SELECT sv.ma_sinh_vien,
             COALESCE(pct.diem_giang_vien, pct.diem_so) AS diem,
             COALESCE(pct.nhan_xet_giang_vien, pct.nhan_xet) AS nhan_xet
      FROM phan_cong_thuc_tap pct
      JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id
      WHERE COALESCE(pct.diem_giang_vien, pct.diem_so) IS NOT NULL
    `);

    console.log('Students with grades:', grades.length);
    let synced = 0;

    for (const g of grades) {
      // Find all slots the student has submitted to
      const slots = await conn.query(`
        SELECT DISTINCT b.slot_id, d.tieu_de
        FROM bai_nop_cua_sinh_vien b
        JOIN dot_nop_bao_cao_theo_tuan d ON d.id = b.slot_id
        WHERE b.ma_sinh_vien = ?
        ORDER BY b.slot_id ASC
      `, [g.ma_sinh_vien]);

      console.log(`SV ${g.ma_sinh_vien}: ${slots.length} submitted slots, grade=${g.diem}`);

      for (const sl of slots) {
        // Check existing
        const existing = await conn.query(
          'SELECT id, diem_giang_vien FROM diem_theo_dot_nop WHERE slot_id=? AND ma_sinh_vien=?',
          [sl.slot_id, g.ma_sinh_vien]
        );

        if (existing.length === 0) {
          // Insert missing entry
          await conn.query(
            `INSERT INTO diem_theo_dot_nop (slot_id, ma_sinh_vien, diem_giang_vien, nhan_xet_giang_vien)
             VALUES (?, ?, ?, ?)`,
            [sl.slot_id, g.ma_sinh_vien, g.diem, g.nhan_xet || null]
          );
          console.log(`  -> INSERTED slot ${sl.slot_id} (${sl.tieu_de}): ${g.diem}`);
          synced++;
        } else {
          console.log(`  -> OK slot ${sl.slot_id} (${sl.tieu_de}): existing=${existing[0].diem_giang_vien}`);
        }
      }
    }

    console.log(`\nDone. Synced ${synced} new slot grade(s).`);
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
})();
