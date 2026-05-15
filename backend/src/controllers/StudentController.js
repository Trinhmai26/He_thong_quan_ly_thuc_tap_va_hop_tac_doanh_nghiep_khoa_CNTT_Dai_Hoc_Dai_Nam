const SinhVien = require('../models/SinhVien');
const Account = require('../models/Account');

class StudentController {
  // GET /api/students - Lấy danh sách sinh viên
  static async getAllStudents(req, res) {
    try {
      const { page = 1, limit = 10, search = '', status = '' } = req.query;
      
      const result = await SinhVien.getAllWithPagination(
        parseInt(page), 
        parseInt(limit), 
        search, 
        status
      );

      res.json({
        success: true,
        message: 'Lấy danh sách sinh viên thành công',
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/students/:id - Lấy thông tin chi tiết sinh viên
  static async getStudentById(req, res) {
    try {
      const { id } = req.params;
      const student = await StudentModel.getStudentById(id);

      res.json({
        success: true,
        message: 'Lấy thông tin sinh viên thành công',
        data: student
      });
    } catch (error) {
      const statusCode = error.message.includes('Không tìm thấy') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // POST /api/students - Tạo sinh viên mới
  static async createStudent(req, res) {
    try {
      const studentData = req.body;

      // Validate dữ liệu bắt buộc
      const requiredFields = ['ma_sv', 'ho_ten', 'email'];
      const missingFields = requiredFields.filter(field => !studentData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Thiếu thông tin bắt buộc: ${missingFields.join(', ')}`,
          data: null
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(studentData.email)) {
        return res.status(400).json({
          success: false,
          message: 'Email không đúng định dạng',
          data: null
        });
      }

      // Validate trạng thái thực tập
      const validStatuses = ['chua-dang-ky', 'da-dang-ky', 'dang-thuc-tap', 'hoan-thanh'];
      if (studentData.trang_thai_thuc_tap && !validStatuses.includes(studentData.trang_thai_thuc_tap)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái thực tập không hợp lệ',
          data: null
        });
      }

      const newStudent = await StudentModel.createStudent(studentData);

      res.status(201).json({
        success: true,
        message: 'Tạo sinh viên thành công',
        data: newStudent
      });
    } catch (error) {
      const statusCode = error.message.includes('đã tồn tại') ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // PUT /api/students/:id - Cập nhật thông tin sinh viên
  static async updateStudent(req, res) {
    try {
      const { id } = req.params;
      const studentData = req.body;

      // Validate email format nếu có
      if (studentData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(studentData.email)) {
          return res.status(400).json({
            success: false,
            message: 'Email không đúng định dạng',
            data: null
          });
        }
      }

      // Validate trạng thái thực tập nếu có
      const validStatuses = ['chua-dang-ky', 'da-dang-ky', 'dang-thuc-tap', 'hoan-thanh'];
      if (studentData.trang_thai_thuc_tap && !validStatuses.includes(studentData.trang_thai_thuc_tap)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái thực tập không hợp lệ',
          data: null
        });
      }

      const updatedStudent = await StudentModel.updateStudent(id, studentData);

      res.json({
        success: true,
        message: 'Cập nhật sinh viên thành công',
        data: updatedStudent
      });
    } catch (error) {
      let statusCode = 500;
      if (error.message.includes('Không tìm thấy')) {
        statusCode = 404;
      } else if (error.message.includes('đã tồn tại')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // DELETE /api/students/:id - Xóa sinh viên
  static async deleteStudent(req, res) {
    try {
      const { id } = req.params;
      const result = await StudentModel.deleteStudent(id);

      res.json({
        success: true,
        message: result.message,
        data: null
      });
    } catch (error) {
      let statusCode = 500;
      if (error.message.includes('Không tìm thấy')) {
        statusCode = 404;
      } else if (error.message.includes('Không thể xóa')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/students/statistics - Thống kê sinh viên
  static async getStudentStatistics(req, res) {
    try {
      const statistics = await StudentModel.getStudentStatistics();

      res.json({
        success: true,
        message: 'Lấy thống kê sinh viên thành công',
        data: statistics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/students/by-teacher/:teacherId - Lấy danh sách sinh viên theo giảng viên
  static async getStudentsByTeacher(req, res) {
    try {
      const { teacherId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const result = await StudentModel.getStudentsByTeacher(
        teacherId,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        message: 'Lấy danh sách sinh viên theo giảng viên thành công',
        data: result.students,
        pagination: result.pagination
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // PATCH /api/students/:id/status - Cập nhật trạng thái thực tập
  static async updateStudentStatus(req, res) {
    try {
      const { id } = req.params;
      const { trang_thai_thuc_tap } = req.body;

      if (!trang_thai_thuc_tap) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin trạng thái thực tập',
          data: null
        });
      }

      const validStatuses = ['chua-dang-ky', 'da-dang-ky', 'dang-thuc-tap', 'hoan-thanh'];
      if (!validStatuses.includes(trang_thai_thuc_tap)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái thực tập không hợp lệ',
          data: null
        });
      }

      const updatedStudent = await StudentModel.updateStudent(id, { trang_thai_thuc_tap });

      res.json({
        success: true,
        message: 'Cập nhật trạng thái thực tập thành công',
        data: updatedStudent
      });
    } catch (error) {
      const statusCode = error.message.includes('Không tìm thấy') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // POST /api/students/batch-import - Import danh sách sinh viên từ file Excel
  static async batchImportStudents(req, res) {
    try {
      // Logic import từ file Excel sẽ được implement sau
      res.json({
        success: true,
        message: 'Tính năng import batch đang được phát triển',
        data: null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // POST /api/students/register-internship - Đăng ký thực tập
  static async registerInternship(req, res) {
    try {
      const userId = req.user?.userId;
      const {
        nguyen_vong_thuc_tap,
        vi_tri_muon_ung_tuyen_thuc_tap,
        don_vi_thuc_tap,
        cong_ty_tu_lien_he,
        dia_chi_cong_ty,
        nguoi_lien_he_cong_ty,
        sdt_nguoi_lien_he,
        so_dien_thoai,
        email_ca_nhan,
        dia_chi
      } = req.body;

      // Validate required fields
      if (!nguyen_vong_thuc_tap || !vi_tri_muon_ung_tuyen_thuc_tap) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng điền đầy đủ thông tin nguyện vọng thực tập và vị trí mong muốn',
          data: null
        });
      }

      // If student chooses 'tu_lien_he', validate company info
      if (nguyen_vong_thuc_tap === 'tu_lien_he') {
        if (!cong_ty_tu_lien_he || !dia_chi_cong_ty || !nguoi_lien_he_cong_ty || !sdt_nguoi_lien_he) {
          return res.status(400).json({
            success: false,
            message: 'Khi chọn tự liên hệ, vui lòng điền đầy đủ thông tin công ty',
            data: null
          });
        }
      }

      // Get current student data to check if already registered (batch 1)
      const currentStudent = await SinhVien.getByUserId(userId);
      const isSecondTimeRegistration = 
        currentStudent && 
        currentStudent.don_vi_thuc_tap && 
        currentStudent.vi_tri_muon_ung_tuyen_thuc_tap && 
        currentStudent.nguyen_vong_thuc_tap;

      // Prepare update data
      let updateData = {
        so_dien_thoai,
        email_ca_nhan,
        dia_chi
      };

      if (isSecondTimeRegistration) {
        // Second registration: only allow changing vị trí, công ty, thông tin cá nhân, and CV
        console.log('[registerInternship] Second-time registration detected - allowing only permitted fields to change');
        updateData = {
          ...updateData,
          vi_tri_muon_ung_tuyen_thuc_tap,
          don_vi_thuc_tap: nguyen_vong_thuc_tap === 'tu_lien_he' ? cong_ty_tu_lien_he : don_vi_thuc_tap,
          cong_ty_tu_lien_he: nguyen_vong_thuc_tap === 'tu_lien_he' ? cong_ty_tu_lien_he : null,
          dia_chi_cong_ty: nguyen_vong_thuc_tap === 'tu_lien_he' ? dia_chi_cong_ty : null,
          nguoi_lien_he_cong_ty: nguyen_vong_thuc_tap === 'tu_lien_he' ? nguoi_lien_he_cong_ty : null,
          sdt_nguoi_lien_he: nguyen_vong_thuc_tap === 'tu_lien_he' ? sdt_nguoi_lien_he : null
          // Note: nguyen_vong_thuc_tap is NOT updated to keep original preference
        };
      } else {
        // First registration: allow all fields
        console.log('[registerInternship] First-time registration - allowing all fields');
        updateData = {
          ...updateData,
          nguyen_vong_thuc_tap,
          vi_tri_muon_ung_tuyen_thuc_tap,
          don_vi_thuc_tap: nguyen_vong_thuc_tap === 'tu_lien_he' ? cong_ty_tu_lien_he : don_vi_thuc_tap,
          cong_ty_tu_lien_he: nguyen_vong_thuc_tap === 'tu_lien_he' ? cong_ty_tu_lien_he : null,
          dia_chi_cong_ty: nguyen_vong_thuc_tap === 'tu_lien_he' ? dia_chi_cong_ty : null,
          nguoi_lien_he_cong_ty: nguyen_vong_thuc_tap === 'tu_lien_he' ? nguoi_lien_he_cong_ty : null,
          sdt_nguoi_lien_he: nguyen_vong_thuc_tap === 'tu_lien_he' ? sdt_nguoi_lien_he : null
        };
      }

      // Update student record
      const result = await SinhVien.updateInternshipRegistration(userId, updateData);

      res.json({
        success: true,
        message: isSecondTimeRegistration 
          ? 'Cập nhật thông tin đăng ký thực tập đợt 2 thành công (thông tin cơ bản được giữ từ đợt 1)' 
          : 'Đăng ký thực tập thành công',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/students/my-registration - Lấy thông tin đăng ký thực tập của sinh viên
  static async getMyRegistration(req, res) {
    try {
      const userId = req.user?.userId;
      const student = await SinhVien.getByUserId(userId);

      res.json({
        success: true,
        message: 'Lấy thông tin đăng ký thành công',
        data: student
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }
}

module.exports = StudentController;