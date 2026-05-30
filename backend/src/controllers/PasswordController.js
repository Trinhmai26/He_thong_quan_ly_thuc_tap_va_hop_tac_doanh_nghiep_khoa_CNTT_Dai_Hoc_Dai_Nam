const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const connection = require('../database/connection');

// ── Nodemailer transporter ────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
  });
}

async function sendResetEmail(toEmail, resetCode, recipientName) {
  const transporter = createTransporter();
  const senderName = 'Khoa CNTT - ĐH Đại Nam';
  const senderEmail = process.env.EMAIL_USER;

  await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to: toEmail,
    subject: '[Hệ thống Quản lý Thực tập] Mã xác minh đặt lại mật khẩu',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="color: #1d4ed8; margin-bottom: 8px;">Đặt lại mật khẩu</h2>
        <p style="color: #374151;">Xin chào <strong>${recipientName || 'bạn'}</strong>,</p>
        <p style="color: #374151;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p style="color: #374151;">Mã xác minh của bạn là:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1d4ed8; background: #eff6ff; padding: 16px 32px; border-radius: 8px; border: 2px dashed #93c5fd;">
            ${resetCode}
          </span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Mã này có hiệu lực trong <strong>10 phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">Hệ thống Quản lý Thực tập - Khoa CNTT - ĐH Đại Nam</p>
      </div>
    `
  });
}

class PasswordController {
  
  // POST /api/password/change - Đổi mật khẩu
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      console.log('🔐 Change password request:', { userId, userRole });
      
      // Validate input
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới'
        });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
        });
      }
      
      // Lấy thông tin tài khoản hiện tại
      const accounts = await connection.query(
        'SELECT id, password_hash FROM accounts WHERE id = ?',
        [userId]
      );
      
      console.log('🔍 Accounts query result:', accounts);
      
      if (!accounts || accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài khoản'
        });
      }
      
      const account = accounts[0];
      
      // Kiểm tra mật khẩu hiện tại
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, account.password_hash);
      
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu hiện tại không đúng'
        });
      }
      
      // Mã hóa mật khẩu mới
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      // Cập nhật mật khẩu trong bảng accounts
      await connection.query(
        'UPDATE accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedNewPassword, userId]
      );
      
      console.log('✅ Password updated successfully for user:', userId);
      
      console.log('✅ Password changed successfully for user:', userId);
      
      res.json({
        success: true,
        message: 'Đổi mật khẩu thành công'
      });
      
    } catch (error) {
      console.error('❌ Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đổi mật khẩu'
      });
    }
  }
  
  // POST /api/password/forgot - Quên mật khẩu (tạo mật khẩu tạm thời)
  static async forgotPassword(req, res) {
    try {
      const { identifier, role } = req.body; // identifier có thể là email, mã sinh viên, mã giảng viên, mã doanh nghiệp
      
      console.log('🔄 Forgot password request:', { identifier, role });
      
      if (!identifier || !role) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập đầy đủ thông tin'
        });
      }
      
      let account = null;
      let userInfo = null;
      
      // Tìm tài khoản theo role
      if (role === 'sinh-vien') {
        const [sinhViens] = await connection.query(`
          SELECT a.id, a.email, sv.ma_sinh_vien, sv.ho_ten 
          FROM accounts a
          INNER JOIN sinh_vien sv ON a.id = sv.account_id
          WHERE (sv.ma_sinh_vien = ? OR a.email = ?) AND a.role = 'sinh-vien'
        `, [identifier, identifier]);
        
        if (sinhViens.length > 0) {
          account = sinhViens[0];
          userInfo = { type: 'sinh-vien', code: account.ma_sinh_vien, name: account.ho_ten };
        }
      } else if (role === 'giang-vien') {
        const [giangViens] = await connection.query(`
          SELECT a.id, a.email, gv.ma_giang_vien, gv.ho_ten 
          FROM accounts a
          INNER JOIN giang_vien gv ON a.id = gv.account_id
          WHERE (gv.ma_giang_vien = ? OR a.email = ?) AND a.role = 'giang-vien'
        `, [identifier, identifier]);
        
        if (giangViens.length > 0) {
          account = giangViens[0];
          userInfo = { type: 'giang-vien', code: account.ma_giang_vien, name: account.ho_ten };
        }
      } else if (role === 'doanh-nghiep') {
        const [doanhNghieps] = await connection.query(`
          SELECT a.id, a.email, dn.ma_doanh_nghiep, dn.ten_cong_ty 
          FROM accounts a
          INNER JOIN doanh_nghiep dn ON a.id = dn.account_id
          WHERE (dn.ma_doanh_nghiep = ? OR a.email = ?) AND a.role = 'doanh-nghiep'
        `, [identifier, identifier]);
        
        if (doanhNghieps.length > 0) {
          account = doanhNghieps[0];
          userInfo = { type: 'doanh-nghiep', code: account.ma_doanh_nghiep, name: account.ten_cong_ty };
        }
      }
      
      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài khoản với thông tin đã nhập'
        });
      }
      
      // Tạo mật khẩu tạm thời (6 ký tự ngẫu nhiên)
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedTempPassword = await bcrypt.hash(tempPassword, 10);
      
      // Cập nhật mật khẩu tạm thời
      await connection.query(
        'UPDATE accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedTempPassword, account.id]
      );
      
      // Cập nhật trong bảng tương ứng
      if (role === 'sinh-vien') {
        await connection.query(
          'UPDATE sinh_vien SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
          [hashedTempPassword, account.id]
        );
      } else if (role === 'giang-vien') {
        await connection.query(
          'UPDATE giang_vien SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
          [hashedTempPassword, account.id]
        );
      } else if (role === 'doanh-nghiep') {
        await connection.query(
          'UPDATE doanh_nghiep SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
          [hashedTempPassword, account.id]
        );
      }
      
      console.log('✅ Temporary password generated for:', userInfo.code);
      
      res.json({
        success: true,
        message: 'Đã tạo mật khẩu tạm thời thành công',
        data: {
          tempPassword,
          userInfo,
          note: 'Vui lòng đăng nhập và đổi mật khẩu ngay sau khi sử dụng mật khẩu tạm thời này'
        }
      });
      
    } catch (error) {
      console.error('❌ Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi tạo mật khẩu tạm thời'
      });
    }
  }

  // POST /api/password/send-reset-code - Gửi mã xác minh qua email
  static async sendResetCode(req, res) {
    try {
      const { email } = req.body;
      
      console.log('🔐 Send reset code request:', { email });
      
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập địa chỉ email'
        });
      }

      // Kiểm tra email có tồn tại trong hệ thống không - tìm trong tất cả bảng profile
      let foundAccount = null;
      
      // Tìm trong bảng sinh viên
      const sinhVienAccounts = await connection.query(`
        SELECT a.id, a.user_id, a.role, sv.email_ca_nhan, sv.ho_ten
        FROM accounts a 
        INNER JOIN sinh_vien sv ON a.id = sv.account_id 
        WHERE sv.email_ca_nhan = ? OR a.user_id = ?
      `, [email, email]);
      
      if (sinhVienAccounts && sinhVienAccounts.length > 0) {
        foundAccount = sinhVienAccounts[0];
      }
      
      // Tìm trong bảng giảng viên (email_ca_nhan)
      if (!foundAccount) {
        const giangVienAccounts = await connection.query(`
          SELECT a.id, a.user_id, a.role, gv.email_ca_nhan AS email, gv.ho_ten
          FROM accounts a
          INNER JOIN giang_vien gv ON a.id = gv.account_id
          WHERE gv.email_ca_nhan = ? OR a.email = ? OR a.user_id = ?
        `, [email, email, email]);

        if (giangVienAccounts && giangVienAccounts.length > 0) {
          foundAccount = giangVienAccounts[0];
        }
      }

      // Tìm trong bảng doanh nghiệp
      if (!foundAccount) {
        const doanhNghiepAccounts = await connection.query(`
          SELECT a.id, a.user_id, a.role, dn.email_cong_ty AS email, dn.ten_cong_ty AS ho_ten
          FROM accounts a
          INNER JOIN doanh_nghiep dn ON a.id = dn.account_id
          WHERE dn.email_cong_ty = ? OR a.email = ? OR a.user_id = ?
        `, [email, email, email]);

        if (doanhNghiepAccounts && doanhNghiepAccounts.length > 0) {
          foundAccount = doanhNghiepAccounts[0];
        }
      }

      // Tìm trong bảng admin (admin không có email riêng → dùng accounts.email)
      if (!foundAccount) {
        const adminAccounts = await connection.query(`
          SELECT a.id, a.user_id, a.role, a.email, ad.full_name AS ho_ten
          FROM accounts a
          INNER JOIN admin ad ON a.id = ad.account_id
          WHERE a.email = ? OR a.user_id = ?
        `, [email, email]);

        if (adminAccounts && adminAccounts.length > 0) {
          foundAccount = adminAccounts[0];
        }
      }

      // Tìm trực tiếp qua accounts.email (fallback)
      if (!foundAccount) {
        const directAccounts = await connection.query(
          'SELECT id, user_id, role, email FROM accounts WHERE email = ? OR user_id = ?',
          [email, email]
        );
        if (directAccounts && directAccounts.length > 0) {
          foundAccount = directAccounts[0];
        }
      }

      if (!foundAccount) {
        return res.status(404).json({
          success: false,
          message: 'Email không tồn tại trong hệ thống'
        });
      }

      // Tạo mã xác minh 6 số
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút

      // Lưu mã xác minh vào database
      await connection.query(`
        INSERT INTO doi_mat_khau (email, code, expires_at, created_at) 
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
        code = VALUES(code), 
        expires_at = VALUES(expires_at), 
        created_at = NOW(), 
        used = 0
      `, [email, resetCode, expiresAt]);

      console.log('✅ Reset code generated:', { email, code: resetCode });

      // Gửi email thật qua nodemailer
      const recipientName = foundAccount.ho_ten || foundAccount.ten_cong_ty || '';
      const toEmail = foundAccount.email_ca_nhan || foundAccount.email_cong_ty || email;
      try {
        await sendResetEmail(toEmail, resetCode, recipientName);
        console.log(`📧 Reset email sent to ${toEmail}`);
      } catch (emailErr) {
        console.error('❌ Email send error:', emailErr.message);
        return res.status(500).json({
          success: false,
          message: `Không thể gửi email xác minh: ${emailErr.message}. Vui lòng kiểm tra cấu hình email trong .env`
        });
      }

      res.json({
        success: true,
        message: `Mã xác minh đã được gửi đến ${toEmail}`,
        data: { email, expiresAt }
      });

    } catch (error) {
      console.error('❌ Send reset code error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi gửi mã xác minh'
      });
    }
  }

  // POST /api/password/verify-reset-code - Xác minh mã reset
  static async verifyResetCode(req, res) {
    try {
      const { email, code } = req.body;
      
      console.log('🔍 Verify reset code request:', { email, code });
      
      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập email và mã xác minh'
        });
      }

      // Kiểm tra mã xác minh
      const resetCodes = await connection.query(`
        SELECT * FROM doi_mat_khau 
        WHERE email = ? AND code = ? AND expires_at > NOW() AND used = 0
        ORDER BY created_at DESC LIMIT 1
      `, [email, code]);

      if (!resetCodes || resetCodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Mã xác minh không chính xác hoặc đã hết hạn'
        });
      }

      console.log('✅ Reset code verified:', { email, code });

      res.json({
        success: true,
        message: 'Mã xác minh chính xác',
        data: {
          email,
          verified: true
        }
      });

    } catch (error) {
      console.error('❌ Verify reset code error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi xác minh mã'
      });
    }
  }

  // POST /api/password/reset-password - Đặt lại mật khẩu
  static async resetPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;
      
      console.log('🔄 Reset password request:', { email, code, newPasswordLength: newPassword?.length });
      
      if (!email || !code || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập đầy đủ thông tin'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu phải có ít nhất 6 ký tự'
        });
      }

      // Kiểm tra mã xác minh một lần nữa
      const resetCodes = await connection.query(`
        SELECT * FROM doi_mat_khau 
        WHERE email = ? AND code = ? AND expires_at > NOW() AND used = 0
        ORDER BY created_at DESC LIMIT 1
      `, [email, code]);

      if (!resetCodes || resetCodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Mã xác minh không hợp lệ'
        });
      }

      // Tìm tài khoản người dùng - tìm trong tất cả bảng profile
      let foundAccount = null;
      
      // Tìm trong bảng sinh viên
      const sinhVienAccounts = await connection.query(`
        SELECT a.id, a.user_id, a.role
        FROM accounts a 
        INNER JOIN sinh_vien sv ON a.id = sv.account_id 
        WHERE sv.email_ca_nhan = ? OR a.user_id = ?
      `, [email, email]);
      
      if (sinhVienAccounts && sinhVienAccounts.length > 0) {
        foundAccount = sinhVienAccounts[0];
      }
      
      // Tìm trong bảng giảng viên
      if (!foundAccount) {
        const giangVienAccounts = await connection.query(`
          SELECT a.id, a.user_id, a.role
          FROM accounts a
          INNER JOIN giang_vien gv ON a.id = gv.account_id
          WHERE gv.email_ca_nhan = ? OR a.email = ? OR a.user_id = ?
        `, [email, email, email]);

        if (giangVienAccounts && giangVienAccounts.length > 0) {
          foundAccount = giangVienAccounts[0];
        }
      }

      // Tìm trong bảng doanh nghiệp
      if (!foundAccount) {
        const doanhNghiepAccounts = await connection.query(`
          SELECT a.id, a.user_id, a.role
          FROM accounts a
          INNER JOIN doanh_nghiep dn ON a.id = dn.account_id
          WHERE dn.email_cong_ty = ? OR a.email = ? OR a.user_id = ?
        `, [email, email, email]);

        if (doanhNghiepAccounts && doanhNghiepAccounts.length > 0) {
          foundAccount = doanhNghiepAccounts[0];
        }
      }

      // Tìm trong bảng admin
      if (!foundAccount) {
        const adminAccounts = await connection.query(`
          SELECT a.id, a.user_id, a.role
          FROM accounts a
          INNER JOIN admin ad ON a.id = ad.account_id
          WHERE a.email = ? OR a.user_id = ?
        `, [email, email]);

        if (adminAccounts && adminAccounts.length > 0) {
          foundAccount = adminAccounts[0];
        }
      }

      // Fallback: tìm trực tiếp qua accounts.email
      if (!foundAccount) {
        const directAccounts = await connection.query(
          'SELECT id, user_id, role FROM accounts WHERE email = ? OR user_id = ?',
          [email, email]
        );
        if (directAccounts && directAccounts.length > 0) {
          foundAccount = directAccounts[0];
        }
      }

      if (!foundAccount) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài khoản'
        });
      }

      const account = foundAccount;

      // Hash mật khẩu mới
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Cập nhật mật khẩu
      await connection.query(
        'UPDATE accounts SET password_hash = ?, updated_at = NOW() WHERE id = ?',
        [hashedPassword, account.id]
      );

      // Đánh dấu mã xác minh đã sử dụng
      await connection.query(
        'UPDATE doi_mat_khau SET used = 1 WHERE email = ? AND code = ?',
        [email, code]
      );

      console.log('✅ Password reset successful:', { email, userId: account.user_id });

      res.json({
        success: true,
        message: 'Mật khẩu đã được đặt lại thành công',
        data: {
          email,
          userId: account.user_id,
          updatedAt: new Date()
        }
      });

    } catch (error) {
      console.error('❌ Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đặt lại mật khẩu'
      });
    }
  }
}

module.exports = PasswordController;
