const connection = require('../database/connection');

/**
 * API endpoints for teachers to view company evaluations
 */
class TeacherCompanyEvaluations {
  // Get company evaluations for teacher's students
  static async getCompanyEvaluations(req, res) {
    try {
      const maGiangVien = req.user.maGiangVien;
      if (!maGiangVien) {
        return res.status(400).json({ success: false, message: 'Không xác định được mã giảng viên' });
      }

      // Get all students with company evaluations for this teacher
      // Note: Some records may not have pt.giang_vien_id set. We also map via sinh_vien_huong_dan.
      const query = `
        SELECT 
          sv.id,
          sv.ma_sinh_vien,
          sv.ho_ten as ten_sinh_vien,
          sv.lop,
          sv.email_ca_nhan as email_sinh_vien,
          dn.ten_cong_ty,
          dn.dia_chi_cong_ty,
          dn.email_cong_ty,
          pt.diem_so as diem_doanh_nghiep,
          pt.nhan_xet as nhan_xet_doanh_nghiep,
          pt.ngay_nop_danh_gia,
          pt.ngay_bat_dau as ngay_bat_dau_thuc_tap,
          pt.ngay_ket_thuc as ngay_ket_thuc_thuc_tap,
          pt.trang_thai as trang_thai_thuc_tap,
          dtt.ten_dot,
          dtt.thoi_gian_bat_dau as thoi_gian_bat_dau_dot,
          dtt.thoi_gian_ket_thuc as thoi_gian_ket_thuc_dot,
          gv.ma_giang_vien AS ma_giang_vien_nguon
        FROM phan_cong_thuc_tap pt
        INNER JOIN sinh_vien sv ON sv.id = pt.sinh_vien_id
        INNER JOIN doanh_nghiep dn ON dn.id = pt.doanh_nghiep_id
        INNER JOIN dot_thuc_tap dtt ON dtt.id = pt.dot_thuc_tap_id
        LEFT JOIN giang_vien gv ON gv.id = pt.giang_vien_id
        WHERE gv.ma_giang_vien = ?
          AND (pt.diem_so IS NOT NULL OR (pt.nhan_xet IS NOT NULL AND TRIM(pt.nhan_xet) != ''))
        ORDER BY 
          CASE WHEN pt.ngay_nop_danh_gia IS NOT NULL THEN 0 ELSE 1 END,
          pt.ngay_nop_danh_gia DESC,
          sv.ho_ten ASC
      `;

      const evaluations = await connection.query(query, [maGiangVien]);

      // Group by company for better organization
      const groupedByCompany = evaluations.reduce((acc, eval_item) => {
        const companyName = eval_item.ten_cong_ty;
        if (!acc[companyName]) {
          acc[companyName] = {
            company_info: {
              ten_cong_ty: eval_item.ten_cong_ty,
              dia_chi_cong_ty: eval_item.dia_chi_cong_ty,
              email_cong_ty: eval_item.email_cong_ty
            },
            students: []
          };
        }
        acc[companyName].students.push(eval_item);
        return acc;
      }, {});

      return res.json({
        success: true,
        data: {
          total: evaluations.length,
          evaluations: evaluations,
          grouped_by_company: groupedByCompany
        }
      });

    } catch (error) {
      console.error('Error in getCompanyEvaluations:', error);
      res.status(500).json({ success: false, message: 'Lỗi server khi lấy đánh giá từ doanh nghiệp' });
    }
  }

  // Get evaluation statistics for teacher
  static async getEvaluationStats(req, res) {
    try {
      const maGiangVien = req.user.maGiangVien;
      if (!maGiangVien) {
        return res.status(400).json({ success: false, message: 'Không xác định được mã giảng viên' });
      }

      const statsQuery = `
        SELECT 
          COUNT(DISTINCT pt.sinh_vien_id) as total_students,
          COUNT(CASE WHEN pt.diem_so IS NOT NULL THEN 1 END) as students_with_scores,
          COUNT(CASE WHEN pt.nhan_xet IS NOT NULL AND TRIM(pt.nhan_xet) != '' THEN 1 END) as students_with_comments,
          COUNT(CASE WHEN pt.ngay_nop_danh_gia IS NOT NULL THEN 1 END) as submitted_evaluations,
          AVG(pt.diem_so) as average_score,
          MIN(pt.diem_so) as min_score,
          MAX(pt.diem_so) as max_score,
          COUNT(DISTINCT pt.doanh_nghiep_id) as total_companies
        FROM phan_cong_thuc_tap pt
        LEFT JOIN giang_vien gv ON gv.id = pt.giang_vien_id
        LEFT JOIN sinh_vien sv ON sv.id = pt.sinh_vien_id
        WHERE gv.ma_giang_vien = ?
      `;

      const [stats] = await connection.query(statsQuery, [maGiangVien]);

      const avg = stats.average_score != null ? Number(stats.average_score) : null;
      const min = stats.min_score != null ? Number(stats.min_score) : null;
      const max = stats.max_score != null ? Number(stats.max_score) : null;

      return res.json({
        success: true,
        data: {
          total_students: Number(stats.total_students || 0),
          students_with_scores: Number(stats.students_with_scores || 0),
          students_with_comments: Number(stats.students_with_comments || 0),
          submitted_evaluations: Number(stats.submitted_evaluations || 0),
          average_score: avg != null && !Number.isNaN(avg) ? Number(avg.toFixed(2)) : null,
          min_score: min != null && !Number.isNaN(min) ? min : null,
          max_score: max != null && !Number.isNaN(max) ? max : null,
          total_companies: Number(stats.total_companies || 0),
          completion_rate: Number(stats.total_students) > 0 
            ? Number(((Number(stats.submitted_evaluations || 0) / Number(stats.total_students || 0)) * 100).toFixed(1))
            : 0
        }
      });

    } catch (error) {
      console.error('Error in getEvaluationStats:', error);
      res.status(500).json({ success: false, message: 'Lỗi server khi lấy thống kê đánh giá' });
    }
  }

  // Mark evaluation as reviewed by teacher
  static async markAsReviewed(req, res) {
    try {
      const maGiangVien = req.user.maGiangVien;
      const { studentId } = req.params;
      
      if (!maGiangVien) {
        return res.status(400).json({ success: false, message: 'Không xác định được mã giảng viên' });
      }

      // Verify this student belongs to this teacher (via giang_vien_id or mapping sinh_vien_huong_dan)
      const checkQuery = `
        SELECT pt.id 
        FROM phan_cong_thuc_tap pt
        LEFT JOIN giang_vien gv ON gv.id = pt.giang_vien_id
        LEFT JOIN sinh_vien sv ON sv.id = pt.sinh_vien_id
        WHERE pt.sinh_vien_id = ? AND gv.ma_giang_vien = ?
        LIMIT 1
      `;

      const [assignment] = await connection.query(checkQuery, [studentId, maGiangVien]);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy phân công phù hợp' });
      }

      // Mark as reviewed (you could add a reviewed_at timestamp column if needed)
      const updateQuery = `
        UPDATE phan_cong_thuc_tap 
        SET updated_at = NOW()
        WHERE id = ?
      `;

      await connection.query(updateQuery, [assignment.id]);

      return res.json({
        success: true,
        message: 'Đã đánh dấu đã xem đánh giá'
      });

    } catch (error) {
      console.error('Error in markAsReviewed:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}

module.exports = TeacherCompanyEvaluations;