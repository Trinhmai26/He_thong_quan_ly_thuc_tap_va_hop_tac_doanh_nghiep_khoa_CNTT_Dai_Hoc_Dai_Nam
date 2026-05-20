const SinhVien = require('../models/SinhVien');
const GiangVien = require('../models/GiangVien');
const DoanhNghiep = require('../models/DoanhNghiep');
const connection = require('../database/connection');

class DashboardController {
  // GET /api/dashboard/stats - Lấy thống kê dashboard
  static async getStats(req, res) {
    try {
      // Lấy số lượng sinh viên
      const sinhVienResult = await SinhVien.getAllWithPagination(1, 1);
      const totalSinhVien = sinhVienResult.pagination.total;
      
      // Lấy số lượng giảng viên
      const giangVienResult = await GiangVien.getAll(1, 1);
      const totalGiangVien = giangVienResult.pagination.total;
      
      // Lấy số lượng doanh nghiệp
      const doanhNghiepResult = await DoanhNghiep.getAll(1, 1);
      const totalDoanhNghiep = doanhNghiepResult.pagination.total;
      
      // Lấy số lượng sinh viên đang thực tập (có thông tin thực tập)
      const [internshipStats] = await connection.query(`
        SELECT 
          COUNT(DISTINCT sv.ma_sinh_vien) as total_interns
        FROM sinh_vien sv
        INNER JOIN sinh_vien_huong_dan svhd ON sv.ma_sinh_vien = svhd.ma_sinh_vien
        WHERE svhd.doanh_nghiep_thuc_tap IS NOT NULL AND svhd.doanh_nghiep_thuc_tap != ''
      `);
      
      const totalInterns = internshipStats.total_interns || 0;
      
      // Lấy số báo cáo (có thể mở rộng sau)
      const totalReports = 0; // Placeholder
      
      const stats = {
        totalSinhVien,
        totalGiangVien,
        totalDoanhNghiep,
        totalInterns,
        totalReports,
        lastUpdated: new Date().toISOString()
      };
      
      res.json({
        success: true,
        message: 'Lấy thống kê dashboard thành công',
        data: stats
      });
      
    } catch (error) {
      console.error('❌ Lỗi lấy thống kê dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thống kê dashboard',
        error: error.message
      });
    }
  }

  // GET /api/dashboard/overview - Lấy thống kê tổng quan cho admin
  static async getOverview(req, res) {
    try {
      // Thống kê sinh viên
      const [studentStats] = await connection.query(`
        SELECT 
          COUNT(*) as total_students,
          COUNT(CASE WHEN giang_vien_huong_dan IS NOT NULL AND giang_vien_huong_dan <> '' THEN 1 END) as students_with_advisor,
          COUNT(CASE WHEN don_vi_thuc_tap IS NOT NULL AND don_vi_thuc_tap <> '' THEN 1 END) as students_with_company,
          COUNT(CASE WHEN trang_thai_phan_cong = 'da-phan-cong' THEN 1 END) as fully_assigned_students
        FROM sinh_vien
      `);

      // Thống kê giảng viên
      const [teacherStats] = await connection.query(`
        SELECT 
          COUNT(*) as total_teachers,
          COUNT(CASE WHEN so_sinh_vien_huong_dan > 0 THEN 1 END) as active_advisors,
          SUM(COALESCE(so_sinh_vien_huong_dan, 0)) as total_supervision_count
        FROM giang_vien
      `);

      // Thống kê doanh nghiệp
      const [companyStats] = await connection.query(`
        SELECT 
          COUNT(*) as total_companies,
          COUNT(CASE WHEN trang_thai_hop_tac = 'Đang hợp tác' THEN 1 END) as active_companies
        FROM doanh_nghiep
      `);

      // Thống kê đợt thực tập
      const [batchStats] = await connection.query(`
        SELECT 
          COUNT(*) as total_batches,
          COUNT(CASE WHEN trang_thai = 'dang-dien-ra' THEN 1 END) as active_batches,
          COUNT(CASE WHEN trang_thai = 'sap-mo' THEN 1 END) as upcoming_batches
        FROM dot_thuc_tap
      `);

      const overview = {
        students: {
          total: studentStats.total_students || 0,
          withAdvisor: studentStats.students_with_advisor || 0,
          withCompany: studentStats.students_with_company || 0,
          fullyAssigned: studentStats.fully_assigned_students || 0
        },
        teachers: {
          total: teacherStats.total_teachers || 0,
          activeAdvisors: teacherStats.active_advisors || 0,
          totalSupervisionCount: teacherStats.total_supervision_count || 0
        },
        companies: {
          total: companyStats.total_companies || 0,
          active: companyStats.active_companies || 0
        },
        batches: {
          total: batchStats.total_batches || 0,
          active: batchStats.active_batches || 0,
          upcoming: batchStats.upcoming_batches || 0
        }
      };

      res.json({
        success: true,
        message: 'Lấy thống kê tổng quan thành công',
        data: overview
      });

    } catch (error) {
      console.error('❌ Lỗi lấy thống kê tổng quan:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thống kê tổng quan',
        error: error.message
      });
    }
  }

  // GET /api/dashboard/summary - Lấy tóm tắt hệ thống
  static async getSummary(req, res) {
    try {
      // Tóm tắt nhanh các con số quan trọng
      const [summary] = await connection.query(`
        SELECT 
          (SELECT COUNT(*) FROM sinh_vien) as total_students,
          (SELECT COUNT(*) FROM giang_vien) as total_teachers,
          (SELECT COUNT(*) FROM doanh_nghiep) as total_companies,
          (SELECT COUNT(*) FROM dot_thuc_tap WHERE trang_thai = 'dang-dien-ra') as active_batches,
          (SELECT COUNT(*) FROM sinh_vien WHERE trang_thai_phan_cong = 'da-phan-cong') as assigned_students,
          (SELECT COUNT(*) FROM sinh_vien WHERE nguyen_vong_thuc_tap = 'khoa_gioi_thieu') as khoa_intro_students,
          (SELECT COUNT(*) FROM sinh_vien WHERE nguyen_vong_thuc_tap = 'tu_lien_he') as self_contact_students
      `);

      const data = summary || {};

      res.json({
        success: true,
        message: 'Lấy tóm tắt hệ thống thành công',
        data: {
          totalStudents: data.total_students || 0,
          totalTeachers: data.total_teachers || 0,
          totalCompanies: data.total_companies || 0,
          activeBatches: data.active_batches || 0,
          assignedStudents: data.assigned_students || 0,
          khoaIntroStudents: data.khoa_intro_students || 0,
          selfContactStudents: data.self_contact_students || 0,
          assignmentRate: data.total_students > 0 ? 
            Math.round((data.assigned_students / data.total_students) * 100) : 0
        }
      });

    } catch (error) {
      console.error('❌ Lỗi lấy tóm tắt hệ thống:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy tóm tắt hệ thống',
        error: error.message
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/dashboard/students-by-period
  // Query params: dot_thuc_tap_id (required), dot_thuc_tap_admin (required)
  // Trả danh sách SV thuộc đợt lớn + đợt nhỏ đã chọn
  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: build scope-aware student WHERE clause
  // Dùng dot_thuc_tap_admin + khoa_hoc/lop batch scope (KHÔNG dùng dot_thuc_tap_id)
  // Đây là logic đúng giống trang Thực tập (InternshipBatchesController)
  static async _buildStudentScopeFilter(dotThucTapId, dotThucTapAdmin) {
    const [batchRow] = await connection.query(
      'SELECT khoa_hoc_ap_dung, lop_ap_dung FROM dot_thuc_tap WHERE id = ?',
      [dotThucTapId]
    );
    const khoa = String(batchRow?.khoa_hoc_ap_dung ?? '').trim();
    const lop  = String(batchRow?.lop_ap_dung   ?? '').trim();

    const whereSql = `
      COALESCE(TRIM(sv.dot_thuc_tap_admin), '') = ?
      AND (? = '' OR COALESCE(TRIM(sv.khoa_hoc), '') = ?)
      AND (? = '' OR COALESCE(TRIM(sv.lop), '') LIKE CONCAT('%', ?, '%'))
    `;
    const whereParams = [dotThucTapAdmin, khoa, khoa, lop, lop];
    return { whereSql, whereParams, khoa, lop };
  }

  static async getStudentsByPeriod(req, res) {
    try {
      const dotThucTapId    = parseInt(req.query.dot_thuc_tap_id)    || 0;
      const dotThucTapAdmin = String(req.query.dot_thuc_tap_admin || '').trim();

      if (!dotThucTapId || !['dot-1', 'dot-2'].includes(dotThucTapAdmin)) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu tham số dot_thuc_tap_id hoặc dot_thuc_tap_admin'
        });
      }

      const page   = Math.max(1, parseInt(req.query.page)  || 1);
      const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
      const offset = (page - 1) * limit;

      // Build scope filter (đồng nhất với InternshipsPage)
      const { whereSql, whereParams } = await DashboardController._buildStudentScopeFilter(dotThucTapId, dotThucTapAdmin);

      const baseSql = `
        FROM sinh_vien sv
        LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id
        LEFT JOIN doanh_nghiep dn ON dn.id = pct.doanh_nghiep_id
        LEFT JOIN giang_vien gv ON gv.id = pct.giang_vien_id
        WHERE ${whereSql}
      `;

      const [countRow] = await connection.query(
        `SELECT COUNT(*) AS total ${baseSql}`, [...whereParams]
      );
      const total = Number(countRow?.total ?? 0);

      const students = await connection.query(`
        SELECT
          sv.ma_sinh_vien,
          sv.ho_ten,
          sv.lop,
          sv.khoa,
          COALESCE(
            NULLIF(TRIM(gv.ho_ten), ''),
            NULLIF(TRIM(sv.giang_vien_huong_dan), '')
          ) AS giang_vien_huong_dan,
          COALESCE(
            NULLIF(TRIM(dn.ten_cong_ty), ''),
            NULLIF(TRIM(sv.don_vi_thuc_tap), ''),
            NULLIF(TRIM(sv.cong_ty_tu_lien_he), '')
          ) AS don_vi_thuc_tap,
          NULLIF(TRIM(sv.vi_tri_muon_ung_tuyen_thuc_tap), '') AS vi_tri_thuc_tap,
          sv.trang_thai_phan_cong,
          pct.ngay_bat_dau,
          pct.ngay_ket_thuc,
          pct.trang_thai AS trang_thai_phancong,
          sv.nguyen_vong_thuc_tap
        ${baseSql}
        ORDER BY sv.lop ASC, sv.ho_ten ASC
        LIMIT ? OFFSET ?
      `, [...whereParams, limit, offset]);

      res.json({
        success: true,
        data: {
          students,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }
      });
    } catch (error) {
      console.error('❌ getStudentsByPeriod:', error);
      res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/dashboard/export-students-by-period
  // Xuất file Excel danh sách SV theo đợt
  // ─────────────────────────────────────────────────────────────────────────────
  static async exportStudentsByPeriod(req, res) {
    try {
      const dotThucTapId    = parseInt(req.query.dot_thuc_tap_id)    || 0;
      const dotThucTapAdmin = String(req.query.dot_thuc_tap_admin || '').trim();
      const bigBatchName    = String(req.query.ten_dot_lon || 'DotThucTap').trim();
      const subBatchName    = String(req.query.ten_dot_nho || dotThucTapAdmin).trim();

      if (!dotThucTapId || !['dot-1', 'dot-2'].includes(dotThucTapAdmin)) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu tham số dot_thuc_tap_id hoặc dot_thuc_tap_admin'
        });
      }

      // Build scope filter (đồng nhất với InternshipsPage + getStudentsByPeriod)
      const { whereSql, whereParams } = await DashboardController._buildStudentScopeFilter(dotThucTapId, dotThucTapAdmin);

      const students = await connection.query(`
        SELECT
          sv.ma_sinh_vien,
          sv.ho_ten,
          sv.lop,
          sv.khoa,
          COALESCE(
            NULLIF(TRIM(gv.ho_ten), ''),
            NULLIF(TRIM(sv.giang_vien_huong_dan), '')
          ) AS giang_vien_huong_dan,
          COALESCE(
            NULLIF(TRIM(dn.ten_cong_ty), ''),
            NULLIF(TRIM(sv.don_vi_thuc_tap), ''),
            NULLIF(TRIM(sv.cong_ty_tu_lien_he), '')
          ) AS don_vi_thuc_tap,
          NULLIF(TRIM(sv.vi_tri_muon_ung_tuyen_thuc_tap), '') AS vi_tri_thuc_tap,
          sv.trang_thai_phan_cong,
          pct.ngay_bat_dau,
          pct.ngay_ket_thuc
        FROM sinh_vien sv
        LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id
        LEFT JOIN doanh_nghiep dn ON dn.id = pct.doanh_nghiep_id
        LEFT JOIN giang_vien gv ON gv.id = pct.giang_vien_id
        WHERE ${whereSql}
        ORDER BY sv.lop ASC, sv.ho_ten ASC
      `, [...whereParams]);

      // Build Excel with ExcelJS
      const ExcelJS = require('exceljs');
      const workbook  = new ExcelJS.Workbook();
      const sheetName = `${bigBatchName} - ${subBatchName}`.slice(0, 31); // Excel sheet name limit
      const sheet     = workbook.addWorksheet(sheetName);

      // Tiêu đề cột
      sheet.columns = [
        { header: 'STT',                  key: 'stt',           width: 6  },
        { header: 'Mã sinh viên',         key: 'ma_sv',         width: 16 },
        { header: 'Họ và tên',            key: 'ho_ten',        width: 28 },
        { header: 'Lớp',                  key: 'lop',           width: 14 },
        { header: 'Giảng viên hướng dẫn', key: 'gv',            width: 24 },
        { header: 'Doanh nghiệp thực tập',key: 'dn',            width: 32 },
        { header: 'Vị trí thực tập',      key: 'vi_tri',        width: 22 },
        { header: 'Trạng thái',           key: 'trang_thai',    width: 18 },
        { header: 'Ngày bắt đầu',         key: 'ngay_bat_dau',  width: 14 },
        { header: 'Ngày kết thúc',        key: 'ngay_ket_thuc', width: 14 },
      ];

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.height = 22;
      headerRow.commit();

      // Mapping trạng thái
      const statusMap = {
        'da-phan-cong':  'Đã phân công',
        'chua-phan-cong':'Chưa phân công',
        'dang-thuc-tap': 'Đang thực tập',
        'hoan-thanh':    'Hoàn thành',
      };

      const fmtDate = (d) => {
        if (!d) return '';
        const date = new Date(d);
        if (isNaN(date)) return String(d);
        return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
      };

      students.forEach((sv, idx) => {
        const row = sheet.addRow({
          stt:           idx + 1,
          ma_sv:         sv.ma_sinh_vien  || '',
          ho_ten:        sv.ho_ten         || '',
          lop:           sv.lop            || '',
          gv:            sv.giang_vien_huong_dan || '',
          dn:            sv.don_vi_thuc_tap      || '',
          vi_tri:        sv.vi_tri_thuc_tap       || '',
          trang_thai:    statusMap[sv.trang_thai_phan_cong] || sv.trang_thai_phan_cong || '',
          ngay_bat_dau:  fmtDate(sv.ngay_bat_dau),
          ngay_ket_thuc: fmtDate(sv.ngay_ket_thuc),
        });
        row.alignment = { vertical: 'middle' };
        // Zebra stripe
        if (idx % 2 === 1) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
        }
        row.commit();
      });

      // Thêm dòng tổng kết
      if (students.length === 0) {
        const emptyRow = sheet.addRow(['', '', '(Chưa có sinh viên nào trong đợt này)', '', '', '', '', '', '', '']);
        emptyRow.getCell(3).font = { italic: true, color: { argb: 'FF6B7280' } };
        emptyRow.commit();
      }

      // Freeze header
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      // Auto-filter
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };

      // File name
      const safeBig = bigBatchName.replace(/[^a-zA-Z0-9À-ỹ\s]/g, '').replace(/\s+/g, '_');
      const safeSub = subBatchName.replace(/[^a-zA-Z0-9À-ỹ\s]/g, '').replace(/\s+/g, '_');
      const filename = `Danh_sach_SV_${safeBig}_${safeSub}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Cache-Control', 'no-cache');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('❌ exportStudentsByPeriod:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Lỗi xuất Excel', error: error.message });
      }
    }
  }
}

module.exports = DashboardController;