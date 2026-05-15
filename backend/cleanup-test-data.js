// Cleanup script for re-testing internship flow
// Run: node cleanup-test-data.js
const db = require('./src/database/connection');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    console.log('===== CLEANUP TEST DATA =====');

    // 1) Bai nop + diem (FK dependants of dot_nop_bao_cao_theo_tuan)
    console.log('\n[1] Xóa bài nộp và điểm...');
    const r1 = await db.query('DELETE FROM bai_nop_cua_sinh_vien');
    const r2 = await db.query('DELETE FROM diem_theo_dot_nop');
    const r3 = await db.query('DELETE FROM dot_nop_bao_cao_theo_tuan');
    console.log(`  - bai_nop_cua_sinh_vien: ${r1.affectedRows ?? 'OK'}`);
    console.log(`  - diem_theo_dot_nop: ${r2.affectedRows ?? 'OK'}`);
    console.log(`  - dot_nop_bao_cao_theo_tuan: ${r3.affectedRows ?? 'OK'}`);

    // 2) Workflow đăng ký
    console.log('\n[2] Xóa hồ sơ đăng ký workflow...');
    const r4 = await db.query('DELETE FROM dang_ky_thuc_tap_sinh_vien');
    console.log(`  - dang_ky_thuc_tap_sinh_vien: ${r4.affectedRows ?? 'OK'}`);

    // 3) Reset student internship fields + dot_thuc_tap_id + collect CV paths first
    console.log('\n[3] Thu thập danh sách CV để xóa file...');
    const cvRows = await db.query(
      "SELECT cv_path FROM sinh_vien WHERE cv_path IS NOT NULL AND cv_path <> ''"
    );
    console.log(`  - Tìm thấy ${cvRows.length} CV records`);

    console.log('\n[4] Reset thông tin đăng ký + lựa chọn đợt của SV...');
    const r5 = await db.query(`
      UPDATE sinh_vien SET
        dot_thuc_tap_id = NULL,
        dot_thuc_tap_admin = NULL,
        nguyen_vong_thuc_tap = NULL,
        vi_tri_muon_ung_tuyen_thuc_tap = NULL,
        don_vi_thuc_tap = NULL,
        cong_ty_tu_lien_he = NULL,
        dia_chi_cong_ty = NULL,
        nguoi_lien_he_cong_ty = NULL,
        sdt_nguoi_lien_he = NULL,
        cv_path = NULL
    `);
    console.log(`  - sinh_vien rows reset: ${r5.affectedRows ?? 'OK'}`);

    // 5) FK dependants of dot_thuc_tap before deleting it
    console.log('\n[5] Xóa các bảng tham chiếu dot_thuc_tap...');
    for (const t of ['internship_timeline_milestones', 'phan_cong_thuc_tap', 'sinh_vien_thuc_tap']) {
      try {
        const r = await db.query(`DELETE FROM \`${t}\``);
        console.log(`  - ${t}: ${r.affectedRows ?? 'OK'}`);
      } catch (e) {
        console.log(`  - ${t}: skip (${e.message})`);
      }
    }

    // 6) Delete dot_thuc_tap
    console.log('\n[6] Xóa tất cả đợt thực tập...');
    const r6 = await db.query('DELETE FROM dot_thuc_tap');
    console.log(`  - dot_thuc_tap: ${r6.affectedRows ?? 'OK'}`);

    // 7) Reset auto-increments
    console.log('\n[7] Reset AUTO_INCREMENT...');
    for (const t of [
      'dot_thuc_tap', 'dot_nop_bao_cao_theo_tuan',
      'bai_nop_cua_sinh_vien', 'diem_theo_dot_nop',
      'dang_ky_thuc_tap_sinh_vien'
    ]) {
      try {
        await db.query(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 1`);
        console.log(`  - ${t}: reset to 1`);
      } catch (e) {
        console.log(`  - ${t}: skip (${e.message})`);
      }
    }

    // 8) Delete CV files from disk
    console.log('\n[8] Xóa file CV trên ổ đĩa...');
    const cvDir = path.join(__dirname, 'uploads', 'cv');
    let deleted = 0;
    let missing = 0;
    if (fs.existsSync(cvDir)) {
      // Delete every file in uploads/cv (since we just nulled all cv_path)
      const files = fs.readdirSync(cvDir);
      for (const f of files) {
        const full = path.join(cvDir, f);
        try {
          fs.unlinkSync(full);
          deleted++;
        } catch (e) {
          missing++;
        }
      }
    }
    console.log(`  - Đã xóa ${deleted} file CV, lỗi ${missing}`);

    // 9) Final counts
    console.log('\n===== COUNTS AFTER =====');
    const tables = [
      'sinh_vien', 'dot_thuc_tap', 'dang_ky_thuc_tap_sinh_vien',
      'bai_nop_cua_sinh_vien', 'diem_theo_dot_nop', 'dot_nop_bao_cao_theo_tuan',
      'phan_cong_thuc_tap'
    ];
    for (const t of tables) {
      const r = await db.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
      console.log(`  ${t}: ${r[0].c}`);
    }

    console.log('\n✅ DONE. Database sẵn sàng để test lại.');
    process.exit(0);
  } catch (e) {
    console.error('❌ ERROR:', e);
    process.exit(1);
  }
})();
