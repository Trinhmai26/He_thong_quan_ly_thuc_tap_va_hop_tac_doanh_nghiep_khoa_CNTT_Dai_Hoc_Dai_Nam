const db = require('./src/database/connection');
(async () => {
  try {
    // 1. Fallback query: find teacher by student name match
    const fallback = await db.query(
      `SELECT sv.ma_sinh_vien, sv.ho_ten AS sv_name, sv.giang_vien_huong_dan,
              gv.ma_giang_vien, gv.ho_ten AS gv_name
       FROM sinh_vien sv
       LEFT JOIN giang_vien gv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
       WHERE sv.ma_sinh_vien = '1671020196'`,
      []
    );
    console.log('Fallback result:', JSON.stringify(fallback, null, 2));

    // 2. All slots in DB
    const slots = await db.query(
      'SELECT id, tieu_de, loai_bao_cao, ma_giang_vien FROM dot_nop_bao_cao_theo_tuan ORDER BY id DESC LIMIT 20',
      []
    );
    console.log('All slots:', JSON.stringify(slots, null, 2));

    // 3. Submissions for student
    const subs = await db.query(
      `SELECT s.id, s.slot_id, s.original_name, d.loai_bao_cao, d.tieu_de
       FROM bai_nop_cua_sinh_vien s
       JOIN dot_nop_bao_cao_theo_tuan d ON d.id = s.slot_id
       WHERE s.ma_sinh_vien = '1671020196'`,
      []
    );
    console.log('Submissions:', JSON.stringify(subs, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
