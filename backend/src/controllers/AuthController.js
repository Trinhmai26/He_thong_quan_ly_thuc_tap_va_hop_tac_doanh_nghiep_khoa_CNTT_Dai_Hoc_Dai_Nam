const Account = require('../models/Account');
const jwt = require('jsonwebtoken');

class AuthController {
  // Đăng nhập chung (tự động detect loại tài khoản)
  static async login(req, res) {
    try {
      const { userCode, password, role } = req.body;

      if (!userCode || !password) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập mã và mật khẩu'
        });
      }

      let authResult = null;
      let userInfo = null;
      const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : null;

      const buildSinhVienUserInfo = (result) => ({
        id: result.account.id,
        userId: result.account.userId,
        role: result.account.role,
        maSinhVien: result.sinhVien.maSinhVien,
        hoTen: result.sinhVien.hoTen
      });

      const buildGiangVienUserInfo = (result) => ({
        id: result.account.id,
        userId: result.account.userId,
        role: result.account.role,
        maGiangVien: result.giangVien.maGiangVien,
        hoTen: result.giangVien.hoTen
      });

      const buildDoanhNghiepUserInfo = (result) => ({
        id: result.account.id,
        userId: result.account.userId,
        role: result.account.role,
        maDoanhNghiep: result.doanhNghiep.maDoanhNghiep,
        tenDoanhNghiep: result.doanhNghiep.tenDoanhNghiep
      });

      const buildAdminUserInfo = (result) => ({
        id: result.id,
        userId: result.userId,
        role: result.role
      });

      // Nếu người dùng đã chọn role cụ thể từ UI → chỉ xác thực đúng role đó, không fallback
      if (normalizedRole === 'sinh-vien') {
        authResult = await Account.authenticateBySinhVien(userCode, password);
        if (authResult) userInfo = buildSinhVienUserInfo(authResult);
      } else if (normalizedRole === 'giang-vien') {
        authResult = await Account.authenticateByGiangVien(userCode, password);
        if (authResult) userInfo = buildGiangVienUserInfo(authResult);
      } else if (normalizedRole === 'doanh-nghiep') {
        authResult = await Account.authenticateByDoanhNghiep(userCode, password);
        if (authResult) userInfo = buildDoanhNghiepUserInfo(authResult);
      } else if (normalizedRole === 'admin') {
        authResult = await Account.authenticate(userCode, password, 'admin');
        if (authResult) userInfo = buildAdminUserInfo(authResult);
      } else {
        // Không chọn role → tự động nhận diện theo tiền tố mã
        if (userCode.toUpperCase().startsWith('SV')) {
          authResult = await Account.authenticateBySinhVien(userCode, password);
          if (authResult) userInfo = buildSinhVienUserInfo(authResult);
        } else if (userCode.toUpperCase().startsWith('GV')) {
          authResult = await Account.authenticateByGiangVien(userCode, password);
          if (authResult) userInfo = buildGiangVienUserInfo(authResult);
        } else if (userCode.toUpperCase().startsWith('DN')) {
          authResult = await Account.authenticateByDoanhNghiep(userCode, password);
          if (authResult) userInfo = buildDoanhNghiepUserInfo(authResult);
        }

        if (!authResult) {
          authResult = await Account.authenticateBySinhVien(userCode, password);
          if (authResult) userInfo = buildSinhVienUserInfo(authResult);
        }
        if (!authResult) {
          authResult = await Account.authenticateByGiangVien(userCode, password);
          if (authResult) userInfo = buildGiangVienUserInfo(authResult);
        }
        if (!authResult) {
          authResult = await Account.authenticateByDoanhNghiep(userCode, password);
          if (authResult) userInfo = buildDoanhNghiepUserInfo(authResult);
        }
        if (!authResult) {
          authResult = await Account.authenticate(userCode, password, 'admin');
          if (authResult) userInfo = buildAdminUserInfo(authResult);
        }
      }

      if (!authResult) {
        const roleLabel = normalizedRole === 'sinh-vien' ? 'sinh viên'
          : normalizedRole === 'giang-vien' ? 'giảng viên'
          : normalizedRole === 'doanh-nghiep' ? 'doanh nghiệp'
          : normalizedRole === 'admin' ? 'quản trị viên'
          : null;
        return res.status(401).json({
          success: false,
          message: roleLabel
            ? `Mã hoặc mật khẩu không đúng, hoặc tài khoản này không phải ${roleLabel}`
            : 'Mã đăng nhập hoặc mật khẩu không chính xác'
        });
      }

      // Tạo JWT token
      const token = jwt.sign(
        userInfo,
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          user: userInfo,
          token: token
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đăng nhập'
      });
    }
  }

  // Đăng nhập sinh viên (riêng biệt)
  static async loginSinhVien(req, res) {
    try {
      const { maSinhVien, password } = req.body;

      if (!maSinhVien || !password) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập mã sinh viên và mật khẩu'
        });
      }

      const authResult = await Account.authenticateBySinhVien(maSinhVien, password);

      if (!authResult) {
        return res.status(401).json({
          success: false,
          message: 'Mã sinh viên hoặc mật khẩu không chính xác'
        });
      }

      const userInfo = {
        id: authResult.account.id,
        userId: authResult.account.userId,
        role: authResult.account.role,
        maSinhVien: authResult.sinhVien.maSinhVien,
        hoTen: authResult.sinhVien.hoTen
      };

      // Tạo JWT token
      const token = jwt.sign(
        userInfo,
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        success: true,
        message: 'Đăng nhập sinh viên thành công',
        data: {
          user: userInfo,
          token: token
        }
      });

    } catch (error) {
      console.error('Sinh vien login error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đăng nhập sinh viên'
      });
    }
  }

  // Đăng nhập admin (riêng biệt)
  static async loginAdmin(req, res) {
    try {
      const { userId, password } = req.body;

      if (!userId || !password) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập tên người dùng và mật khẩu'
        });
      }

      // Kiểm tra định dạng tài khoản admin
      const cleanUserId = userId.trim().toLowerCase();
      if (!cleanUserId.includes('admin')) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ tài khoản admin mới được phép đăng nhập tại đây. Tài khoản phải chứa từ "admin"'
        });
      }

      // Xác thực admin bằng userId và password
      const authResult = await Account.authenticate(userId, password, 'admin');

      if (!authResult) {
        return res.status(401).json({
          success: false,
          message: 'Tài khoản admin hoặc mật khẩu không chính xác'
        });
      }

      // Kiểm tra lại role để đảm bảo thực sự là admin
      if (authResult.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản này không có quyền quản trị viên'
        });
      }

      const userInfo = {
        id: authResult.id,
        userId: authResult.userId,
        role: authResult.role
      };

      // Tạo JWT token
      const token = jwt.sign(
        userInfo,
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        success: true,
        message: 'Đăng nhập quản trị viên thành công',
        data: {
          user: userInfo,
          token: token
        }
      });

    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đăng nhập quản trị viên'
      });
    }
  }

  // Logout
  static async logout(req, res) {
    try {
      // Với JWT, logout chỉ cần client xóa token
      res.json({
        success: true,
        message: 'Đăng xuất thành công'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đăng xuất'
      });
    }
  }

  // Kiểm tra token và lấy thông tin user
  static async me(req, res) {
    try {
      // req.user được set bởi auth middleware
      res.json({
        success: true,
        data: req.user
      });
    } catch (error) {
      console.error('Get user info error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thông tin người dùng'
      });
    }
  }
}

module.exports = AuthController;