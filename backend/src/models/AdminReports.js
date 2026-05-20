const db = require('../database/connection');

class AdminReports {
  static getInternshipStatusText(status) {
    switch (status) {
      case 'active': return 'Đang thực tập';
      case 'completed': return 'Hoàn thành';
      case 'pending': return 'Chờ duyệt';
      case 'overdue': return 'Quá hạn';
      default: return status || '';
    }
  }

  static _buildInternshipOverviewBaseQuery() {
    const companyExpr = `
      COALESCE(
        NULLIF(TRIM(dn.ten_cong_ty), ''),
        NULLIF(TRIM(dk.ten_cong_ty), ''),
        NULLIF(TRIM(sv.don_vi_thuc_tap), ''),
        NULLIF(TRIM(sv.cong_ty_tu_lien_he), ''),
        'Chưa phân công'
      )
    `;

    const supervisorExpr = `
      COALESCE(
        NULLIF(TRIM(gv.ho_ten), ''),
        NULLIF(TRIM(sv.giang_vien_huong_dan), ''),
        'Chưa phân công'
      )
    `;

    const evidenceClause = `
      (
        NULLIF(TRIM(COALESCE(sv.nguyen_vong_thuc_tap, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(sv.don_vi_thuc_tap, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(sv.cong_ty_tu_lien_he, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(sv.giang_vien_huong_dan, '')), '') IS NOT NULL
        OR sv.trang_thai_phan_cong = 'da-phan-cong'
        OR sv.dot_thuc_tap_id IS NOT NULL
        OR NULLIF(TRIM(COALESCE(sv.dot_thuc_tap_admin, '')), '') IS NOT NULL
        OR dk.id IS NOT NULL
        OR pct.id IS NOT NULL
        OR COALESCE(rep.report_count, 0) > 0
      )
    `;

    const statusCase = `
      CASE
        WHEN COALESCE(overdue.overdue_count, 0) > 0 THEN 'overdue'
        WHEN rep.latest_report_status = 'da_nop'
          OR dk.trang_thai = 'cho-duyet'
          OR dk.workflow_status_v2 = 'PENDING'
          OR dk.workflow_status IN ('CHO_DUYET', 'DA_DANG_KY')
        THEN 'pending'
        WHEN pct.trang_thai = 'hoan-thanh'
          OR pct.workflow_status = 'HOAN_THANH'
          OR dk.workflow_status = 'HOAN_THANH'
          OR rep.latest_report_status = 'da_duyet'
        THEN 'completed'
        ELSE 'active'
      END
    `;

    return `
      SELECT
        sv.id,
        sv.ma_sinh_vien AS studentId,
        sv.ho_ten AS name,
        ${companyExpr} AS company,
        ${supervisorExpr} AS supervisor,
        ${statusCase} AS status,
        sv.nguyen_vong_thuc_tap AS internshipPreference,
        sv.vi_tri_muon_ung_tuyen_thuc_tap AS desiredPosition,
        sv.lop AS studentClass,
        COALESCE(rep.report_count, 0) AS reportCount,
        rep.last_report_date AS lastReportDate,
        COALESCE(overdue.overdue_count, 0) AS overdueCount,
        COALESCE(pct.trang_thai, dk.trang_thai, dk.workflow_status_v2, dk.workflow_status, sv.trang_thai_phan_cong) AS rawStatus,
        rep.latest_report_status AS latestReportStatus
      FROM sinh_vien sv
      LEFT JOIN (
        SELECT sinh_vien_id, MAX(id) AS latest_id
        FROM dang_ky_thuc_tap_sinh_vien
        GROUP BY sinh_vien_id
      ) latest_dk ON latest_dk.sinh_vien_id = sv.id
      LEFT JOIN dang_ky_thuc_tap_sinh_vien dk ON dk.id = latest_dk.latest_id
      LEFT JOIN (
        SELECT sinh_vien_id, MAX(id) AS latest_id
        FROM phan_cong_thuc_tap
        GROUP BY sinh_vien_id
      ) latest_pct ON latest_pct.sinh_vien_id = sv.id
      LEFT JOIN phan_cong_thuc_tap pct ON pct.id = latest_pct.latest_id
      LEFT JOIN doanh_nghiep dn ON dn.id = pct.doanh_nghiep_id
      LEFT JOIN giang_vien gv ON gv.id = pct.giang_vien_id
      LEFT JOIN (
        SELECT
          ma_sinh_vien,
          COUNT(*) AS report_count,
          MAX(submitted_at) AS last_report_date,
          SUBSTRING_INDEX(
            GROUP_CONCAT(trang_thai ORDER BY submitted_at DESC, id DESC),
            ',',
            1
          ) AS latest_report_status
        FROM bai_nop_cua_sinh_vien
        GROUP BY ma_sinh_vien
      ) rep ON rep.ma_sinh_vien COLLATE utf8mb4_unicode_ci = sv.ma_sinh_vien COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT sv2.ma_sinh_vien, COUNT(*) AS overdue_count
        FROM sinh_vien sv2
        JOIN giang_vien gv2
          ON LOWER(TRIM(gv2.ho_ten)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(sv2.giang_vien_huong_dan)) COLLATE utf8mb4_unicode_ci
        JOIN dot_nop_bao_cao_theo_tuan slot
          ON slot.ma_giang_vien COLLATE utf8mb4_unicode_ci = gv2.ma_giang_vien COLLATE utf8mb4_unicode_ci
          AND slot.end_at < NOW()
        LEFT JOIN bai_nop_cua_sinh_vien b2
          ON b2.slot_id = slot.id
          AND b2.ma_sinh_vien COLLATE utf8mb4_unicode_ci = sv2.ma_sinh_vien COLLATE utf8mb4_unicode_ci
        WHERE b2.id IS NULL
        GROUP BY sv2.ma_sinh_vien
      ) overdue ON overdue.ma_sinh_vien = sv.ma_sinh_vien
      WHERE ${evidenceClause}
    `;
  }

  static _buildInternshipOverviewFilters(filters = {}) {
    const whereConditions = [];
    const params = [];

    if (filters.search) {
      const keyword = `%${filters.search}%`;
      whereConditions.push('(report_rows.name LIKE ? OR report_rows.studentId LIKE ? OR report_rows.company LIKE ? OR report_rows.supervisor LIKE ?)');
      params.push(keyword, keyword, keyword, keyword);
    }

    if (filters.status && filters.status !== 'all') {
      whereConditions.push('report_rows.status = ?');
      params.push(filters.status);
    }

    return {
      whereClause: whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '',
      params,
    };
  }

  // Legacy dashboard stats retained for older maintenance paths.
  static async _getLegacyReportsStats() {
    try {
      const safe = async (sql) => {
        try {
          const rows = await db.query(sql);
          const r = Array.isArray(rows) && rows[0] ? rows[0] : {};
          return Number(Object.values(r)[0]) || 0;
        } catch { return 0; }
      };

      const [totalTeachers, totalCompanies, totalStudents] = await Promise.all([
        safe('SELECT COUNT(*) FROM giang_vien'),
        safe('SELECT COUNT(*) FROM doanh_nghiep'),
        safe('SELECT COUNT(*) FROM sinh_vien'),
      ]);

      // GV đã chấm điểm (có diem_giang_vien)
      const submittedTeacherReports = await safe(
        'SELECT COUNT(DISTINCT slot_id) FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL'
      );

      // DN đã có báo cáo thực tập
      const submittedCompanyReports = await safe(
        "SELECT COUNT(DISTINCT doanh_nghiep_id) FROM phan_cong_thuc_tap WHERE trang_thai = 'hoan_thanh' OR diem_so IS NOT NULL"
      );

      // SV hoàn thành (có diem_giang_vien trong phan_cong_thuc_tap)
      const completedInternships = await safe(
        'SELECT COUNT(*) FROM phan_cong_thuc_tap WHERE diem_giang_vien IS NOT NULL'
      );

      return {
        totalTeachers,
        submittedTeacherReports,
        totalCompanies,
        submittedCompanyReports,
        totalStudents,
        completedInternships,
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy thống kê báo cáo: ${error.message}`);
    }
  }

  // Get report by ID (alias for getReportDetails using bai_nop_cua_sinh_vien)
  static async getReportById(reportId) {
    try {
      const rows = await db.query(
        `SELECT b.*, s.ho_ten as ten_sinh_vien, s.ma_sinh_vien, s.email
         FROM bai_nop_cua_sinh_vien b
         LEFT JOIN sinh_vien s ON b.ma_sinh_vien = s.ma_sinh_vien
         WHERE b.id = ?`,
        [reportId]
      );
      if (!rows || rows.length === 0) throw new Error('Report not found');
      return rows[0];
    } catch (error) {
      throw new Error(`Lỗi khi lấy thông tin báo cáo: ${error.message}`);
    }
  }

  // Legacy submitted-report query retained for older maintenance paths.
  static async _getLegacySubmittedReports(page = 1, limit = 20, filters = {}) {
    try {
      const offset = (page - 1) * limit;
      let whereConditions = [];
      let params = [];

      // Build WHERE conditions
      if (filters.submitterType) {
        whereConditions.push('bncsv.loai_bai_nop = ?');
        params.push(filters.submitterType);
      }

      if (filters.status) {
        whereConditions.push('bncsv.trang_thai = ?');
        params.push(filters.status);
      }

      if (filters.search) {
        whereConditions.push('(sv.ho_ten LIKE ? OR sv.ma_sinh_vien LIKE ?)');
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';

      // Count total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM bai_nop_cua_sinh_vien bncsv
        LEFT JOIN sinh_vien sv ON bncsv.sinh_vien_id = sv.id
        ${whereClause}
      `;
      
      const [countResult] = await db.query(countQuery, params);
      const total = countResult[0].total;

      // Get paginated data
      const dataQuery = `
        SELECT 
          bncsv.*,
          sv.ho_ten as ten_sinh_vien,
          sv.ma_sinh_vien,
          sv.email as email_sinh_vien,
          dt.ten_dot,
          dt.nam_hoc
        FROM bai_nop_cua_sinh_vien bncsv
        LEFT JOIN sinh_vien sv ON bncsv.sinh_vien_id = sv.id
        LEFT JOIN dot_thuc_tap dt ON bncsv.dot_thuc_tap_id = dt.id
        ${whereClause}
        ORDER BY bncsv.ngay_nop DESC
        LIMIT ? OFFSET ?
      `;

      params.push(limit, offset);
      const [reports] = await db.query(dataQuery, params);

      return {
        reports,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy danh sách báo cáo đã nộp: ${error.message}`);
    }
  }

  static async getReportsStats(dotThucTapId = null, dotThucTapAdmin = null) {
    if (dotThucTapId) {
      return this.getReportsStatsByBatch(dotThucTapId, dotThucTapAdmin);
    }

    try {
      const baseQuery = this._buildInternshipOverviewBaseQuery();
      const rows = await db.query(`
        SELECT
          COUNT(*) AS totalStudents,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeInternships,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedInternships,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingApprovals,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdueReports,
          COUNT(DISTINCT CASE WHEN company <> 'Chưa phân công' THEN company END) AS internshipCompanies,
          COUNT(DISTINCT CASE WHEN supervisor <> 'Chưa phân công' THEN supervisor END) AS totalSupervisors
        FROM (${baseQuery}) report_rows
      `);
      const overview = rows[0] || {};

      const safe = async (sql) => {
        try {
          const safeRows = await db.query(sql);
          const r = Array.isArray(safeRows) && safeRows[0] ? safeRows[0] : {};
          return Number(Object.values(r)[0]) || 0;
        } catch {
          return 0;
        }
      };

      const [totalTeachers, totalCompanies, submittedTeacherReports, submittedCompanyReports] = await Promise.all([
        safe('SELECT COUNT(*) FROM giang_vien'),
        safe('SELECT COUNT(*) FROM doanh_nghiep'),
        safe('SELECT COUNT(DISTINCT slot_id) FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL'),
        safe("SELECT COUNT(DISTINCT doanh_nghiep_id) FROM phan_cong_thuc_tap WHERE trang_thai IN ('hoan_thanh', 'hoan-thanh') OR diem_so IS NOT NULL"),
      ]);

      return {
        totalTeachers,
        submittedTeacherReports,
        totalCompanies,
        submittedCompanyReports,
        totalStudents: Number(overview.totalStudents) || 0,
        activeInternships: Number(overview.activeInternships) || 0,
        completedInternships: Number(overview.completedInternships) || 0,
        pendingApprovals: Number(overview.pendingApprovals) || 0,
        overdueReports: Number(overview.overdueReports) || 0,
        internshipCompanies: Number(overview.internshipCompanies) || 0,
        totalSupervisors: Number(overview.totalSupervisors) || 0,
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy thống kê báo cáo: ${error.message}`);
    }
  }

  // Thống kê báo cáo lọc theo đợt lớn + tùy chọn đợt nhỏ
  static async getReportsStatsByBatch(dotThucTapId, dotThucTapAdmin = null) {
    const safe = async (sql, params = []) => {
      try {
        const rows = await db.query(sql, params);
        const r = Array.isArray(rows) && rows[0] ? rows[0] : {};
        return Number(Object.values(r)[0]) || 0;
      } catch (err) {
        console.warn('[ReportStats] query failed (returning 0):', err.code || err.message, '| SQL:', sql.slice(0, 120));
        return 0;
      }
    };

    // ── Lấy batch scope để lọc đúng SV (giống InternshipsPage) ──────────────
    // KHÔNG dùng dot_thuc_tap_id vì SV không có field này set
    const batchRows = await db.query(
      'SELECT khoa_hoc_ap_dung, lop_ap_dung FROM dot_thuc_tap WHERE id = ?',
      [dotThucTapId]
    );
    const batchRow = Array.isArray(batchRows) ? batchRows[0] : batchRows;
    const khoa = String(batchRow?.khoa_hoc_ap_dung ?? '').trim();
    const lop  = String(batchRow?.lop_ap_dung   ?? '').trim();

    // svWhere: lọc theo dot_thuc_tap_admin + batch scope
    const svWhere = dotThucTapAdmin
      ? `COALESCE(TRIM(sv.dot_thuc_tap_admin), '') = ?
         AND (? = '' OR COALESCE(TRIM(sv.khoa_hoc), '') = ?)
         AND (? = '' OR COALESCE(TRIM(sv.lop), '') LIKE CONCAT('%', ?, '%'))`
      : `COALESCE(TRIM(sv.dot_thuc_tap_admin), '') IN ('dot-1', 'dot-2')
         AND (? = '' OR COALESCE(TRIM(sv.khoa_hoc), '') = ?)
         AND (? = '' OR COALESCE(TRIM(sv.lop), '') LIKE CONCAT('%', ?, '%'))`;
    const svParams = dotThucTapAdmin
      ? [dotThucTapAdmin, khoa, khoa, lop, lop]
      : [khoa, khoa, lop, lop];

    // JOIN COLLATE để tránh lỗi collation mismatch
    const joinDiem = `INNER JOIN sinh_vien sv ON sv.ma_sinh_vien COLLATE utf8mb4_unicode_ci = d.ma_sinh_vien COLLATE utf8mb4_unicode_ci`;

    try {
      const [
        totalStudents,
        completedInternships,
        totalTeachers,
        submittedTeacherReports,
        totalCompanies,
        submittedCompanyReports,
      ] = await Promise.all([
        // Tổng SV trong đợt nhỏ (theo dot_thuc_tap_admin + batch scope)
        safe(`SELECT COUNT(*) FROM sinh_vien sv WHERE ${svWhere}`, [...svParams]),

        // SV đã hoàn thành (có điểm)
        safe(`
          SELECT COUNT(DISTINCT sv.id) FROM sinh_vien sv
          LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id
          LEFT JOIN diem_theo_dot_nop d ON d.ma_sinh_vien COLLATE utf8mb4_unicode_ci = sv.ma_sinh_vien COLLATE utf8mb4_unicode_ci
          WHERE ${svWhere}
            AND (pct.diem_giang_vien IS NOT NULL OR d.diem_giang_vien IS NOT NULL)
        `, [...svParams]),

        // GV hướng dẫn SV trong đợt (qua giang_vien_huong_dan)
        safe(`
          SELECT COUNT(DISTINCT gv.id) FROM giang_vien gv
          WHERE EXISTS (
            SELECT 1 FROM sinh_vien sv
            WHERE ${svWhere}
              AND NULLIF(TRIM(sv.giang_vien_huong_dan), '') IS NOT NULL
              AND LOWER(TRIM(sv.giang_vien_huong_dan)) COLLATE utf8mb4_unicode_ci
                = LOWER(TRIM(gv.ho_ten)) COLLATE utf8mb4_unicode_ci
          ) OR EXISTS (
            SELECT 1 FROM phan_cong_thuc_tap pct
            INNER JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id
            WHERE ${svWhere} AND pct.giang_vien_id = gv.id
          )
        `, [...svParams, ...svParams]),

        // GV đã chấm điểm cho SV trong đợt
        safe(`SELECT COUNT(DISTINCT d.slot_id) FROM diem_theo_dot_nop d ${joinDiem} WHERE d.diem_giang_vien IS NOT NULL AND ${svWhere}`, [...svParams]),

        // DN có SV thực tập trong đợt (qua don_vi_thuc_tap)
        safe(`
          SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(sv.don_vi_thuc_tap),''), NULLIF(TRIM(sv.cong_ty_tu_lien_he),''), ''))
          FROM sinh_vien sv
          WHERE ${svWhere}
            AND COALESCE(NULLIF(TRIM(sv.don_vi_thuc_tap),''), NULLIF(TRIM(sv.cong_ty_tu_lien_he),'')) IS NOT NULL
        `, [...svParams]),

        // DN đã có báo cáo hoàn thành
        safe(`SELECT COUNT(DISTINCT pct.doanh_nghiep_id) FROM phan_cong_thuc_tap pct INNER JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id WHERE ${svWhere} AND (pct.trang_thai IN ('hoan_thanh','hoan-thanh') OR pct.diem_so IS NOT NULL)`, [...svParams]),
      ]);

      return {
        totalTeachers,
        submittedTeacherReports,
        totalCompanies,
        submittedCompanyReports,
        totalStudents,
        completedInternships,
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy thống kê báo cáo theo đợt: ${error.message}`);
    }
  }

  static async getSubmittedReports(page = 1, limit = 20, filters = {}) {
    try {
      const currentPage = Math.max(Number(page) || 1, 1);
      const maxLimit = filters.allowLargeLimit ? 10000 : 100;
      const pageSize = Math.min(Math.max(Number(limit) || 20, 1), maxLimit);
      const offset = (currentPage - 1) * pageSize;
      const baseQuery = this._buildInternshipOverviewBaseQuery();
      const { whereClause, params } = this._buildInternshipOverviewFilters(filters);

      const countRows = await db.query(
        `SELECT COUNT(*) AS total FROM (${baseQuery}) report_rows ${whereClause}`,
        params
      );
      const total = Number(countRows[0]?.total) || 0;

      const reports = await db.query(
        `
          SELECT *
          FROM (${baseQuery}) report_rows
          ${whereClause}
          ORDER BY
            CASE WHEN lastReportDate IS NULL THEN 1 ELSE 0 END,
            lastReportDate DESC,
            name ASC
          LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      );

      return {
        reports,
        pagination: {
          currentPage,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          totalItems: total,
          page: currentPage,
          limit: pageSize,
          pages: Math.ceil(total / pageSize),
          total,
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy danh sách báo cáo thực tập: ${error.message}`);
    }
  }

  // Get report details by ID
  static async getReportDetails(reportId) {
    try {
      const query = `
        SELECT 
          bc.*,
          sv.ho_ten as ten_sinh_vien,
          sv.ma_sinh_vien,
          sv.email as email_sinh_vien,
          gv.ho_ten as ten_giang_vien,
          gv.email as email_giang_vien,
          dn.ten_doanh_nghiep,
          dt.ten_dot,
          dt.nam_hoc
        FROM bao_cao bc
        LEFT JOIN phan_cong_thuc_tap pct ON bc.phan_cong_thuc_tap_id = pct.id
        LEFT JOIN sinh_vien sv ON pct.sinh_vien_id = sv.id
        LEFT JOIN giang_vien gv ON pct.giang_vien_id = gv.id
        LEFT JOIN doanh_nghiep dn ON pct.doanh_nghiep_id = dn.id
        LEFT JOIN dot_thuc_tap dt ON pct.dot_thuc_tap_id = dt.id
        WHERE bc.id = ?
      `;

      const [reports] = await db.query(query, [reportId]);

      if (reports.length === 0) {
        throw new Error('Không tìm thấy báo cáo');
      }

      return reports[0];
    } catch (error) {
      throw new Error(`Lỗi khi lấy chi tiết báo cáo: ${error.message}`);
    }
  }

  // Get reports by student
  static async getReportsByStudent(studentId, filters = {}) {
    try {
      const { page = 1, limit = 20, loai_bao_cao, dot_thuc_tap_id } = filters;
      const offset = (page - 1) * limit;

      let whereConditions = ['pct.sinh_vien_id = ?'];
      let params = [studentId];

      if (loai_bao_cao) {
        whereConditions.push('bc.loai_bao_cao = ?');
        params.push(loai_bao_cao);
      }

      if (dot_thuc_tap_id) {
        whereConditions.push('pct.dot_thuc_tap_id = ?');
        params.push(dot_thuc_tap_id);
      }

      const whereClause = 'WHERE ' + whereConditions.join(' AND ');

      // Count total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM bao_cao bc
        LEFT JOIN phan_cong_thuc_tap pct ON bc.phan_cong_thuc_tap_id = pct.id
        ${whereClause}
      `;

      const [countResult] = await db.query(countQuery, params);
      const total = countResult[0].total;

      // Get data
      const dataQuery = `
        SELECT 
          bc.*,
          dt.ten_dot,
          dt.nam_hoc,
          gv.ho_ten as ten_giang_vien,
          dn.ten_doanh_nghiep
        FROM bao_cao bc
        LEFT JOIN phan_cong_thuc_tap pct ON bc.phan_cong_thuc_tap_id = pct.id
        LEFT JOIN dot_thuc_tap dt ON pct.dot_thuc_tap_id = dt.id
        LEFT JOIN giang_vien gv ON pct.giang_vien_id = gv.id
        LEFT JOIN doanh_nghiep dn ON pct.doanh_nghiep_id = dn.id
        ${whereClause}
        ORDER BY bc.created_at DESC
        LIMIT ? OFFSET ?
      `;

      params.push(limit, offset);
      const [reports] = await db.query(dataQuery, params);

      return {
        reports,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy báo cáo của sinh viên: ${error.message}`);
    }
  }

  // Get reports by internship batch
  static async getReportsByBatch(batchId, filters = {}) {
    try {
      const { page = 1, limit = 20, loai_bao_cao, trang_thai } = filters;
      const offset = (page - 1) * limit;

      let whereConditions = ['pct.dot_thuc_tap_id = ?'];
      let params = [batchId];

      if (loai_bao_cao) {
        whereConditions.push('bc.loai_bao_cao = ?');
        params.push(loai_bao_cao);
      }

      if (trang_thai) {
        whereConditions.push('bc.trang_thai = ?');
        params.push(trang_thai);
      }

      const whereClause = 'WHERE ' + whereConditions.join(' AND ');

      // Count total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM bao_cao bc
        LEFT JOIN phan_cong_thuc_tap pct ON bc.phan_cong_thuc_tap_id = pct.id
        ${whereClause}
      `;

      const [countResult] = await db.query(countQuery, params);
      const total = countResult[0].total;

      // Get data
      const dataQuery = `
        SELECT 
          bc.*,
          sv.ho_ten as ten_sinh_vien,
          sv.ma_sinh_vien,
          gv.ho_ten as ten_giang_vien,
          dn.ten_doanh_nghiep
        FROM bao_cao bc
        LEFT JOIN phan_cong_thuc_tap pct ON bc.phan_cong_thuc_tap_id = pct.id
        LEFT JOIN sinh_vien sv ON pct.sinh_vien_id = sv.id
        LEFT JOIN giang_vien gv ON pct.giang_vien_id = gv.id
        LEFT JOIN doanh_nghiep dn ON pct.doanh_nghiep_id = dn.id
        ${whereClause}
        ORDER BY bc.created_at DESC
        LIMIT ? OFFSET ?
      `;

      params.push(limit, offset);
      const [reports] = await db.query(dataQuery, params);

      return {
        reports,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy báo cáo theo đợt: ${error.message}`);
    }
  }

  // Update report score and feedback
  static async updateReportGrade(reportId, gradeData) {
    try {
      const { diem, nhan_xet } = gradeData;

      const query = `
        UPDATE bao_cao 
        SET diem = ?, nhan_xet = ?, updated_at = NOW()
        WHERE id = ?
      `;

      const [result] = await db.query(query, [diem, nhan_xet, reportId]);

      if (result.affectedRows === 0) {
        throw new Error('Không tìm thấy báo cáo để cập nhật');
      }

      return await this.getReportDetails(reportId);
    } catch (error) {
      throw new Error(`Lỗi khi chấm điểm báo cáo: ${error.message}`);
    }
  }

  // Delete a report
  static async deleteReport(reportId) {
    try {
      const query = 'DELETE FROM bao_cao WHERE id = ?';
      const [result] = await db.query(query, [reportId]);

      if (result.affectedRows === 0) {
        throw new Error('Không tìm thấy báo cáo để xóa');
      }

      return { success: true, message: 'Xóa báo cáo thành công' };
    } catch (error) {
      throw new Error(`Lỗi khi xóa báo cáo: ${error.message}`);
    }
  }

  // Get submission statistics by batch
  static async getSubmissionStatsByBatch(batchId) {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT pct.sinh_vien_id) as total_students,
          COUNT(bc.id) as total_reports,
          SUM(CASE WHEN bc.trang_thai = 'da-nop' THEN 1 ELSE 0 END) as submitted_count,
          SUM(CASE WHEN bc.trang_thai = 'chua-nop' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN bc.loai_bao_cao = 'tuan' THEN 1 ELSE 0 END) as weekly_count,
          SUM(CASE WHEN bc.loai_bao_cao = 'cuoi-ky' THEN 1 ELSE 0 END) as final_count,
          AVG(bc.diem) as average_score
        FROM phan_cong_thuc_tap pct
        LEFT JOIN bao_cao bc ON bc.phan_cong_thuc_tap_id = pct.id
        WHERE pct.dot_thuc_tap_id = ?
      `;

      const [stats] = await db.query(query, [batchId]);

      return stats[0];
    } catch (error) {
      throw new Error(`Lỗi khi lấy thống kê nộp báo cáo: ${error.message}`);
    }
  }

  // ====== PERIODIC UPDATES (daily / weekly / overall) ======
  // Helper to safely execute a count query, returning 0 on error
  // NOTE: db.query() in this project already returns the rows array directly
  // (it internally destructures the [rows, fields] tuple from mysql2).
  static async _safeCount(sql, params = []) {
    try {
      const rows = await db.query(sql, params);
      const r = Array.isArray(rows) && rows[0] ? rows[0] : {};
      const val = r.cnt ?? r.total ?? r.count ?? 0;
      return Number(val) || 0;
    } catch (err) {
      console.warn('[AdminReports._safeCount] query failed:', err.message);
      return 0;
    }
  }

  static async _safeNumber(sql, params = []) {
    try {
      const rows = await db.query(sql, params);
      const r = Array.isArray(rows) && rows[0] ? rows[0] : {};
      const val = r.val ?? r.avg ?? 0;
      return val === null ? 0 : Number(val) || 0;
    } catch (err) {
      console.warn('[AdminReports._safeNumber] query failed:', err.message);
      return 0;
    }
  }

  static async getPeriodicUpdates() {
    // ----- Daily (today) -----
    const dailyStudentSubmissions = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM bai_nop_cua_sinh_vien WHERE DATE(submitted_at) = CURDATE()`
    );
    const dailyTeacherEvaluations = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM diem_theo_dot_nop 
       WHERE DATE(updated_at) = CURDATE() AND diem_giang_vien IS NOT NULL`
    );
    const dailyAvgScore = await this._safeNumber(
      `SELECT AVG(diem_giang_vien) AS val FROM diem_theo_dot_nop 
       WHERE DATE(updated_at) = CURDATE() AND diem_giang_vien IS NOT NULL`
    );
    const dailySystemActivity = dailyStudentSubmissions + dailyTeacherEvaluations;

    // ----- Weekly (last 7 days) -----
    const weeklyStudentReports = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM bai_nop_cua_sinh_vien 
       WHERE submitted_at >= (CURDATE() - INTERVAL 7 DAY)`
    );
    const weeklyTeacherEvaluations = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM diem_theo_dot_nop 
       WHERE updated_at >= (CURDATE() - INTERVAL 7 DAY) AND diem_giang_vien IS NOT NULL`
    );
    const weeklyAvgScore = await this._safeNumber(
      `SELECT AVG(diem_giang_vien) AS val FROM diem_theo_dot_nop 
       WHERE updated_at >= (CURDATE() - INTERVAL 7 DAY) AND diem_giang_vien IS NOT NULL`
    );
    const prevWeekStudentReports = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM bai_nop_cua_sinh_vien 
       WHERE submitted_at >= (CURDATE() - INTERVAL 14 DAY)
         AND submitted_at <  (CURDATE() - INTERVAL 7 DAY)`
    );
    const growthPercent = prevWeekStudentReports > 0
      ? Math.round(((weeklyStudentReports - prevWeekStudentReports) / prevWeekStudentReports) * 100)
      : (weeklyStudentReports > 0 ? 100 : 0);

    // ----- Overall -----
    const totalReports = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM bai_nop_cua_sinh_vien`
    );
    const gradedReports = await this._safeCount(
      `SELECT COUNT(*) AS cnt FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL`
    );
    const overallAvgScore = await this._safeNumber(
      `SELECT AVG(diem_giang_vien) AS val FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL`
    );
    const totalStudents = await this._safeCount(`SELECT COUNT(*) AS cnt FROM sinh_vien`);
    const activeStudents = await this._safeCount(
      `SELECT COUNT(DISTINCT ma_sinh_vien) AS cnt FROM bai_nop_cua_sinh_vien`
    );
    const participationRate = totalStudents > 0
      ? Math.round((activeStudents / totalStudents) * 100)
      : 0;

    return {
      daily: {
        studentSubmissions: dailyStudentSubmissions,
        teacherEvaluations: dailyTeacherEvaluations,
        avgScore: Number(dailyAvgScore.toFixed(2)),
        systemActivity: dailySystemActivity,
      },
      weekly: {
        studentReports: weeklyStudentReports,
        teacherEvaluations: weeklyTeacherEvaluations,
        avgScore: Number(weeklyAvgScore.toFixed(2)),
        growthPercent,
      },
      overall: {
        totalReports,
        gradedReports,
        gradedPercent: totalReports > 0 ? Math.round((gradedReports / totalReports) * 100) : 0,
        avgScore: Number(overallAvgScore.toFixed(2)),
        participationRate,
        totalStudents,
        activeStudents,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // Detail lists for drill-down. type: 'student-submissions' | 'teacher-evaluations' | 'scores' | 'overall'
  // period: 'daily' | 'weekly' | 'overall'
  static async getPeriodicUpdateDetails(type, period = 'daily', limit = 50) {
    const lim = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    let dateClause = '';
    if (period === 'daily') dateClause = `AND DATE(s.submitted_at) = CURDATE()`;
    else if (period === 'weekly') dateClause = `AND s.submitted_at >= (CURDATE() - INTERVAL 7 DAY)`;

    let evalDateClause = '';
    if (period === 'daily') evalDateClause = `AND DATE(d.updated_at) = CURDATE()`;
    else if (period === 'weekly') evalDateClause = `AND d.updated_at >= (CURDATE() - INTERVAL 7 DAY)`;

    try {
      if (type === 'student-submissions') {
        const rows = await db.query(
          `SELECT s.id, s.ma_sinh_vien, s.original_name AS file_name, s.submitted_at, s.trang_thai,
                  sv.ho_ten AS ten_sinh_vien,
                  slot.ten_dot AS ten_slot
           FROM bai_nop_cua_sinh_vien s
           LEFT JOIN sinh_vien sv ON sv.ma_sinh_vien = s.ma_sinh_vien
           LEFT JOIN dot_nop_bao_cao_theo_tuan slot ON slot.id = s.slot_id
           WHERE 1=1 ${dateClause}
           ORDER BY s.submitted_at DESC
           LIMIT ?`,
          [lim]
        );
        return rows;
      }

      if (type === 'teacher-evaluations' || type === 'scores') {
        const rows = await db.query(
          `SELECT d.id, d.ma_sinh_vien, d.diem_giang_vien, d.nhan_xet_giang_vien, d.updated_at,
                  sv.ho_ten AS ten_sinh_vien,
                  slot.ten_dot AS ten_slot,
                  slot.ma_giang_vien,
                  gv.ho_ten AS ten_giang_vien
           FROM diem_theo_dot_nop d
           LEFT JOIN sinh_vien sv ON sv.ma_sinh_vien = d.ma_sinh_vien
           LEFT JOIN dot_nop_bao_cao_theo_tuan slot ON slot.id = d.slot_id
           LEFT JOIN giang_vien gv ON gv.ma_giang_vien = slot.ma_giang_vien
           WHERE d.diem_giang_vien IS NOT NULL ${evalDateClause}
           ORDER BY d.updated_at DESC
           LIMIT ?`,
          [lim]
        );
        return rows;
      }

      // overall: a quick combined recent feed
      const recentSubs = await db.query(
        `SELECT 'submission' AS kind, s.id, s.ma_sinh_vien,
                sv.ho_ten AS ten_sinh_vien, s.submitted_at AS ngay,
                s.original_name AS title
         FROM bai_nop_cua_sinh_vien s
         LEFT JOIN sinh_vien sv ON sv.ma_sinh_vien = s.ma_sinh_vien
         ORDER BY s.submitted_at DESC
         LIMIT 25`
      );
      const recentEvals = await db.query(
        `SELECT 'evaluation' AS kind, d.id, d.ma_sinh_vien,
                sv.ho_ten AS ten_sinh_vien, d.updated_at AS ngay,
                CONCAT('Điểm: ', d.diem_giang_vien) AS title
         FROM diem_theo_dot_nop d
         LEFT JOIN sinh_vien sv ON sv.ma_sinh_vien = d.ma_sinh_vien
         WHERE d.diem_giang_vien IS NOT NULL
         ORDER BY d.updated_at DESC
         LIMIT 25`
      );
      return [...(recentSubs || []), ...(recentEvals || [])]
        .sort((a, b) => new Date(b.ngay) - new Date(a.ngay))
        .slice(0, lim);
    } catch (err) {
      console.warn('[AdminReports.getPeriodicUpdateDetails] failed:', err.message);
      return [];
    }
  }
}

module.exports = AdminReports;
