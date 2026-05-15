const connection = require('../database/connection');

class TeacherReports {
  static isMissingTableError(error) {
    return error && (error.code === 'ER_NO_SUCH_TABLE' || String(error.message || '').includes("doesn't exist"));
  }

  // Lấy danh sách sinh viên mà giảng viên hướng dẫn
  static async getStudentsByTeacher(maGiangVien) {
    try {
      // Match the actual columns shown in your screenshot
      const query = `
        SELECT 
          svhd.id,
          svhd.ma_giang_vien,
          svhd.ma_sinh_vien,
          svhd.ho_ten_sinh_vien,
          svhd.email_sinh_vien AS email_ca_nhan,
          svhd.so_dien_thoai_sinh_vien,
          svhd.lop_sinh_vien AS lop,
          svhd.ngay_sinh_sinh_vien AS ngay_sinh_vien,
          svhd.vi_tri_thuc_tap,
          svhd.doanh_nghiep_thuc_tap AS doanh_nghiep_thuc_tap,
          COALESCE(dn.ten_cong_ty, svhd.doanh_nghiep_thuc_tap) AS ten_cong_ty,
          dn.ten_nguoi_lien_he,
          dn.chuc_vu_nguoi_lien_he,
          dn.so_dien_thoai AS so_dien_thoai_doanh_nghiep,
          dn.email_cong_ty,
          dn.dia_chi_cong_ty,
          (
            SELECT dk.workflow_status_v2
            FROM dang_ky_thuc_tap_sinh_vien dk
            WHERE dk.sinh_vien_id = sv.id
            ORDER BY dk.created_at DESC, dk.id DESC
            LIMIT 1
          ) AS workflow_status_v2
        FROM sinh_vien_huong_dan svhd
        LEFT JOIN sinh_vien sv
          ON sv.ma_sinh_vien = svhd.ma_sinh_vien
        LEFT JOIN doanh_nghiep dn
          ON LOWER(TRIM(dn.ten_cong_ty)) = LOWER(TRIM(svhd.doanh_nghiep_thuc_tap))
        WHERE svhd.ma_giang_vien = ?
        ORDER BY svhd.id DESC
      `;
      
      const results = await connection.query(query, [maGiangVien]);
      return results;
    } catch (error) {
      if (TeacherReports.isMissingTableError(error)) {
        const fallbackQuery = `
          SELECT
            sv.id,
            gv.ma_giang_vien,
            sv.ma_sinh_vien,
            sv.ho_ten AS ho_ten_sinh_vien,
            sv.email_ca_nhan AS email_ca_nhan,
            sv.so_dien_thoai AS so_dien_thoai_sinh_vien,
            sv.lop,
            sv.ngay_sinh AS ngay_sinh_vien,
            sv.vi_tri_muon_ung_tuyen_thuc_tap AS vi_tri_thuc_tap,
            sv.don_vi_thuc_tap AS doanh_nghiep_thuc_tap,
            COALESCE(dn.ten_cong_ty, sv.don_vi_thuc_tap) AS ten_cong_ty,
            dn.ten_nguoi_lien_he,
            dn.chuc_vu_nguoi_lien_he,
            dn.so_dien_thoai AS so_dien_thoai_doanh_nghiep,
            dn.email_cong_ty,
            dn.dia_chi_cong_ty,
            (
              SELECT dk.workflow_status_v2
              FROM dang_ky_thuc_tap_sinh_vien dk
              WHERE dk.sinh_vien_id = sv.id
              ORDER BY dk.created_at DESC, dk.id DESC
              LIMIT 1
            ) AS workflow_status_v2
          FROM giang_vien gv
          JOIN sinh_vien sv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
          LEFT JOIN doanh_nghiep dn
            ON LOWER(TRIM(dn.ten_cong_ty)) = LOWER(TRIM(sv.don_vi_thuc_tap))
          WHERE gv.ma_giang_vien = ?
          ORDER BY sv.ho_ten ASC
        `;
        return await connection.query(fallbackQuery, [maGiangVien]);
      }
      console.error('❌ Error getting students by teacher:', error);
      throw error;
    }
  }

  // Lấy thống kê báo cáo của giảng viên
  static async getTeacherReportsStats(maGiangVien) {
    try {
      // Đếm tổng sinh viên hướng dẫn từ bảng thực tế sinh_vien_huong_dan
      let totalStudents;
      let activeInternships;

      try {
        [totalStudents] = await connection.query(
          'SELECT COUNT(*) as total FROM sinh_vien_huong_dan WHERE ma_giang_vien = ?',
          [maGiangVien]
        );

        [activeInternships] = await connection.query(
          `SELECT COUNT(*) as total
           FROM sinh_vien_huong_dan
           WHERE ma_giang_vien = ? AND COALESCE(TRIM(doanh_nghiep_thuc_tap), '') <> ''`,
          [maGiangVien]
        );
      } catch (error) {
        if (!TeacherReports.isMissingTableError(error)) {
          throw error;
        }

        [totalStudents] = await connection.query(
          `SELECT COUNT(*) as total
           FROM giang_vien gv
           JOIN sinh_vien sv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
           WHERE gv.ma_giang_vien = ?`,
          [maGiangVien]
        );

        [activeInternships] = await connection.query(
          `SELECT COUNT(*) as total
           FROM giang_vien gv
           JOIN sinh_vien sv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
           WHERE gv.ma_giang_vien = ?
             AND COALESCE(TRIM(sv.don_vi_thuc_tap), '') <> ''`,
          [maGiangVien]
        );
      }

      // Tạm thời chưa có bảng báo cáo của giảng viên -> đặt submittedReports = 0
      const submittedReports = { total: 0 };

      const total = Number(totalStudents?.total || 0);
      const submitted = Number(submittedReports?.total || 0);
      const active = Number(activeInternships?.total || 0);

      // Dùng activeInternships làm chỉ số tiến độ tham gia
      const completionRate = total > 0 
        ? Math.round((active / total) * 100)
        : 0;

      return {
        totalStudents: total,
        activeInternships: active,
        submittedReports: submitted,
        pendingReports: Math.max(total - submitted, 0),
        completionRate
      };
    } catch (error) {
      console.error('❌ Error getting teacher reports stats:', error);
      throw error;
    }
  }

  // Tạo báo cáo mới
  static async createReport(reportData) {
    try {
      const {
        nguoi_nop_id,
        tieu_de,
        noi_dung,
        loai_bao_cao,
        file_dinh_kem,
        ma_sinh_vien
      } = reportData;

      const query = `
        INSERT INTO bao_cao_da_nop (
          nguoi_nop_id,
          loai_nguoi_nop,
          tieu_de,
          noi_dung,
          loai_bao_cao,
          file_dinh_kem,
          trang_thai,
          ngay_nop,
          ma_sinh_vien_lien_quan
        ) VALUES (?, 'giang_vien', ?, ?, ?, ?, 'da_nop', NOW(), ?)
      `;

      const result = await connection.query(query, [
        nguoi_nop_id,
        tieu_de,
        noi_dung,
        loai_bao_cao,
        file_dinh_kem,
        ma_sinh_vien
      ]);

      return { 
        id: result.insertId, 
        success: true,
        message: 'Tạo báo cáo thành công'
      };
    } catch (error) {
      console.error('❌ Error creating report:', error);
      throw error;
    }
  }

  // Lấy danh sách báo cáo đã nộp của giảng viên
  static async getSubmittedReports(maGiangVien, page = 1, limit = 10) {
    try {
      // Hiện tại chưa có bảng báo cáo của giảng viên -> trả về danh sách rỗng
      return {
        reports: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalReports: 0,
          limit
        }
      };
    } catch (error) {
      console.error('❌ Error getting submitted reports:', error);
      throw error;
    }
  }
}

module.exports = TeacherReports;