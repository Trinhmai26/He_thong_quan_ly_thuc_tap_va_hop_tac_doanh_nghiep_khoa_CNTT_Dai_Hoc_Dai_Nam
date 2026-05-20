// Model: GiangVien (Lecturer)
// File: src/models\GiangVien.js

const db = require('../database/connection');

class GiangVien {
    constructor(data) {
        this.id = data.id;
        this.accountId = data.account_id;
        this.maGiangVien = data.ma_giang_vien;
        this.hoTen = data.ho_ten;
        this.khoa = data.khoa;
        this.boMon = data.bo_mon;
        this.chucVu = data.chuc_vu;
        this.hocVi = data.hoc_vi;
        this.chuyenMon = data.chuyen_mon;
        this.soDienThoai = data.so_dien_thoai;
        this.emailCaNhan = data.email_ca_nhan;
        this.diaChi = data.dia_chi;
        this.kinhNghiemLamViec = data.kinh_nghiem_lam_viec;
        this.bangCap = data.bang_cap;
        this.ngaySinh = data.ngay_sinh;
        this.chucDanh = data.chuc_danh;
        this.canCuocCongDan = data.can_cuoc_cong_dan;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
    }

    // Tạo profile giảng viên mới
    static async create(giangVienData) {
        const {
            accountId,
            maGiangVien,
            hoTen,
            khoa,
            boMon = null,
            chucVu = null,
            hocVi = null,
            chuyenMon = null,
            soDienThoai = null,
            emailCaNhan = null,
            diaChi = null,
            kinhNghiemLamViec = null,
            bangCap = null,
            ngaySinh = null,
            chucDanh = null,
            canCuocCongDan = null
        } = giangVienData;

        const query = `
            INSERT INTO giang_vien
            (account_id, ma_giang_vien, ho_ten, khoa, bo_mon, chuc_vu, hoc_vi,
             chuyen_mon, so_dien_thoai, email_ca_nhan, dia_chi, kinh_nghiem_lam_viec, bang_cap,
             ngay_sinh, chuc_danh, can_cuoc_cong_dan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        console.log('🔍 GiangVien.create - Executing query:', query);
        console.log('🔍 GiangVien.create - Parameters:', [
            accountId, maGiangVien, hoTen, khoa, boMon, chucVu, hocVi,
            chuyenMon, soDienThoai, emailCaNhan, diaChi, kinhNghiemLamViec, bangCap,
            ngaySinh, chucDanh, canCuocCongDan
        ]);

        try {
            const result = await db.query(query, [
                accountId, maGiangVien, hoTen, khoa, boMon, chucVu, hocVi,
                chuyenMon, soDienThoai, emailCaNhan, diaChi, kinhNghiemLamViec, bangCap,
                ngaySinh, chucDanh, canCuocCongDan
            ]);

            console.log('✅ GiangVien.create - Database result:', JSON.stringify(result, null, 2));

            return {
                success: true,
                insertId: result.insertId || (result[0] && result[0].insertId),
                message: 'Profile giảng viên được tạo thành công'
            };
        } catch (error) {
            console.error('❌ Error creating giang vien profile:', error);
            throw error;
        }
    }

    // Tạo nhiều giảng viên (bulk insert)
    static async createMany(giangVienDataArray) {
        try {
            const results = {
                created: 0,
                updated: 0,
                errors: []
            };

            for (const giangVienData of giangVienDataArray) {
                try {
                    // Kiểm tra giảng viên đã tồn tại
                    const existing = await this.findByMaGiangVien(giangVienData.maGiangVien);
                    
                    if (existing) {
                        // Cập nhật thông tin giảng viên
                        await this.updateByMaGiangVien(giangVienData.maGiangVien, giangVienData);
                        results.updated++;
                    } else {
                        // Tạo profile mới
                        await this.create(giangVienData);
                        results.created++;
                    }
                } catch (error) {
                    results.errors.push({
                        maGiangVien: giangVienData.maGiangVien,
                        error: error.message
                    });
                }
            }
            
            return results;
        } catch (error) {
            throw error;
        }
    }    // Tìm giảng viên theo mã giảng viên
    static async findByMaGiangVien(maGiangVien) {
        const query = 'SELECT * FROM giang_vien WHERE ma_giang_vien = ?';
        
        try {
            const rows = await db.query(query, [maGiangVien]);
            return rows.length > 0 ? new GiangVien(rows[0]) : null;
        } catch (error) {
            console.error('Error finding giang vien by ma giang vien:', error);
            throw error;
        }
    }

    // Tìm giảng viên theo account_id
    static async findByAccountId(accountId) {
        const query = 'SELECT * FROM giang_vien WHERE account_id = ?';
        
        try {
            const rows = await db.query(query, [accountId]);
            return {
                success: rows.length > 0,
                data: rows.length > 0 ? rows[0] : null,
                message: rows.length > 0 ? 'Tìm thấy giảng viên' : 'Không tìm thấy giảng viên'
            };
        } catch (error) {
            console.error('Error finding giang vien by account ID:', error);
            return {
                success: false,
                data: null,
                message: 'Lỗi khi tìm giảng viên'
            };
        }
    }

    // Cập nhật thông tin giảng viên theo mã giảng viên
    static async updateByMaGiangVien(maGiangVien, updateData) {
        const updateFields = [];
        const params = [];

        // Các trường có thể cập nhật
        const allowedFields = [
            'ho_ten', 'khoa', 'bo_mon', 'chuc_vu', 'hoc_vi', 'chuyen_mon',
            'so_dien_thoai', 'email_ca_nhan', 'dia_chi', 'kinh_nghiem_lam_viec', 'bang_cap',
            'ngay_sinh', 'chuc_danh', 'can_cuoc_cong_dan'
        ];

        allowedFields.forEach(field => {
            const camelCaseField = field.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            if (updateData[camelCaseField] !== undefined) {
                updateFields.push(`${field} = ?`);
                params.push(updateData[camelCaseField]);
            }
        });

        if (updateFields.length === 0) {
            return { success: false, message: 'Không có dữ liệu để cập nhật' };
        }

        updateFields.push('updated_at = NOW()');
        const query = `UPDATE giang_vien SET ${updateFields.join(', ')} WHERE ma_giang_vien = ?`;
        params.push(maGiangVien);

        try {
            const result = await db.query(query, params);
            return {
                success: result.affectedRows > 0,
                message: result.affectedRows > 0 ? 'Cập nhật thành công' : 'Không tìm thấy giảng viên'
            };
        } catch (error) {
            console.error('Error updating giang vien:', error);
            throw error;
        }
    }

    // Lấy danh sách giảng viên với phân trang
    static async getAll(page = 1, limit = 20, filters = {}) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT gv.*, acc.user_id, acc.email, acc.is_active,
                                     (
                                         SELECT COUNT(*)
                                         FROM sinh_vien sv
                                         WHERE COALESCE(TRIM(sv.giang_vien_huong_dan), '') <> ''
                                             AND LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
                                     ) as so_sinh_vien_huong_dan
            FROM giang_vien gv 
            JOIN accounts acc ON gv.account_id = acc.id 
            WHERE 1=1
        `;
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM giang_vien gv 
            JOIN accounts acc ON gv.account_id = acc.id 
            WHERE 1=1
        `;
        
        const params = [];
        const countParams = [];

        // Áp dụng filters
        if (filters.khoa) {
            query += ' AND gv.khoa = ?';
            countQuery += ' AND gv.khoa = ?';
            params.push(filters.khoa);
            countParams.push(filters.khoa);
        }
        if (filters.boMon) {
            query += ' AND gv.bo_mon = ?';
            countQuery += ' AND gv.bo_mon = ?';
            params.push(filters.boMon);
            countParams.push(filters.boMon);
        }
        if (filters.chucVu) {
            query += ' AND gv.chuc_vu = ?';
            countQuery += ' AND gv.chuc_vu = ?';
            params.push(filters.chucVu);
            countParams.push(filters.chucVu);
        }

        query += ' ORDER BY gv.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        try {
            const rows = await db.query(query, params);
            const countRows = await db.query(countQuery, countParams);
            
            const giangViens = rows.map(row => ({
                ...new GiangVien(row),
                userId: row.user_id,
                email: row.email,
                isActive: row.is_active,
                // expose both snake_case and camelCase for the frontend
                so_sinh_vien_huong_dan: row.so_sinh_vien_huong_dan ?? 0,
                soSinhVienHuongDan: row.so_sinh_vien_huong_dan ?? 0
            }));

            return {
                giangViens,
                pagination: {
                    page,
                    limit,
                    total: countRows[0].total,
                    totalPages: Math.ceil(countRows[0].total / limit)
                }
            };
        } catch (error) {
            console.error('Error getting all giang vien:', error);
            throw error;
        }
    }

    // Tìm kiếm giảng viên
    static async search(keyword, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        const query = `
            SELECT gv.*, acc.user_id, acc.email, acc.is_active,
                                     (
                                         SELECT COUNT(*)
                                         FROM sinh_vien sv
                                         WHERE COALESCE(TRIM(sv.giang_vien_huong_dan), '') <> ''
                                             AND LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
                                     ) as so_sinh_vien_huong_dan
            FROM giang_vien gv 
            JOIN accounts acc ON gv.account_id = acc.id 
            WHERE (gv.ma_giang_vien LIKE ? OR gv.ho_ten LIKE ? OR gv.khoa LIKE ? OR gv.bo_mon LIKE ?)
            ORDER BY gv.created_at DESC 
            LIMIT ? OFFSET ?
        `;

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM giang_vien gv 
            JOIN accounts acc ON gv.account_id = acc.id 
            WHERE (gv.ma_giang_vien LIKE ? OR gv.ho_ten LIKE ? OR gv.khoa LIKE ? OR gv.bo_mon LIKE ?)
        `;

        const searchTerm = `%${keyword}%`;
        const params = [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset];
        const countParams = [searchTerm, searchTerm, searchTerm, searchTerm];

        try {
            const rows = await db.query(query, params);
            const countRows = await db.query(countQuery, countParams);
            
            const giangViens = rows.map(row => ({
                ...new GiangVien(row),
                userId: row.user_id,
                email: row.email,
                isActive: row.is_active,
                so_sinh_vien_huong_dan: row.so_sinh_vien_huong_dan ?? 0,
                soSinhVienHuongDan: row.so_sinh_vien_huong_dan ?? 0
            }));

            return {
                giangViens,
                pagination: {
                    page,
                    limit,
                    total: countRows[0].total,
                    totalPages: Math.ceil(countRows[0].total / limit)
                }
            };
        } catch (error) {
            console.error('Error searching giang vien:', error);
            throw error;
        }
    }

    // Cập nhật giảng viên theo account_id
    static async updateByAccountId(accountId, updateData) {
        try {
            // Build dynamic SQL update query
            const fields = [];
            const values = [];
            
            if (updateData.ho_ten !== undefined) {
                fields.push('ho_ten = ?');
                values.push(updateData.ho_ten);
            }
            if (updateData.email_ca_nhan !== undefined) {
                fields.push('email_ca_nhan = ?');
                values.push(updateData.email_ca_nhan);
            } else if (updateData.email !== undefined) {
                fields.push('email_ca_nhan = ?');
                values.push(updateData.email);
            }
            if (updateData.so_dien_thoai !== undefined) {
                fields.push('so_dien_thoai = ?');
                values.push(updateData.so_dien_thoai);
            }
            if (updateData.dia_chi !== undefined) {
                fields.push('dia_chi = ?');
                values.push(updateData.dia_chi);
            }
            if (updateData.ma_giang_vien !== undefined) {
                fields.push('ma_giang_vien = ?');
                values.push(updateData.ma_giang_vien);
            }
            if (updateData.bo_mon !== undefined) {
                fields.push('bo_mon = ?');
                values.push(updateData.bo_mon);
            }
            if (updateData.hoc_vi !== undefined) {
                fields.push('hoc_vi = ?');
                values.push(updateData.hoc_vi);
            }
            if (updateData.chuyen_mon !== undefined) {
                fields.push('chuyen_mon = ?');
                values.push(updateData.chuyen_mon);
            }
            if (updateData.ngay_sinh !== undefined) {
                fields.push('ngay_sinh = ?');
                values.push(updateData.ngay_sinh);
            }
            if (updateData.chuc_danh !== undefined) {
                fields.push('chuc_danh = ?');
                values.push(updateData.chuc_danh);
            }
            if (updateData.can_cuoc_cong_dan !== undefined) {
                fields.push('can_cuoc_cong_dan = ?');
                values.push(updateData.can_cuoc_cong_dan);
            }

            if (fields.length === 0) {
                return {
                    success: false,
                    message: 'Không có dữ liệu để cập nhật'
                };
            }

            values.push(accountId);
            const query = `UPDATE giang_vien SET ${fields.join(', ')} WHERE account_id = ?`;
            
            const result = await db.query(query, values);
            
            return {
                success: result.affectedRows > 0,
                message: result.affectedRows > 0 ? 'Cập nhật thành công' : 'Không tìm thấy giảng viên',
                data: result
            };
        } catch (error) {
            console.error('Error updating giang vien by account id:', error);
            return {
                success: false,
                message: 'Lỗi khi cập nhật thông tin giảng viên'
            };
        }
    }

    // Cập nhật số lượng sinh viên hướng dẫn
    static async updateStudentCount(maGiangVien, soLuong) {
        const query = `
            UPDATE giang_vien 
            SET so_sinh_vien_huong_dan = ?
            WHERE ma_giang_vien = ?
        `;
        
        try {
            const result = await db.query(query, [soLuong, maGiangVien]);
            console.log(`📝 Updated ${maGiangVien} with ${soLuong} students, affected rows:`, result.affectedRows);
            return result;
        } catch (error) {
            console.error('Error updating student count:', error);
            throw error;
        }
    }

    // Xóa giảng viên
    static async delete(accountId) {
        const query = 'DELETE FROM giang_vien WHERE account_id = ?';
        
        try {
            const result = await db.query(query, [accountId]);
            return {
                success: result.affectedRows > 0,
                message: result.affectedRows > 0 ? 'Xóa giảng viên thành công' : 'Không tìm thấy giảng viên'
            };
        } catch (error) {
            console.error('Error deleting giang vien:', error);
            throw error;
        }
    }
}

module.exports = GiangVien;