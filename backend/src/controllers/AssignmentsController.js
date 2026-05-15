const connection = require('../database/connection');
const { createNotification, ensureNotificationsTable } = require('../utils/notificationHelper');

class AssignmentsController {
  
  // GET /api/assignments - Lấy danh sách phân công thực tập
  static async getAllAssignments(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        batchId = null, 
        studentId = null, 
        teacherId = null,
        companyId = null,
        status = 'all' 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      
      // Lọc theo đợt thực tập
      if (batchId) {
        whereClause += ' AND pc.dot_thuc_tap_id = ?';
        queryParams.push(batchId);
      }
      
      // Lọc theo sinh viên
      if (studentId) {
        whereClause += ' AND pc.sinh_vien_id = ?';
        queryParams.push(studentId);
      }
      
      // Lọc theo giảng viên
      if (teacherId) {
        whereClause += ' AND pc.giang_vien_id = ?';
        queryParams.push(teacherId);
      }
      
      // Lọc theo doanh nghiệp
      if (companyId) {
        whereClause += ' AND pc.doanh_nghiep_id = ?';
        queryParams.push(companyId);
      }
      
      // Lọc theo trạng thái
      if (status !== 'all') {
        whereClause += ' AND pc.trang_thai = ?';
        queryParams.push(status);
      }

      const sql = `
        SELECT 
          pc.*,
          sv.ma_sinh_vien,
          sv.ho_ten as ten_sinh_vien,
          sv.lop,
          sv.khoa,
          dn.ma_doanh_nghiep,
          dn.ten_cong_ty,
          gv.ma_giang_vien,
          gv.ho_ten as ten_giang_vien,
          dt.ten_dot,
          dt.trang_thai as trang_thai_dot
        FROM phan_cong_thuc_tap pc
        INNER JOIN sinh_vien sv ON pc.sinh_vien_id = sv.id
        INNER JOIN doanh_nghiep dn ON pc.doanh_nghiep_id = dn.id
        INNER JOIN dot_thuc_tap dt ON pc.dot_thuc_tap_id = dt.id
        LEFT JOIN giang_vien gv ON pc.giang_vien_id = gv.id
        ${whereClause}
        ORDER BY pc.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      queryParams.push(parseInt(limit), parseInt(offset));
      
      const assignments = await connection.query(sql, queryParams);
      
      // Đếm tổng số phân công
      const countSql = `
        SELECT COUNT(*) as total
        FROM phan_cong_thuc_tap pc
        INNER JOIN sinh_vien sv ON pc.sinh_vien_id = sv.id
        INNER JOIN doanh_nghiep dn ON pc.doanh_nghiep_id = dn.id
        INNER JOIN dot_thuc_tap dt ON pc.dot_thuc_tap_id = dt.id
        LEFT JOIN giang_vien gv ON pc.giang_vien_id = gv.id
        ${whereClause}
      `;
      
      const [countResult] = await connection.query(countSql, queryParams.slice(0, -2));
      const total = countResult.total;
      
      res.json({
        success: true,
        data: {
          assignments,
          pagination: {
            current: parseInt(page),
            pageSize: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Get assignments error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách phân công thực tập'
      });
    }
  }

  // POST /api/assignments - Tạo phân công thực tập mới
  static async createAssignment(req, res) {
    try {
      const {
        sinh_vien_id,
        doanh_nghiep_id,
        dot_thuc_tap_id,
        giang_vien_id,
        ngay_bat_dau,
        ngay_ket_thuc,
        trang_thai = 'chua-bat-dau'
      } = req.body;
      
      // Validate dữ liệu bắt buộc
      if (!sinh_vien_id || !doanh_nghiep_id || !dot_thuc_tap_id || !ngay_bat_dau || !ngay_ket_thuc) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng điền đầy đủ thông tin bắt buộc'
        });
      }
      
      // Kiểm tra sinh viên đã được phân công trong đợt này chưa
      const [existingAssignment] = await connection.query(
        'SELECT id FROM phan_cong_thuc_tap WHERE sinh_vien_id = ? AND dot_thuc_tap_id = ?',
        [sinh_vien_id, dot_thuc_tap_id]
      );
      
      if (existingAssignment) {
        return res.status(400).json({
          success: false,
          message: 'Sinh viên đã được phân công thực tập trong đợt này'
        });
      }
      
      const sql = `
        INSERT INTO phan_cong_thuc_tap 
        (sinh_vien_id, doanh_nghiep_id, dot_thuc_tap_id, giang_vien_id, ngay_bat_dau, ngay_ket_thuc, trang_thai)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const result = await connection.query(sql, [
        sinh_vien_id, doanh_nghiep_id, dot_thuc_tap_id, giang_vien_id, 
        ngay_bat_dau, ngay_ket_thuc, trang_thai
      ]);
      
      // Gửi thông báo
      await notifyAssignment({
        studentId: sinh_vien_id,
        teacherId: giang_vien_id || null,
        companyId: doanh_nghiep_id
      });
      
      res.status(201).json({
        success: true,
        message: 'Tạo phân công thực tập thành công',
        data: {
          id: result.insertId
        }
      });
      
    } catch (error) {
      console.error('❌ Create assignment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo phân công thực tập'
      });
    }
  }

  // PUT /api/assignments/:id - Cập nhật phân công thực tập
  static async updateAssignment(req, res) {
    try {
      const { id } = req.params;
      const {
        giang_vien_id,
        ngay_bat_dau,
        ngay_ket_thuc,
        trang_thai,
        diem_so,
        nhan_xet
      } = req.body;
      
      const sql = `
        UPDATE phan_cong_thuc_tap SET
          giang_vien_id = ?,
          ngay_bat_dau = ?,
          ngay_ket_thuc = ?,
          trang_thai = ?,
          diem_so = ?,
          nhan_xet = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const result = await connection.query(sql, [
        giang_vien_id, ngay_bat_dau, ngay_ket_thuc, trang_thai, diem_so, nhan_xet, id
      ]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy phân công thực tập'
        });
      }
      
      res.json({
        success: true,
        message: 'Cập nhật phân công thực tập thành công'
      });
      
    } catch (error) {
      console.error('❌ Update assignment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật phân công thực tập'
      });
    }
  }

  // DELETE /api/assignments/:id - Xóa phân công thực tập
  static async deleteAssignment(req, res) {
    try {
      const { id } = req.params;
      
      const result = await connection.query('DELETE FROM phan_cong_thuc_tap WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy phân công thực tập'
        });
      }
      
      res.json({
        success: true,
        message: 'Xóa phân công thực tập thành công'
      });
      
    } catch (error) {
      console.error('❌ Delete assignment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xóa phân công thực tập'
      });
    }
  }

  // POST /api/assignments/register - Sinh viên đăng ký thực tập
  static async registerInternship(req, res) {
    try {
      const { dot_thuc_tap_id, doanh_nghiep_id } = req.body;
      const sinh_vien_id = req.user.id; // Lấy từ token
      
      // Kiểm tra sinh viên đã đăng ký đợt này chưa
      const [existingRegistration] = await connection.query(
        'SELECT id FROM phan_cong_thuc_tap WHERE sinh_vien_id = ? AND dot_thuc_tap_id = ?',
        [sinh_vien_id, dot_thuc_tap_id]
      );
      
      if (existingRegistration) {
        return res.status(400).json({
          success: false,
          message: 'Bạn đã đăng ký thực tập trong đợt này rồi'
        });
      }
      
      // Lấy thông tin đợt thực tập
      const [batch] = await connection.query(
        'SELECT * FROM dot_thuc_tap WHERE id = ? AND trang_thai IN ("sap-mo", "dang-dien-ra")',
        [dot_thuc_tap_id]
      );
      
      if (!batch) {
        return res.status(400).json({
          success: false,
          message: 'Đợt thực tập không tồn tại hoặc đã đóng đăng ký'
        });
      }
      
      const sql = `
        INSERT INTO phan_cong_thuc_tap 
        (sinh_vien_id, doanh_nghiep_id, dot_thuc_tap_id, ngay_bat_dau, ngay_ket_thuc, trang_thai)
        VALUES (?, ?, ?, ?, ?, 'chua-bat-dau')
      `;
      
      const result = await connection.query(sql, [
        sinh_vien_id, doanh_nghiep_id, dot_thuc_tap_id, 
        batch.thoi_gian_bat_dau, batch.thoi_gian_ket_thuc
      ]);
      
      res.status(201).json({
        success: true,
        message: 'Đăng ký thực tập thành công',
        data: {
          id: result.insertId
        }
      });
      
    } catch (error) {
      console.error('❌ Register internship error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi đăng ký thực tập'
      });
    }
  }
}

// Helper function để gửi thông báo khi phân công
async function notifyAssignment({ studentId, teacherId, companyId }) {
  try {
    await ensureNotificationsTable();

    // Lấy thông tin sinh viên
    const [student] = await connection.query(
      'SELECT account_id, ho_ten, ma_sinh_vien FROM sinh_vien WHERE id = ? LIMIT 1',
      [studentId]
    );

    if (!student || !student.account_id) return;

    // Lấy thông tin công ty
    let companyName = 'Công ty';
    if (companyId) {
      const [company] = await connection.query(
        'SELECT ten_cong_ty FROM doanh_nghiep WHERE id = ? LIMIT 1',
        [companyId]
      );
      if (company) companyName = company.ten_cong_ty;
    }

    // Gửi thông báo cho sinh viên
    await createNotification(
      student.account_id,
      'Đã được phân công thực tập',
      `Bạn đã được phân công thực tập tại ${companyName}.`,
      'success',
      'assignment'
    );

    // Nếu có giảng viên, gửi thông báo cho giảng viên
    if (teacherId) {
      const [teacher] = await connection.query(
        'SELECT account_id, ho_ten FROM giang_vien WHERE id = ? LIMIT 1',
        [teacherId]
      );

      if (teacher && teacher.account_id) {
        const studentName = student.ho_ten || `Sinh viên ${student.ma_sinh_vien}`;
        await createNotification(
          teacher.account_id,
          'Có sinh viên được phân công',
          `Bạn được hướng dẫn ${studentName} thực tập tại ${companyName}.`,
          'info',
          'assignment'
        );
      }
    }
  } catch (error) {
    console.error('[notifyAssignment] Lỗi gửi thông báo:', error);
  }
}

module.exports = AssignmentsController;