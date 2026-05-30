const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const ProfileController = require('../controllers/ProfileController');
const { authenticateToken } = require('../middleware/auth');
const { body } = require('express-validator');
const connection = require('../database/connection');

const router = express.Router();

// ── Multer cho avatar ─────────────────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh (JPG, PNG, GIF, WEBP)'));
  }
});

// POST /api/profile/avatar
router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file ảnh' });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Xóa avatar cũ nếu có
    const old = await connection.query('SELECT avatar_url FROM accounts WHERE id = ?', [req.user.id]);
    if (old.length > 0 && old[0].avatar_url) {
      const oldPath = path.join(__dirname, '../..', old[0].avatar_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await connection.query('UPDATE accounts SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);

    return res.json({ success: true, message: 'Cập nhật ảnh đại diện thành công', data: { avatar_url: avatarUrl } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Lỗi server khi upload ảnh' });
  }
});

// DELETE /api/profile/avatar
router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const rows = await connection.query('SELECT avatar_url FROM accounts WHERE id = ?', [req.user.id]);
    if (rows.length > 0 && rows[0].avatar_url) {
      const filePath = path.join(__dirname, '../..', rows[0].avatar_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await connection.query('UPDATE accounts SET avatar_url = NULL WHERE id = ?', [req.user.id]);
    return res.json({ success: true, message: 'Đã xóa ảnh đại diện' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server khi xóa ảnh' });
  }
});

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