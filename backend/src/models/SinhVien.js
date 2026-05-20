const { query } = require('../database/connection');

class SinhVien {
    static async getTableColumns(tableName) {
        if (tableName !== 'sinh_vien') return new Set();
        if (!this._columnCache) this._columnCache = {};
        if (this._columnCache[tableName]) return this._columnCache[tableName];

        const rows = await query(`SHOW COLUMNS FROM ${tableName}`);
        const columns = new Set((rows || []).map((row) => row.Field || row.field).filter(Boolean));
        this._columnCache[tableName] = columns;
        return columns;
    }

    constructor(data = {}) {
        this.id = data.id;
        this.account_id = data.account_id;
        this.ma_sinh_vien = data.ma_sinh_vien;
        this.ho_ten = data.ho_ten;
        this.lop = data.lop;
        this.khoa = data.khoa;
        this.nganh = data.nganh;
        this.khoa_hoc = data.khoa_hoc;
        this.ngay_sinh = data.ngay_sinh;
        this.gioi_tinh = data.gioi_tinh;
        this.dia_chi = data.dia_chi;
        this.so_dien_thoai = data.so_dien_thoai;
        this.email_ca_nhan = data.email_ca_nhan;
        this.gpa = data.gpa;
        this.so_tc_tich_luy = data.so_tc_tich_luy;
        this.so_tc_ht = data.so_tc_ht;
        this.nam_thu = data.nam_thu;
        this.hp_no = data.hp_no;
        this.tinh_trang_hoc_tap = data.tinh_trang_hoc_tap;
        this.nguyen_vong_thuc_tap = data.nguyen_vong_thuc_tap;
        this.vi_tri_muon_ung_tuyen_thuc_tap = data.vi_tri_muon_ung_tuyen_thuc_tap;
        this.don_vi_thuc_tap = data.don_vi_thuc_tap;
        this.cong_ty_tu_lien_he = data.cong_ty_tu_lien_he;
        this.dia_chi_cong_ty = data.dia_chi_cong_ty;
        this.nguoi_lien_he_cong_ty = data.nguoi_lien_he_cong_ty;
        this.sdt_nguoi_lien_he = data.sdt_nguoi_lien_he;
        this.cv_path = data.cv_path;
        this.trang_thai_phan_cong = data.trang_thai_phan_cong;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    // Tạo profile sinh viên mới (tránh trùng lặp theo ma_sinh_vien)
    static async create(data) {
        const mapping = {
            accountId: 'account_id',
            maSinhVien: 'ma_sinh_vien',
            hoTen: 'ho_ten',
            emailCaNhan: 'email_ca_nhan',
            soDienThoai: 'so_dien_thoai',
            lop: 'lop',
            khoa: 'khoa',
            nganh: 'nganh',
            khoaHoc: 'khoa_hoc',
            ngaySinh: 'ngay_sinh',
            gioiTinh: 'gioi_tinh',
            diaChi: 'dia_chi',
            gpa: 'gpa',
            soTCTichLuy: 'so_tc_tich_luy',
            soTCHT: 'so_tc_ht',
            namThu: 'nam_thu',
            hpNo: 'hp_no',
            tinhTrangHocTap: 'tinh_trang_hoc_tap',
            viTriMuonUngTuyenThucTap: 'vi_tri_muon_ung_tuyen_thuc_tap',
            viTriMuonUngTuyen: 'vi_tri_muon_ung_tuyen_thuc_tap',
            donViThucTap: 'don_vi_thuc_tap',
            nguyenVongThucTap: 'nguyen_vong_thuc_tap',
            giangVienHuongDan: 'giang_vien_huong_dan',
            dotThucTapAdmin: 'dot_thuc_tap_admin',
        };

        // Build columns and values
        const cols = [];
        const placeholders = [];
        const values = [];
        for (const [src, dest] of Object.entries(mapping)) {
            // Skip undefined, null, and empty strings
            if (data[src] !== undefined && data[src] !== null && data[src] !== '') {
                cols.push(dest);
                placeholders.push('?');
                values.push(data[src]);
            }
        }
        if (!cols.includes('ma_sinh_vien')) {
            throw new Error('Thiếu ma_sinh_vien khi tạo sinh viên');
        }

        const sql = `INSERT INTO sinh_vien (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
        const result = await query(sql, values);
        return { success: true, insertId: result.insertId };
    }

    // Tìm theo mã sinh viên
    static async findByMaSinhVien(maSinhVien) {
        try {
            const rows = await query('SELECT * FROM sinh_vien WHERE ma_sinh_vien = ? LIMIT 1', [maSinhVien]);
            return rows && rows.length ? rows[0] : null;
        } catch (error) {
            console.error('Error in findByMaSinhVien:', error);
            throw error;
        }
    }

    // Gắn account cho sinh viên theo mã sinh viên
    static async attachAccountByMaSinhVien(maSinhVien, accountId) {
        try {
            const sql = `UPDATE sinh_vien SET account_id = ?, updated_at = NOW() WHERE ma_sinh_vien = ?`;
            const result = await query(sql, [accountId, maSinhVien]);
            return { success: true, affectedRows: result.affectedRows || 0 };
        } catch (error) {
            console.error('Error in attachAccountByMaSinhVien:', error);
            throw error;
        }
    }

    static async getByUserId(userId) {
        try {
            const normalizedUserId = String(userId || '').trim();
            if (!normalizedUserId) return null;

            // Primary path: linked account_id -> accounts.id
            let rows = await query(
                `SELECT sv.*, a.user_id
                 FROM sinh_vien sv
                 JOIN accounts a ON sv.account_id = a.id
                 WHERE a.user_id = ?
                 LIMIT 1`,
                [normalizedUserId]
            );

            if (rows && rows.length) {
                return rows[0];
            }

            // Fallback path: data imported but account_id not linked yet.
            rows = await query(
                `SELECT sv.*
                 FROM sinh_vien sv
                 WHERE LOWER(TRIM(sv.ma_sinh_vien)) = LOWER(TRIM(?))
                 LIMIT 1`,
                [normalizedUserId]
            );

            if (rows && rows.length) {
                const fallbackStudent = rows[0];

                try {
                    if (!fallbackStudent.account_id) {
                        const accountRows = await query(
                            'SELECT id FROM accounts WHERE user_id = ? LIMIT 1',
                            [normalizedUserId]
                        );

                        if (accountRows && accountRows.length > 0) {
                            await query(
                                'UPDATE sinh_vien SET account_id = ?, updated_at = NOW() WHERE id = ?',
                                [accountRows[0].id, fallbackStudent.id]
                            );
                            fallbackStudent.account_id = accountRows[0].id;
                        }
                    }
                } catch (linkError) {
                    console.warn('Warning: failed to auto-link sinh_vien.account_id:', linkError.message || linkError);
                }

                return {
                    ...fallbackStudent,
                    user_id: normalizedUserId
                };
            }

            return null;
        } catch (error) {
            console.error('Error in getByUserId:', error);
            throw error;
        }
    }

    static async updateInternshipRegistration(userId, registrationData = {}) {
        try {
            const student = await this.getByUserId(userId);
            if (!student || !student.id) {
                return { success: false, message: 'Không tìm thấy sinh viên' };
            }

            const fields = [];
            const values = [];
            const allowed = ['nguyen_vong_thuc_tap', 'vi_tri_muon_ung_tuyen_thuc_tap', 'so_dien_thoai', 'email_ca_nhan', 'dia_chi', 'don_vi_thuc_tap', 'cong_ty_tu_lien_he', 'dia_chi_cong_ty', 'nguoi_lien_he_cong_ty', 'sdt_nguoi_lien_he', 'gpa', 'cv_path'];
            
            for (const k of allowed) {
                if (registrationData[k] !== undefined) {
                    fields.push(`sv.${k} = ?`);
                    values.push(registrationData[k]);
                }
            }
            
            if (!fields.length) {
                return { success: false, message: 'No fields to update' };
            }
            
            const sql = `UPDATE sinh_vien SET ${fields.map((f) => f.replace('sv.', '')).join(', ')}, updated_at = NOW() WHERE id = ?`;
            values.push(student.id);
            
            const res = await query(sql, values);
            if (!res || res.affectedRows === 0) {
                return { success: false, message: 'Không tìm thấy sinh viên' };
            }

                        const markSql = `UPDATE sinh_vien 
                                SET trang_thai_phan_cong = 'da-phan-cong' 
                                WHERE id = ? 
                                    AND vi_tri_muon_ung_tuyen_thuc_tap IS NOT NULL AND vi_tri_muon_ung_tuyen_thuc_tap <> '' 
                                    AND don_vi_thuc_tap IS NOT NULL AND don_vi_thuc_tap <> ''
                                    AND giang_vien_huong_dan IS NOT NULL AND giang_vien_huong_dan <> ''
                                    AND nguyen_vong_thuc_tap IS NOT NULL AND nguyen_vong_thuc_tap <> ''
                                    AND cv_path IS NOT NULL AND cv_path <> ''`;
            
            await query(markSql, [student.id]);
            
            const updatedStudent = await this.getByUserId(userId);
            return { success: true, data: updatedStudent };
        } catch (error) {
            console.error('Error in updateInternshipRegistration:', error);
            return { success: false, message: 'Lỗi cập nhật thông tin thực tập' };
        }
    }

    static async recalcAssignmentStatus() {
        try {
            const sql = `
                UPDATE sinh_vien 
                SET trang_thai_phan_cong = CASE 
                    WHEN vi_tri_muon_ung_tuyen_thuc_tap IS NOT NULL 
                         AND vi_tri_muon_ung_tuyen_thuc_tap <> '' 
                         AND don_vi_thuc_tap IS NOT NULL 
                         AND don_vi_thuc_tap <> ''
                         AND giang_vien_huong_dan IS NOT NULL 
                         AND giang_vien_huong_dan <> ''
                         AND nguyen_vong_thuc_tap IS NOT NULL 
                         AND nguyen_vong_thuc_tap <> ''
                         AND cv_path IS NOT NULL
                         AND cv_path <> ''
                    THEN 'da-phan-cong' 
                    ELSE 'chua-phan-cong' 
                END`;
            await query(sql);
            console.log('✅ Đã cập nhật trạng thái phân công cho tất cả sinh viên (cần đủ 5 thông tin: vị trí + doanh nghiệp + giảng viên + nguyện vọng + CV)');
        } catch (error) {
            console.error('Error in recalcAssignmentStatus:', error);
        }
    }

    static async findByAccountId(accountId) {
        try {
            const sql = 'SELECT * FROM sinh_vien WHERE account_id = ? LIMIT 1';
            const rows = await query(sql, [accountId]);
            return rows && rows.length ? new SinhVien(rows[0]) : null;
        } catch (error) {
            console.error('Error in findByAccountId:', error);
            throw error;
        }
    }

    static async updateByAccountId(accountId, data) {
        try {
            const fields = [];
            const values = [];
            const allowed = ['ho_ten', 'lop', 'khoa', 'nganh', 'khoa_hoc', 'ngay_sinh', 'gioi_tinh', 'dia_chi', 'so_dien_thoai', 'email_ca_nhan', 'gpa', 'tinh_trang_hoc_tap'];
            
            for (const k of allowed) {
                if (data[k] !== undefined) {
                    fields.push(`${k} = ?`);
                    values.push(data[k]);
                }
            }
            
            if (!fields.length) {
                return { success: false, message: 'No fields to update' };
            }
            
            const sql = `UPDATE sinh_vien SET ${fields.join(', ')}, updated_at = NOW() WHERE account_id = ?`;
            values.push(accountId);
            
            const result = await query(sql, values);
            return { success: true, affectedRows: result.affectedRows };
        } catch (error) {
            console.error('Error in updateByAccountId:', error);
            throw error;
        }
    }

    // Cập nhật theo mã sinh viên (được dùng bởi ExcelImportService)
    static async updateByMaSinhVien(maSinhVien, data) {
        const mapping = {
            hoTen: 'ho_ten',
            emailCaNhan: 'email_ca_nhan',
            soDienThoai: 'so_dien_thoai',
            lop: 'lop',
            khoa: 'khoa',
            nganh: 'nganh',
            khoaHoc: 'khoa_hoc',
            ngaySinh: 'ngay_sinh',
            gioiTinh: 'gioi_tinh',
            diaChi: 'dia_chi',
            gpa: 'gpa',
            soTCTichLuy: 'so_tc_tich_luy',
            soTCHT: 'so_tc_ht',
            namThu: 'nam_thu',
            hpNo: 'hp_no',
            tinhTrangHocTap: 'tinh_trang_hoc_tap',
            viTriMuonUngTuyen: 'vi_tri_muon_ung_tuyen_thuc_tap',
            donViThucTap: 'don_vi_thuc_tap',
            nguyenVongThucTap: 'nguyen_vong_thuc_tap',
            giangVienHuongDan: 'giang_vien_huong_dan'
        };
        const fields = [];
        const values = [];
        for (const [src, dest] of Object.entries(mapping)) {
            const incoming = data[src];
            if (incoming === undefined || incoming === null) continue;
            if (typeof incoming === 'string' && incoming.trim() === '') continue;

                fields.push(`${dest} = ?`);
                values.push(incoming);
        }
        if (!fields.length) return { success: false, message: 'No fields to update' };
        const sql = `UPDATE sinh_vien SET ${fields.join(', ')}, updated_at = NOW() WHERE ma_sinh_vien = ?`;
        values.push(data.maSinhVien || maSinhVien);
        const result = await query(sql, values);
        return { success: true, affectedRows: result.affectedRows };
    }

    // Xóa trùng lặp theo ma_sinh_vien (giữ lại id nhỏ nhất)
    static async deduplicateByMaSinhVien() {
        try {
            const sql = `
                DELETE sv1 FROM sinh_vien sv1
                INNER JOIN sinh_vien sv2
                  ON sv1.ma_sinh_vien = sv2.ma_sinh_vien AND sv1.id > sv2.id`;
            const res = await query(sql);
            return { success: true, affectedRows: res.affectedRows || 0 };
        } catch (error) {
            console.error('Error in deduplicateByMaSinhVien:', error);
            return { success: false, message: error.message };
        }
    }

    // Chỉ điền vào các cột đang trống (NULL hoặc '')
    static async fillEmptyColumnsByMaSinhVien(maSinhVien, data) {
        const mapping = {
            hoTen: 'ho_ten',
            emailCaNhan: 'email_ca_nhan',
            soDienThoai: 'so_dien_thoai',
            lop: 'lop',
            khoa: 'khoa',
            nganh: 'nganh',
            khoaHoc: 'khoa_hoc',
            ngaySinh: 'ngay_sinh',
            gioiTinh: 'gioi_tinh',
            diaChi: 'dia_chi',
            gpa: 'gpa',
            soTCTichLuy: 'so_tc_tich_luy',
            soTCHT: 'so_tc_ht',
            namThu: 'nam_thu',
            hpNo: 'hp_no',
            tinhTrangHocTap: 'tinh_trang_hoc_tap',
            viTriMuonUngTuyen: 'vi_tri_muon_ung_tuyen_thuc_tap',
            donViThucTap: 'don_vi_thuc_tap',
            nguyenVongThucTap: 'nguyen_vong_thuc_tap',
            giangVienHuongDan: 'giang_vien_huong_dan'
        };
        const sets = [];
        const values = [];
        const overwriteColumns = ['so_tc_tich_luy', 'so_tc_ht', 'nam_thu', 'hp_no'];
        
        // Columns that should only check IS NULL (not empty string)
        // - DATE columns: MySQL DATE cannot be ''
        // - DECIMAL/NUMERIC columns: MySQL DECIMAL cannot be ''
        const specialColumns = ['ngay_sinh', 'gpa'];
        
        for (const [src, dest] of Object.entries(mapping)) {
            const incoming = data[src];
            if (incoming !== undefined && incoming !== null && String(incoming).trim() !== '') {
                if (overwriteColumns.includes(dest)) {
                    // Các cột học vụ cần đồng bộ đúng theo file import mới nhất.
                    sets.push(`${dest} = ?`);
                    values.push(incoming);
                    continue;
                }

                // For special columns (DATE, DECIMAL), only check IS NULL
                if (specialColumns.includes(dest)) {
                    sets.push(`${dest} = IF(${dest} IS NULL, ?, ${dest})`);
                } else {
                    sets.push(`${dest} = IF(${dest} IS NULL OR ${dest} = '', ?, ${dest})`);
                }
                values.push(incoming);
            }
        }
        if (!sets.length) return { success: false, message: 'No non-empty fields provided' };
        const sql = `UPDATE sinh_vien SET ${sets.join(', ')}, updated_at = NOW() WHERE ma_sinh_vien = ?`;
        values.push(data.maSinhVien || maSinhVien);
        const result = await query(sql, values);
        return { success: true, affectedRows: result.affectedRows };
    }

    static async getAllWithPagination(page = 1, limit = 10, search = '', nguyen_vong = '', approvedOnly = false, trang_thai_filter = '') {
        try {
            await this.recalcAssignmentStatus();
            
            const offset = (page - 1) * limit;
            const sinhVienColumns = await this.getTableColumns('sinh_vien');

            const buildWhere = (approvalSource = 'workflow') => {
                let whereClause = '';
                const whereParams = [];
                const addCondition = (cond) => {
                    whereClause += (whereClause ? ' AND ' : ' WHERE ') + cond;
                };

                if (search) {
                    whereClause += ' WHERE (sv.ho_ten LIKE ? OR sv.ma_sinh_vien LIKE ? OR sv.lop LIKE ? OR sv.khoa LIKE ?)';
                    whereParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
                }

                if (nguyen_vong) {
                    const hyphen = nguyen_vong.replace(/_/g, '-');
                    const underscore = nguyen_vong.replace(/-/g, '_');
                    addCondition('(sv.nguyen_vong_thuc_tap = ? OR sv.nguyen_vong_thuc_tap = ?)');
                    whereParams.push(underscore, hyphen);
                }

                const regTable = approvalSource === 'legacy' ? 'dang_ky_sinh_vien' : 'dang_ky_thuc_tap_sinh_vien';
                const latestStatusExpr = approvalSource === 'legacy'
                    ? `(SELECT dkf2.trang_thai FROM ${regTable} dkf2 WHERE dkf2.sinh_vien_id = sv.id ORDER BY dkf2.id DESC LIMIT 1)`
                    : `(SELECT COALESCE(dkf2.workflow_status_v2, dkf2.trang_thai) FROM ${regTable} dkf2 WHERE dkf2.sinh_vien_id = sv.id ORDER BY dkf2.id DESC LIMIT 1)`;
                const addLatestStatusFilter = (statuses) => {
                    addCondition(`LOWER(COALESCE(${latestStatusExpr}, '')) IN (${statuses.map(() => '?').join(', ')})`);
                    whereParams.push(...statuses.map((status) => String(status).toLowerCase()));
                };
                const buildAssignedCondition = (columns, missingLabels) => {
                    const checks = columns
                        .filter((column) => sinhVienColumns.has(column))
                        .map((column) => {
                            const normalized = `LOWER(TRIM(COALESCE(CAST(sv.\`${column}\` AS CHAR), '')))`;
                            const labelChecks = missingLabels.map(() => `${normalized} NOT LIKE ?`);
                            whereParams.push(...missingLabels.map((label) => `%${label}%`));
                            return `(
                                ${normalized} <> ''
                                AND ${normalized} <> '0'
                                AND ${normalized} <> 'null'
                                AND ${normalized} <> 'undefined'
                                AND ${normalized} <> '-'
                                ${labelChecks.length ? `AND ${labelChecks.join(' AND ')}` : ''}
                            )`;
                        });

                    return checks.length ? `(${checks.join(' OR ')})` : 'FALSE';
                };

                // Server-side filter by approval status
                if (trang_thai_filter && trang_thai_filter !== 'all') {
                    if (trang_thai_filter === 'chua-dang-ky') {
                        addCondition(`NOT EXISTS (SELECT 1 FROM ${regTable} dkf WHERE dkf.sinh_vien_id = sv.id)`);
                    } else if (trang_thai_filter === 'chua-phan-cong') {
                        addLatestStatusFilter(['approved', 'interview_scheduled', 'pass', 'da-duyet']);
                        const hasTeacher = buildAssignedCondition(
                            ['giang_vien_id', 'lecturer_id', 'supervisor_id', 'teacher_id', 'ten_giang_vien', 'giang_vien_huong_dan'],
                            ['chưa phân công', 'chua phan cong', 'chưa chọn', 'chua chon', 'chọn giảng viên', 'chon giang vien']
                        );
                        const hasBatch = buildAssignedCondition(
                            ['dot_thuc_tap_id', 'internship_batch_id', 'batch_id', 'ten_dot', 'dot', 'internship_period', 'dot_thuc_tap_admin'],
                            ['chưa phân đợt', 'chua phan dot', 'chưa phân công', 'chua phan cong', 'chưa chọn', 'chua chon', 'chọn đợt', 'chon dot']
                        );
                        addCondition(`(
                            NOT ${hasTeacher}
                            OR NOT ${hasBatch}
                        )`);
                    } else if (trang_thai_filter === 'da-duyet') {
                        addLatestStatusFilter(['approved', 'interview_scheduled', 'pass', 'da-duyet']);
                    } else if (trang_thai_filter === 'cho-duyet') {
                        addLatestStatusFilter(['pending', 'cho-duyet']);
                    } else if (trang_thai_filter === 'bi-tu-choi') {
                        addLatestStatusFilter(['rejected', 'fail', 'tu-choi', 'bi-tu-choi']);
                    } else {
                        addLatestStatusFilter([trang_thai_filter]);
                    }
                }

                if (approvedOnly && !trang_thai_filter) {
                    addLatestStatusFilter(['approved', 'interview_scheduled', 'pass', 'da-duyet']);
                }

                return { whereClause, whereParams };
            };

            const runWithSource = async (approvalSource = 'workflow') => {
                const { whereClause, whereParams } = buildWhere(approvalSource);
                const countSql = `SELECT COUNT(*) as total FROM sinh_vien sv${whereClause}`;
                const countResult = await query(countSql, whereParams);
                const total = countResult[0]?.total || 0;

                const approvalStatusSelect = approvalSource === 'legacy'
                    ? `(SELECT dksv.trang_thai
                        FROM dang_ky_sinh_vien dksv
                        WHERE dksv.sinh_vien_id = sv.id
                        ORDER BY dksv.id DESC
                        LIMIT 1)`
                    : `(SELECT COALESCE(dktt.workflow_status_v2, dktt.trang_thai)
                        FROM dang_ky_thuc_tap_sinh_vien dktt
                        WHERE dktt.sinh_vien_id = sv.id
                        ORDER BY dktt.id DESC
                        LIMIT 1)`;

                const dataSql = `
                    SELECT sv.*, a.user_id, ${approvalStatusSelect} AS trang_thai_duyet
                    FROM sinh_vien sv
                    LEFT JOIN accounts a ON sv.account_id = a.id
                    ${whereClause}
                    ORDER BY sv.created_at DESC, sv.id DESC
                    LIMIT ? OFFSET ?
                `;

                const dataParams = [...whereParams, limit, offset];
                const students = await query(dataSql, dataParams);

                return { total, students };
            };

            let total = 0;
            let students = [];

            try {
                const result = await runWithSource('workflow');
                total = result.total;
                students = result.students;
            } catch (workflowError) {
                if (workflowError?.code !== 'ER_NO_SUCH_TABLE' && workflowError?.errno !== 1146) {
                    throw workflowError;
                }

                const result = await runWithSource('legacy');
                total = result.total;
                students = result.students;
            }
            
            return {
                data: students,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            console.error('Error in getAllWithPagination:', error);
            throw error;
        }
    }

    static async getStatistics() {
        try {
            await this.recalcAssignmentStatus();
            
            const sql = `SELECT COUNT(*) as total, SUM(CASE WHEN trang_thai_phan_cong = 'da-phan-cong' THEN 1 ELSE 0 END) as da_phan_cong, SUM(CASE WHEN trang_thai_phan_cong = 'chua-phan-cong' THEN 1 ELSE 0 END) as chua_phan_cong, SUM(CASE WHEN nguyen_vong_thuc_tap = 'khoa_gioi_thieu' THEN 1 ELSE 0 END) as khoa_gioi_thieu, SUM(CASE WHEN nguyen_vong_thuc_tap = 'tu_lien_he' THEN 1 ELSE 0 END) as tu_lien_he FROM sinh_vien`;
            
            const rows = await query(sql);
            return rows && rows[0] ? rows[0] : { 
                total: 0, 
                da_phan_cong: 0, 
                chua_phan_cong: 0,
                khoa_gioi_thieu: 0,
                tu_lien_he: 0
            };
        } catch (error) {
            console.error('Error in getStatistics:', error);
            return { 
                total: 0, 
                da_phan_cong: 0, 
                chua_phan_cong: 0,
                khoa_gioi_thieu: 0,
                tu_lien_he: 0
            };
        }
    }
}

module.exports = SinhVien;
