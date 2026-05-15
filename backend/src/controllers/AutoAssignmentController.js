/**
 * Controller: Auto Assignment
 * Phân công tự động Giảng viên và Doanh nghiệp cho sinh viên
 */

const SinhVien = require('../models/SinhVien');
const GiangVien = require('../models/GiangVien');
const DoanhNghiep = require('../models/DoanhNghiep');
const db = require('../database/connection');
const { createNotification, ensureNotificationsTable } = require('../utils/notificationHelper');

class AutoAssignmentController {
  
  /**
   * POST /api/auto-assignment
   * Phân công tự động cả GV và DN cho sinh viên chưa phân công
   */
  static async autoAssign(req, res) {
    try {
      console.log('🤖 Bắt đầu phân công tự động...');
      
      const results = {
        teachers: { assigned: 0, skipped: 0, errors: [] },
        companies: { assigned: 0, skipped: 0, errors: [] },
        totalStudents: 0
      };

      // ======== BƯỚC 1: LẤY DANH SÁCH ========
      
      // Lấy tất cả sinh viên chưa phân công đầy đủ
      const studentsQuery = `
        SELECT sv.*, svhd.ma_giang_vien, svhd.doanh_nghiep_thuc_tap, svhd.vi_tri_thuc_tap
        FROM sinh_vien sv
        LEFT JOIN sinh_vien_huong_dan svhd ON sv.ma_sinh_vien = svhd.ma_sinh_vien
        WHERE sv.id IS NOT NULL
        ORDER BY sv.id
      `;
      
      const students = await db.query(studentsQuery);
      console.log(`📋 Tổng số sinh viên: ${students.length}`);
      
      if (students.length === 0) {
        return res.json({
          success: true,
          message: 'Không có sinh viên nào cần phân công',
          data: results
        });
      }

      results.totalStudents = students.length;

      // Lấy danh sách giảng viên
      const teachersResult = await GiangVien.getAll(1, 1000);
      const teachers = teachersResult.giangViens || [];
      console.log(`👨‍🏫 Tổng số giảng viên: ${teachers.length}`);

      if (teachers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có giảng viên nào trong hệ thống. Vui lòng thêm giảng viên trước.'
        });
      }

      // Lấy danh sách doanh nghiệp
      const companiesResult = await DoanhNghiep.getAll(1, 1000);
      const companies = companiesResult.doanhNghieps || [];
      console.log(`🏢 Tổng số doanh nghiệp: ${companies.length}`);

      if (companies.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có doanh nghiệp nào trong hệ thống. Vui lòng thêm doanh nghiệp trước.'
        });
      }

      // ======== BƯỚC 2: PHÂN CÔNG GIẢNG VIÊN ========
      
      console.log('\n👨‍🏫 Phân công giảng viên...');
      
      // Đếm số sinh viên hiện tại của mỗi giảng viên
      const teacherStudentCount = {};
      teachers.forEach(t => {
        const maGV = t.maGiangVien || t.ma_giang_vien;
        teacherStudentCount[maGV] = 0;
      });

      for (const student of students) {
        if (student.ma_giang_vien) {
          const maGV = student.ma_giang_vien;
          if (teacherStudentCount[maGV] !== undefined) {
            teacherStudentCount[maGV]++;
          }
        }
      }

      // Phân công GV cho sinh viên chưa có GV
      for (const student of students) {
        if (student.ma_giang_vien) {
          results.teachers.skipped++;
          continue;
        }

        try {
          // Tìm giảng viên có ít sinh viên nhất
          const sortedTeachers = teachers
            .map(t => ({
              ma: t.maGiangVien || t.ma_giang_vien,
              ten: t.hoTen || t.ho_ten,
              count: teacherStudentCount[t.maGiangVien || t.ma_giang_vien] || 0
            }))
            .sort((a, b) => a.count - b.count);

          const selectedTeacher = sortedTeachers[0];

          // Cập nhật sinh viên
          const updateQuery = `
            UPDATE sinh_vien_huong_dan 
            SET ma_giang_vien = ?, ten_giang_vien = ?
            WHERE ma_sinh_vien = ?
          `;
          
          await db.query(updateQuery, [selectedTeacher.ma, selectedTeacher.ten, student.ma_sinh_vien]);
          
          teacherStudentCount[selectedTeacher.ma]++;
          results.teachers.assigned++;
          
          console.log(`  ✅ SV ${student.ma_sinh_vien} → GV ${selectedTeacher.ma} (${selectedTeacher.ten}) - Tổng: ${teacherStudentCount[selectedTeacher.ma]}`);
          
          // Gửi thông báo cho sinh viên
          if (student.id && student.account_id) {
            await createNotification(
              student.account_id,
              'Đã phân công giảng viên hướng dẫn',
              `Bạn đã được phân công giảng viên hướng dẫn: ${selectedTeacher.ten}.`,
              'success',
              'assignment'
            ).catch(err => console.error(`  ⚠️ Lỗi gửi thông báo cho SV ${student.ma_sinh_vien}:`, err.message));
          }
          
        } catch (error) {
          console.error(`  ❌ Lỗi phân công GV cho SV ${student.ma_sinh_vien}:`, error.message);
          results.teachers.errors.push({
            studentId: student.ma_sinh_vien,
            error: error.message
          });
        }
      }

      // ======== BƯỚC 3: PHÂN CÔNG DOANH NGHIỆP ========
      
      console.log('\n🏢 Phân công doanh nghiệp...');
      
      // Map doanh nghiệp theo lĩnh vực và vị trí
      const companyMap = {};
      companies.forEach(company => {
        const linhVuc = (company.linhVucHoatDong || company.linh_vuc_hoat_dong || '').toLowerCase().trim();
        const viTri = (company.viTriTuyenDung || company.vi_tri_tuyen_dung || '').toLowerCase().trim();
        const tenCongTy = company.tenCongTy || company.ten_cong_ty;
        const soLuongNhan = parseInt(company.soLuongNhanThucTap || company.so_luong_nhan_thuc_tap || 0);
        
        if (!companyMap[tenCongTy]) {
          companyMap[tenCongTy] = {
            name: tenCongTy,
            linhVuc: linhVuc,
            viTri: viTri,
            maxStudents: soLuongNhan,
            currentStudents: 0,
            assignedStudents: []
          };
        }
      });

      // Đếm số sinh viên hiện tại của mỗi doanh nghiệp
      for (const student of students) {
        if (student.doanh_nghiep_thuc_tap) {
          const dnName = student.doanh_nghiep_thuc_tap;
          if (companyMap[dnName]) {
            companyMap[dnName].currentStudents++;
          }
        }
      }

      // Phân công DN cho sinh viên chưa có DN
      for (const student of students) {
        if (student.doanh_nghiep_thuc_tap) {
          results.companies.skipped++;
          continue;
        }

        try {
          const viTriMongMuon = (student.vi_tri_thuc_tap || '').toLowerCase().trim();
          
          // Tìm doanh nghiệp phù hợp
          let matchedCompanies = Object.values(companyMap).filter(c => {
            // Kiểm tra còn chỗ
            if (c.maxStudents > 0 && c.currentStudents >= c.maxStudents) {
              return false;
            }
            
            // Nếu sinh viên có vị trí mong muốn, match theo vị trí
            if (viTriMongMuon) {
              return c.viTri.includes(viTriMongMuon) || viTriMongMuon.includes(c.viTri);
            }
            
            return true;
          });

          // Nếu không match được theo vị trí, lấy tất cả DN còn chỗ
          if (matchedCompanies.length === 0) {
            matchedCompanies = Object.values(companyMap).filter(c => 
              c.maxStudents === 0 || c.currentStudents < c.maxStudents
            );
          }

          if (matchedCompanies.length === 0) {
            console.log(`  ⚠️  Không tìm thấy DN phù hợp cho SV ${student.ma_sinh_vien}`);
            results.companies.errors.push({
              studentId: student.ma_sinh_vien,
              error: 'Không có doanh nghiệp còn chỗ trống'
            });
            continue;
          }

          // Random chọn 1 DN từ danh sách match
          const randomIndex = Math.floor(Math.random() * matchedCompanies.length);
          const selectedCompany = matchedCompanies[randomIndex];

          // Cập nhật sinh viên
          const updateQuery = `
            UPDATE sinh_vien_huong_dan 
            SET doanh_nghiep_thuc_tap = ?
            WHERE ma_sinh_vien = ?
          `;
          
          await db.query(updateQuery, [selectedCompany.name, student.ma_sinh_vien]);
          
          selectedCompany.currentStudents++;
          selectedCompany.assignedStudents.push(student.ma_sinh_vien);
          results.companies.assigned++;
          
          console.log(`  ✅ SV ${student.ma_sinh_vien} (${viTriMongMuon || 'không rõ vị trí'}) → DN ${selectedCompany.name} (${selectedCompany.currentStudents}/${selectedCompany.maxStudents || '∞'})`);
          
          // Gửi thông báo cho sinh viên
          if (student.id && student.account_id) {
            await createNotification(
              student.account_id,
              'Đã phân công doanh nghiệp thực tập',
              `Bạn đã được phân công thực tập tại ${selectedCompany.name}.`,
              'success',
              'assignment'
            ).catch(err => console.error(`  ⚠️ Lỗi gửi thông báo cho SV ${student.ma_sinh_vien}:`, err.message));
          }
          
        } catch (error) {
          console.error(`  ❌ Lỗi phân công DN cho SV ${student.ma_sinh_vien}:`, error.message);
          results.companies.errors.push({
            studentId: student.ma_sinh_vien,
            error: error.message
          });
        }
      }

      // ======== BƯỚC 4: TRẢ VỀ KẾT QUẢ ========
      
      console.log('\n✨ Hoàn tất phân công tự động!');
      console.log(`📊 Kết quả:`);
      console.log(`   - Giảng viên: ${results.teachers.assigned} phân công, ${results.teachers.skipped} đã có`);
      console.log(`   - Doanh nghiệp: ${results.companies.assigned} phân công, ${results.companies.skipped} đã có`);
      
      res.json({
        success: true,
        message: 'Phân công tự động hoàn tất',
        data: results
      });

    } catch (error) {
      console.error('❌ Lỗi phân công tự động:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi phân công tự động: ' + error.message
      });
    }
  }
}

module.exports = AutoAssignmentController;
