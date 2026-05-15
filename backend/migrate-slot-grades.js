// Migration script: move grades from phan_cong_thuc_tap -> diem_theo_dot_nop (slot-based)
// Assigns existing grade to the FIRST slot the student submitted to (Tuần 1)
const conn = require('./src/database/connection');

async function migrate() {
  console.log('🔄 Migrating grades to per-slot table...');

  // Find students who have grades in phan_cong_thuc_tap but NOT yet in diem_theo_dot_nop
  const grades = await conn.query(`
    SELECT sv.ma_sinh_vien,
           COALESCE(pct.diem_giang_vien, pct.diem_so) AS diem,
           COALESCE(pct.nhan_xet_giang_vien, pct.nhan_xet) AS nhan_xet
    FROM phan_cong_thuc_tap pct
    JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id
    WHERE COALESCE(pct.diem_giang_vien, pct.diem_so) IS NOT NULL
      AND CONVERT(sv.ma_sinh_vien USING utf8mb4) COLLATE utf8mb4_unicode_ci NOT IN (
        SELECT DISTINCT CONVERT(ma_sinh_vien USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM diem_theo_dot_nop
      )
  `);

  if (!grades || grades.length === 0) {
    console.log('✅ No grades to migrate (all already migrated or no grades found).');
    process.exit(0);
  }

  console.log(`Found ${grades.length} student(s) with unmigrated grades.`);

  for (const g of grades) {
    // Find submission slots for this student, ordered by slot_id ASC (Tuần 1 first)
    const slots = await conn.query(`
      SELECT DISTINCT b.slot_id, d.tieu_de
      FROM bai_nop_cua_sinh_vien b
      JOIN dot_nop_bao_cao_theo_tuan d ON d.id = b.slot_id
      WHERE b.ma_sinh_vien = ?
      ORDER BY b.slot_id ASC
    `, [g.ma_sinh_vien]);

    if (!slots || slots.length === 0) {
      console.log(`  ⚠️  Student ${g.ma_sinh_vien}: has grade but no submissions, skipping.`);
      continue;
    }

    // Assign grade to the first (earliest) slot = Tuần 1
    const firstSlot = slots[0];
    await conn.query(`
      INSERT INTO diem_theo_dot_nop (slot_id, ma_sinh_vien, diem_giang_vien, nhan_xet_giang_vien)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        diem_giang_vien = VALUES(diem_giang_vien),
        nhan_xet_giang_vien = VALUES(nhan_xet_giang_vien),
        updated_at = NOW()
    `, [firstSlot.slot_id, g.ma_sinh_vien, g.diem, g.nhan_xet]);

    console.log(`  ✅ Student ${g.ma_sinh_vien}: grade ${g.diem}/10 → slot ${firstSlot.slot_id} (${firstSlot.tieu_de})`);
  }

  console.log('\n✅ Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
