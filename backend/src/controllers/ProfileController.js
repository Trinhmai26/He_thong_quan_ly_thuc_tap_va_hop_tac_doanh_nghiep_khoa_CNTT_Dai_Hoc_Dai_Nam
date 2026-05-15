const connection = require('../database/connection');
const SinhVien = require('../models/SinhVien');
const GiangVien = require('../models/GiangVien');
const DoanhNghiep = require('../models/DoanhNghiep');
const Admin = require('../models/Admin');

class ProfileController {
  
  // GET /api/profile/me - Lấy thông tin profile của user hiện tại
  static async getMyProfile(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      
      console.log('🔍 Get profile request:', { userId, userRole });
      
      let profileData = null;
      
      // Lấy thông tin profile theo role
      switch (userRole) {
        case 'sinh-vien':
          const sinhvienResult = await SinhVien.findByAccountId(userId);
          if (sinhvienResult.success) {
            profileData = sinhvienResult.data;
          }
          break;
          
        case 'giang-vien':
          const giangvienResult = await GiangVien.findByAccountId(userId);
          if (giangvienResult.success) {
            profileData = giangvienResult.data;
          }
          break;
          
        case 'doanh-nghiep':
          const doanhNghiepResult = await DoanhNghiep.findByAccountId(userId);
          if (doanhNghiepResult.success) {
            profileData = doanhNghiepResult.data;
          }
          break;
          
        case 'admin':
          const adminResult = await Admin.findByAccountId(userId);
          if (adminResult.success) {
            profileData = adminResult.data;
          }
          break;
          
        default:
          return res.status(400).json({
            success: false,
            message: 'Vai trò không hợp lệ'
          });
      }
      
      // Lấy thông tin account cơ bản
      const accountQuery = `
        SELECT user_id, role, is_active, created_at, updated_at 
        FROM accounts 
        WHERE id = ?
      `;
      const accounts = await connection.query(accountQuery, [userId]);
      
      if (!accounts || accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài khoản'
        });
      }
      
      const account = accounts[0];

      // Normalize admin fields to consistent naming used by frontend
      if (userRole === 'admin' && profileData) {
        profileData.ho_ten = profileData.ho_ten || profileData.full_name || '';
        profileData.so_dien_thoai = profileData.so_dien_thoai || profileData.phone || '';
        profileData.chuc_vu = profileData.chuc_vu || profileData.position || '';
      }

      // Always merge email from accounts table into profileData
      const accountEmailRows = await connection.query('SELECT email FROM accounts WHERE id = ? LIMIT 1', [userId]);
      if (accountEmailRows && accountEmailRows.length > 0 && profileData) {
        profileData.email = profileData.email || accountEmailRows[0].email || '';
      }
      
      res.json({
        success: true,
        message: 'Lấy thông tin profile thành công',
        data: {
          account: account,
          profile: profileData,
          role: userRole
        }
      });
      
    } catch (error) {
      console.error('❌ Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thông tin profile'
      });
    }
  }
  
  // PUT /api/profile/me - Cập nhật thông tin profile của user hiện tại
  static async updateMyProfile(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const updateData = req.body;
      
      console.log('🔄 Update profile request:', { userId, userRole, updateData });
      
      let result = null;
      
      // Cập nhật profile theo role
      switch (userRole) {
        case 'sinh-vien':
          result = await SinhVien.updateByAccountId(userId, updateData);
          break;
          
        case 'giang-vien':
          result = await GiangVien.updateByAccountId(userId, updateData);
          break;
          
        case 'doanh-nghiep':
          result = await DoanhNghiep.updateByAccountId(userId, updateData);
          break;
          
        case 'admin':
          result = await Admin.updateByAccountId(userId, updateData);
          break;
          
        default:
          return res.status(400).json({
            success: false,
            message: 'Vai trò không hợp lệ'
          });
      }
      
      if (!result || !result.success) {
        return res.status(400).json({
          success: false,
          message: result?.message || 'Không thể cập nhật profile'
        });
      }
      
      console.log('✅ Profile updated successfully:', { userId, userRole });
      
      res.json({
        success: true,
        message: 'Cập nhật thông tin cá nhân thành công',
        data: result.data
      });
      
    } catch (error) {
      console.error('❌ Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi cập nhật profile'
      });
    }
  }
}

module.exports = ProfileController;