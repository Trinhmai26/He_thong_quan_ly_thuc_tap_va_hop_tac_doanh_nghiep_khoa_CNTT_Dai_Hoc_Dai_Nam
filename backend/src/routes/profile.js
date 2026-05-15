const express = require('express');
const ProfileController = require('../controllers/ProfileController');
const { authenticateToken } = require('../middleware/auth');
const { body } = require('express-validator');

const router = express.Router();

/**
 * @route   GET /api/profile/me
 * @desc    Lấy thông tin profile của user hiện tại
 * @access  Private
 */
router.get('/me', authenticateToken, ProfileController.getMyProfile);

/**
 * @route   PUT /api/profile/me
 * @desc    Cập nhật thông tin profile của user hiện tại
 * @access  Private
 */
router.put('/me', [
  authenticateToken,
  
  // Validation cho các trường common
  body('ho_ten')
    .optional()
    .isLength({ min: 2, max: 255 })
    .withMessage('Họ tên phải từ 2-255 ký tự'),
  
  body('email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email không hợp lệ')
    .normalizeEmail(),
  
  body('so_dien_thoai')
    .optional()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Số điện thoại phải từ 10-11 chữ số'),
  
  body('dia_chi')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Địa chỉ không được quá 500 ký tự'),
  
  // Validation cho sinh viên
  body('ma_sinh_vien')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Mã sinh viên không được quá 20 ký tự'),
  
  body('lop')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Lớp không được quá 50 ký tự'),
  
  body('khoa')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Khoa không được quá 100 ký tự'),
  
  body('nganh_hoc')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Ngành học không được quá 100 ký tự'),
  
  // Validation cho giảng viên
  body('ma_giang_vien')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Mã giảng viên không được quá 20 ký tự'),
  
  body('bo_mon')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Bộ môn không được quá 100 ký tự'),
  
  body('hoc_vi')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Học vị không được quá 50 ký tự'),
  
  body('chuyen_mon')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Chuyên môn không được quá 200 ký tự'),
  
  // Validation cho doanh nghiệp
  body('ten_cong_ty')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Tên công ty không được quá 255 ký tự'),
  
  body('dia_chi_cong_ty')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Địa chỉ công ty không được quá 500 ký tự'),
  
  body('so_dien_thoai_cong_ty')
    .optional()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Số điện thoại công ty phải từ 10-11 chữ số'),
  
  body('email_cong_ty')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Email công ty không hợp lệ')
    .normalizeEmail(),
  
  body('website')
    .optional()
    .isURL()
    .withMessage('Website không hợp lệ'),
  
  body('linh_vuc_hoat_dong')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Lĩnh vực hoạt động không được quá 200 ký tự'),
  
  body('so_nhan_vien')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Số nhân viên phải là số nguyên dương'),
  
  body('mo_ta')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Mô tả không được quá 1000 ký tự'),
  
  // Validation cho admin
  body('chuc_vu')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Chức vụ không được quá 100 ký tự'),
  
  body('phong_ban')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Phòng ban không được quá 100 ký tự')
    
], ProfileController.updateMyProfile);

module.exports = router;