const express = require('express');
const router = express.Router();
const GiangVien = require('../models/GiangVien');
const SinhVien = require('../models/SinhVien');
const Account = require('../models/Account');
const db = require('../database/connection');
const GiangVienController = require('../controllers/GiangVienController');
const { authenticateToken, requireRole } = require('../middleware/auth');

function getLecturerCapacity(teacher) {
  const degreeText = `${teacher.hoc_vi || ''} ${teacher.bang_cap || ''} ${teacher.ho_ten || ''}`.toLowerCase();
  if (/\b(ts\.?|ti[eế]n\s*s[iĩ])\b/.test(degreeText)) {
    return 20;
  }
  if (/\b(ths\.?|th[aạ]c\s*s[iĩ])\b/.test(degreeText)) {
    return 15;
  }
  // Default fallback when degree is unknown.
  return 15;
}

function shuffleArray(arr) {
  const cloned = [...arr];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

// GET /api/giang-vien - Lấy danh sách giảng viên với phân trang
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    
    let result;
    if (search && search.trim()) {
      result = await GiangVien.search(search.trim(), parseInt(page), parseInt(limit));
    } else {
      result = await GiangVien.getAll(parseInt(page), parseInt(limit));
    }

    res.json({
      success: true,
      message: 'Lấy danh sách giảng viên thành công',
      data: {
        teachers: result.giangViens || [],
        pagination: result.pagination || {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0
        }
      }
    });
  } catch (error) {
    console.error('Error in GET /api/giang-vien:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy danh sách giảng viên'
    });
  }
});

// GET /api/giang-vien/stats - Thống kê giảng viên
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Tạm thời trả về stats cơ bản
    const allResult = await GiangVien.getAll(1, 1000);
    const stats = {
      total: allResult.pagination?.total || 0,
      byKhoa: {},
      byBoMon: {}
    };
    
    res.json({
      success: true,
      message: 'Lấy thống kê giảng viên thành công',
      data: stats
    });
  } catch (error) {
    console.error('Error in GET /api/giang-vien/stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thống kê giảng viên'
    });
  }
});

// POST /api/giang-vien - Tạo giảng viên mới (admin)
router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const maGiangVien = String(req.body?.ma_giang_vien || req.body?.maGiangVien || '').trim();
    const hoTen = String(req.body?.ho_ten || req.body?.hoTen || '').trim();
    const khoa = String(req.body?.khoa || 'CNTT').trim() || 'CNTT';
    const boMon = String(req.body?.bo_mon || req.body?.boMon || '').trim();
    const chucVu = String(req.body?.chuc_vu || req.body?.chucVu || '').trim();
    const hocVi = String(req.body?.hoc_vi || req.body?.hocVi || '').trim();
    const soDienThoai = String(req.body?.so_dien_thoai || req.body?.soDienThoai || '').trim();
    const emailCaNhan = String(req.body?.email_ca_nhan || req.body?.email || '').trim();
    const password = String(req.body?.password || '123456').trim() || '123456';

    if (!maGiangVien || !hoTen) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: mã giảng viên, họ tên'
      });
    }

    const existingTeacher = await db.query(
      `SELECT id FROM giang_vien WHERE LOWER(TRIM(ma_giang_vien)) = LOWER(TRIM(?)) LIMIT 1`,
      [maGiangVien]
    );

    if (existingTeacher && existingTeacher.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Mã giảng viên đã tồn tại'
      });
    }

    const accountEmail = emailCaNhan || `${maGiangVien.toLowerCase()}@dainam.edu.vn`;

    let account = await Account.findByUserId(maGiangVien);
    if (!account) {
      account = await Account.findByEmail(accountEmail);
    }

    let accountId;
    if (account) {
      accountId = Number(account.id);

      const occupied = await db.query(
        'SELECT id FROM giang_vien WHERE account_id = ? LIMIT 1',
        [accountId]
      );
      if (occupied && occupied.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Tài khoản đã được gắn với giảng viên khác'
        });
      }
    } else {
      const createdAccount = await Account.create({
        userId: maGiangVien,
        email: accountEmail,
        password,
        role: 'giang-vien'
      });
      accountId = Number(createdAccount.insertId);
    }

    const createResult = await GiangVien.create({
      accountId,
      maGiangVien,
      hoTen,
      khoa,
      boMon: boMon || null,
      chucVu: chucVu || null,
      hocVi: hocVi || null,
      soDienThoai: soDienThoai || null,
      emailCaNhan: emailCaNhan || null
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo giảng viên thành công',
      data: {
        id: createResult.insertId,
        ma_giang_vien: maGiangVien,
        ho_ten: hoTen,
        khoa,
        bo_mon: boMon || null,
        chuc_vu: chucVu || null,
        hoc_vi: hocVi || null,
        so_dien_thoai: soDienThoai || null,
        email_ca_nhan: emailCaNhan || null,
        account_email: accountEmail
      }
    });
  } catch (error) {
    console.error('Error in POST /api/giang-vien:', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Dữ liệu bị trùng (mã giảng viên hoặc email đã tồn tại)'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi tạo giảng viên'
    });
  }
});

// POST /api/giang-vien/auto-assign - Randomly assign lecturers for students without lecturer
router.post('/auto-assign', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const teachers = await db.query(`
      SELECT id, ma_giang_vien, ho_ten, hoc_vi, bang_cap
      FROM giang_vien
      WHERE COALESCE(TRIM(ho_ten), '') <> ''
      ORDER BY ho_ten
    `);

    if (!teachers || teachers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có giảng viên để phân công'
      });
    }

    const teacherLoads = await db.query(`
      SELECT LOWER(TRIM(giang_vien_huong_dan)) AS lecturer_name, COUNT(*) AS total
      FROM sinh_vien
      WHERE COALESCE(TRIM(giang_vien_huong_dan), '') <> ''
      GROUP BY LOWER(TRIM(giang_vien_huong_dan))
    `);

    const loadMap = new Map(
      teacherLoads.map((row) => [String(row.lecturer_name || ''), Number(row.total || 0)])
    );

    const teacherPools = teachers.map((teacher) => {
      const maxStudents = getLecturerCapacity(teacher);
      const currentLoad = loadMap.get(String(teacher.ho_ten || '').trim().toLowerCase()) || 0;
      return {
        ...teacher,
        maxStudents,
        currentLoad,
        remaining: Math.max(0, maxStudents - currentLoad)
      };
    });

    const students = await db.query(`
      SELECT id, ma_sinh_vien, ho_ten
      FROM sinh_vien
      WHERE COALESCE(TRIM(giang_vien_huong_dan), '') = ''
      ORDER BY id
    `);

    if (!students || students.length === 0) {
      return res.json({
        success: true,
        message: 'Không có sinh viên cần phân công giảng viên',
        data: {
          assigned: 0,
          unassigned: 0,
          studentsTotal: 0,
          teachersAvailable: teacherPools.length
        }
      });
    }

    const shuffledStudents = shuffleArray(students);
    let assignedCount = 0;

    for (const student of shuffledStudents) {
      const availableTeachers = teacherPools.filter((t) => t.remaining > 0);
      if (availableTeachers.length === 0) {
        break;
      }

      const pickedTeacher = availableTeachers[Math.floor(Math.random() * availableTeachers.length)];
      await db.query(
        `UPDATE sinh_vien
         SET giang_vien_huong_dan = ?, updated_at = NOW()
         WHERE id = ?`,
        [pickedTeacher.ho_ten, student.id]
      );

      pickedTeacher.remaining -= 1;
      pickedTeacher.currentLoad += 1;
      assignedCount += 1;
    }

    await SinhVien.recalcAssignmentStatus();

    const unassignedCount = students.length - assignedCount;
    res.json({
      success: true,
      message: `Đã phân công ngẫu nhiên ${assignedCount} sinh viên cho giảng viên`,
      data: {
        assigned: assignedCount,
        unassigned: unassignedCount,
        studentsTotal: students.length,
        teachersAvailable: teacherPools.length,
        capacity: {
          mastersMax: 15,
          doctorsMax: 20
        }
      }
    });
  } catch (error) {
    console.error('Error in POST /api/giang-vien/auto-assign:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi phân công giảng viên ngẫu nhiên'
    });
  }
});

// DELETE /api/giang-vien/clear-all - Xóa toàn bộ dữ liệu giảng viên để import lại
router.delete('/clear-all', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await db.transaction(async (connection) => {
      const [teacherCountRows] = await connection.query('SELECT COUNT(*) AS total FROM giang_vien');
      const totalTeachers = Number(teacherCountRows?.[0]?.total || 0);

      const [assignedRows] = await connection.query(
        `SELECT COUNT(*) AS total
         FROM sinh_vien
         WHERE COALESCE(TRIM(giang_vien_huong_dan), '') <> ''`
      );
      const totalAssignedStudents = Number(assignedRows?.[0]?.total || 0);

      await connection.query(
        `UPDATE sinh_vien
         SET giang_vien_huong_dan = NULL,
             updated_at = NOW()
         WHERE COALESCE(TRIM(giang_vien_huong_dan), '') <> ''`
      );

      // Bảng mapping phụ có thể tồn tại tùy phiên bản schema.
      try {
        await connection.query('DELETE FROM sinh_vien_huong_dan');
      } catch (error) {
        const message = String(error?.message || '');
        if (!message.includes("doesn't exist") && !message.includes('does not exist')) {
          throw error;
        }
      }

      await connection.query('DELETE FROM giang_vien');

      return {
        totalTeachers,
        totalAssignedStudents
      };
    });

    await SinhVien.recalcAssignmentStatus();

    res.json({
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu giảng viên thành công',
      data: result
    });
  } catch (error) {
    console.error('Error in DELETE /api/giang-vien/clear-all:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi xóa toàn bộ dữ liệu giảng viên'
    });
  }
});

// GET /api/giang-vien/export - Xuất Excel danh sách giảng viên với số lượng sinh viên hướng dẫn
router.get('/export', authenticateToken, GiangVienController.exportToExcel);

// GET /api/giang-vien/:id - Lấy thông tin giảng viên theo account ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await GiangVien.findByAccountId(id);
    
    if (result.success && result.data) {
      res.json({
        success: true,
        message: 'Lấy thông tin giảng viên thành công',
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message || 'Không tìm thấy giảng viên'
      });
    }
  } catch (error) {
    console.error('Error in GET /api/giang-vien/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thông tin giảng viên'
    });
  }
});

// PUT /api/giang-vien/:id - Cập nhật thông tin giảng viên
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await GiangVien.updateByAccountId(id, req.body);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || 'Cập nhật giảng viên thành công',
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message || 'Không tìm thấy giảng viên'
      });
    }
  } catch (error) {
    console.error('Error in PUT /api/giang-vien/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cập nhật giảng viên'
    });
  }
});

// DELETE /api/giang-vien/:id - Xóa giảng viên
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await GiangVien.delete(id);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || 'Xóa giảng viên thành công'
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message || 'Không tìm thấy giảng viên'
      });
    }
  } catch (error) {
    console.error('Error in DELETE /api/giang-vien/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi xóa giảng viên'
    });
  }
});

module.exports = router;