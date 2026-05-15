// Model: Admin
// File: src/models/Admin.js

const db = require('../database/connection');

class Admin {
    constructor(data) {
        this.id = data.id;
        this.accountId = data.account_id;
        this.fullName = data.full_name;
        this.phone = data.phone;
        this.position = data.position;
        this.permissions = data.permissions;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
    }

    // Tạo profile admin mới
    static async create(adminData) {
        const { accountId, fullName, phone = null, position = null, permissions = null } = adminData;

        const query = `
            INSERT INTO admin (account_id, full_name, phone, position, permissions) 
            VALUES (?, ?, ?, ?, ?)
        `;

        try {
            const result = await db.query(query, [
                accountId,
                fullName,
                phone,
                position,
                permissions ? JSON.stringify(permissions) : null
            ]);

            return {
                success: true,
                insertId: result.insertId,
                message: 'Profile admin được tạo thành công'
            };
        } catch (error) {
            console.error('Error creating admin profile:', error);
            throw error;
        }
    }

    // Tìm profile admin theo account_id
    static async findByAccountId(accountId) {
        const query = 'SELECT * FROM admin WHERE account_id = ?';
        
        try {
            const rows = await db.query(query, [accountId]);
            if (rows.length > 0) {
                const adminData = rows[0];
                if (adminData.permissions) {
                    adminData.permissions = JSON.parse(adminData.permissions);
                }
                return {
                    success: true,
                    data: adminData,
                    message: 'Tìm thấy admin'
                };
            }
            return {
                success: false,
                data: null,
                message: 'Không tìm thấy admin'
            };
        } catch (error) {
            console.error('Error finding admin by account ID:', error);
            return {
                success: false,
                data: null,
                message: 'Lỗi khi tìm admin'
            };
        }
    }

    // Cập nhật profile admin
    static async update(accountId, updateData) {
        const { fullName, phone, position, permissions } = updateData;

        let query = 'UPDATE admin SET ';
        const params = [];
        const updateFields = [];

        if (fullName) {
            updateFields.push('full_name = ?');
            params.push(fullName);
        }
        if (phone !== undefined) {
            updateFields.push('phone = ?');
            params.push(phone);
        }
        if (position !== undefined) {
            updateFields.push('position = ?');
            params.push(position);
        }
        if (permissions !== undefined) {
            updateFields.push('permissions = ?');
            params.push(permissions ? JSON.stringify(permissions) : null);
        }

        if (updateFields.length === 0) {
            return { success: false, message: 'Không có dữ liệu để cập nhật' };
        }

        updateFields.push('updated_at = NOW()');
        query += updateFields.join(', ') + ' WHERE account_id = ?';
        params.push(accountId);

        try {
            const result = await db.query(query, params);
            return {
                success: result.affectedRows > 0,
                message: result.affectedRows > 0 ? 'Cập nhật thành công' : 'Không tìm thấy profile admin'
            };
        } catch (error) {
            console.error('Error updating admin profile:', error);
            throw error;
        }
    }

    // Lấy tất cả admin
    static async getAll() {
        const query = `
            SELECT a.*, acc.user_id, acc.email, acc.is_active 
            FROM admin a 
            JOIN accounts acc ON a.account_id = acc.id 
            ORDER BY a.created_at DESC
        `;

        try {
            const rows = await db.query(query);
            return rows.map(row => {
                if (row.permissions) {
                    row.permissions = JSON.parse(row.permissions);
                }
                return {
                    ...new Admin(row),
                    userId: row.user_id,
                    email: row.email,
                    isActive: row.is_active
                };
            });
        } catch (error) {
            console.error('Error getting all admins:', error);
            throw error;
        }
    }

    // Cập nhật admin theo account_id
    static async updateByAccountId(accountId, updateData) {
        try {
            // Build dynamic SQL update query - map frontend field names to DB column names
            const adminFields = [];
            const adminValues = [];

            if (updateData.ho_ten !== undefined) {
                adminFields.push('full_name = ?');
                adminValues.push(updateData.ho_ten);
            }
            if (updateData.so_dien_thoai !== undefined) {
                adminFields.push('phone = ?');
                adminValues.push(updateData.so_dien_thoai);
            }
            if (updateData.chuc_vu !== undefined) {
                adminFields.push('position = ?');
                adminValues.push(updateData.chuc_vu);
            }
            if (updateData.dia_chi !== undefined) {
                adminFields.push('dia_chi = ?');
                adminValues.push(updateData.dia_chi);
            }

            // Update admin table
            if (adminFields.length > 0) {
                adminFields.push('updated_at = NOW()');
                const adminQuery = `UPDATE admin SET ${adminFields.join(', ')} WHERE account_id = ?`;
                await db.query(adminQuery, [...adminValues, accountId]);
            }

            // Update email in accounts table separately
            if (updateData.email !== undefined) {
                await db.query('UPDATE accounts SET email = ?, updated_at = NOW() WHERE id = ?', [updateData.email, accountId]);
            }

            return {
                success: true,
                message: 'Cập nhật thành công'
            };
        } catch (error) {
            console.error('Error updating admin by account id:', error);
            return {
                success: false,
                message: 'Lỗi khi cập nhật thông tin admin'
            };
        }
    }

    // Xóa profile admin
    static async delete(accountId) {
        const query = 'DELETE FROM admin WHERE account_id = ?';
        
        try {
            const result = await db.query(query, [accountId]);
            return {
                success: result.affectedRows > 0,
                message: result.affectedRows > 0 ? 'Xóa profile admin thành công' : 'Không tìm thấy profile admin'
            };
        } catch (error) {
            console.error('Error deleting admin profile:', error);
            throw error;
        }
    }
}

module.exports = Admin;