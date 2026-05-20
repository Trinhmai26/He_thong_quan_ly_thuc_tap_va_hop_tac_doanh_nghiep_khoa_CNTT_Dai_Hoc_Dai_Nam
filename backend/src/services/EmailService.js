const nodemailer = require('nodemailer');
const icalModule = require('ical-generator');
const ical = icalModule.default || icalModule;

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const EMAIL_COMPANY_TO_STUDENT_ENABLED = process.env.EMAIL_COMPANY_TO_STUDENT_ENABLED === 'true';
const COMPANY_TO_STUDENT_EMAIL_ENABLED = EMAIL_ENABLED || EMAIL_COMPANY_TO_STUDENT_ENABLED;
const EMAIL_DISABLED_RESULT = {
  success: true,
  skipped: true,
  reason: 'EMAIL_DISABLED'
};

function skipDisabledEmail({ recipientType = 'sinh viên', recipientName, recipientEmail, subject }) {
  const name = recipientName || 'Không rõ tên';
  const email = recipientEmail || 'Không có email';
  const title = subject || 'Không có tiêu đề';
  console.log(`[EMAIL DISABLED] Bỏ qua gửi email cho ${recipientType}: ${name} / ${email} / ${title}`);
  return { ...EMAIL_DISABLED_RESULT };
}

function skipEmail(reason, message) {
  console.warn(message);
  return {
    success: true,
    skipped: true,
    reason
  };
}

/**
 * Tạo transporter nodemailer từ biến môi trường
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Tạo link Google Calendar để sinh viên thêm sự kiện nhanh
 */
function buildGoogleCalendarLink({ title, startDate, endDate, location, description }) {
  const fmt = (d) => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: description || '',
    location: location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Gửi email thông báo lịch phỏng vấn đến sinh viên
 * Bao gồm: nội dung HTML, link Google Calendar, file .ics đính kèm
 *
 * @param {object} params
 * @param {string} params.studentEmail   - Email sinh viên
 * @param {string} params.studentName    - Họ tên sinh viên
 * @param {string} params.companyName    - Tên doanh nghiệp
 * @param {string} params.interviewDate  - Ngày phỏng vấn (YYYY-MM-DD)
 * @param {string} params.interviewTime  - Giờ phỏng vấn (HH:MM)
 * @param {string} params.interviewLocation - Địa điểm
 * @param {string|null} params.interviewNote - Ghi chú (tuỳ chọn)
 */
async function sendInterviewInviteEmail({
  studentEmail,
  studentName,
  companyName,
  interviewDate,
  interviewTime,
  interviewLocation,
  interviewNote,
  position = '',
  senderName = 'Bộ phận Nhân sự',
  senderTitle = 'Đại diện Doanh nghiệp'
}) {
  if (!COMPANY_TO_STUDENT_EMAIL_ENABLED) {
    return skipDisabledEmail({
      recipientName: studentName,
      recipientEmail: studentEmail,
      subject: position
        ? `${companyName} - Thư mời phỏng vấn vị trí ${position}`
        : `${companyName} - Thư mời phỏng vấn thực tập`
    });
  }

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_email@gmail.com') {
    return skipEmail(
      'EMAIL_NOT_CONFIGURED',
      '[EmailService] EMAIL_USER chưa được cấu hình — bỏ qua gửi email phỏng vấn'
    );
  }

  // Tính thời gian bắt đầu/kết thúc
  const [year, month, day] = interviewDate.split('-').map(Number);
  const [hour, minute] = (interviewTime || '08:00').split(':').map(Number);
  const startDate = new Date(year, month - 1, day, hour, minute, 0);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 giờ

  // Tạo file .ics
  const calendar = ical({ name: `Phỏng vấn thực tập - ${companyName}` });
  calendar.createEvent({
    start: startDate,
    end: endDate,
    summary: `Phỏng vấn thực tập tại ${companyName}`,
    description: interviewNote
      ? `${interviewNote}\n\nPhỏng vấn vị trí thực tập tại ${companyName}`
      : `Phỏng vấn vị trí thực tập tại ${companyName}`,
    location: interviewLocation,
    organizer: {
      name: companyName,
      email: process.env.EMAIL_USER
    }
  });
  const icsContent = calendar.toString();

  // Link thêm nhanh vào Google Calendar
  const gcalLink = buildGoogleCalendarLink({
    title: `Phỏng vấn thực tập tại ${companyName}`,
    startDate,
    endDate,
    location: interviewLocation,
    description: interviewNote || `Phỏng vấn thực tập tại ${companyName}`
  });

  const dateDisplay = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
  const subjectLine = position
    ? `${companyName} – Thư mời phỏng vấn vị trí ${position}`
    : `${companyName} – Thư mời phỏng vấn thực tập`;

  const positionRow = position
    ? `<tr><td style="padding:10px 14px;background:#eff6ff;font-weight:600;width:160px;border-top:1px solid #e5e7eb;">Vị trí ứng tuyển</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${position}</td></tr>`
    : '';
  const noteRow = interviewNote
    ? `<tr><td style="padding:10px 14px;background:#eff6ff;font-weight:600;border-top:1px solid #e5e7eb;">Ghi chú</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${interviewNote}</td></tr>`
    : '';

  const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2563eb;color:white;padding:22px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">📅 Thư mời phỏng vấn thực tập</h1>
    <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">${companyName}</p>
  </div>
  <div style="background:#ffffff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 12px;">Kính gửi <strong>${studentName}</strong>,</p>
    <p style="margin:0 0 20px;"><strong>${companyName}</strong> cảm ơn bạn đã quan tâm và ứng tuyển${position ? ` vị trí <strong>${position}</strong>` : ' chương trình thực tập'}.</p>
    <p style="margin:0 0 20px;">Sau khi xem xét hồ sơ, chúng tôi mời bạn tham gia buổi phỏng vấn với thông tin chi tiết dưới đây:</p>

    <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:6px 0 6px 16px;margin-bottom:16px;">
      <p style="margin:0;font-weight:700;color:#1d4ed8;font-size:14px;">📌 Thông tin phỏng vấn</p>
    </div>
    <table style="border-collapse:collapse;width:100%;background:white;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:24px;">
      ${positionRow}
      <tr><td style="padding:10px 14px;background:#eff6ff;font-weight:600;width:160px;${position ? 'border-top:1px solid #e5e7eb;' : ''}">Thời gian</td><td style="padding:10px 14px;${position ? 'border-top:1px solid #e5e7eb;' : ''}">${interviewTime} – ${dateDisplay}</td></tr>
      <tr><td style="padding:10px 14px;background:#eff6ff;font-weight:600;border-top:1px solid #e5e7eb;">Hình thức</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">Theo thông tin địa điểm bên dưới</td></tr>
      <tr><td style="padding:10px 14px;background:#eff6ff;font-weight:600;border-top:1px solid #e5e7eb;">Địa điểm / Link</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${interviewLocation}</td></tr>
      <tr><td style="padding:10px 14px;background:#eff6ff;font-weight:600;border-top:1px solid #e5e7eb;">Thời lượng dự kiến</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">30 – 60 phút</td></tr>
      ${noteRow}
    </table>

    <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:6px 0 6px 16px;margin-bottom:12px;">
      <p style="margin:0;font-weight:700;color:#1d4ed8;font-size:14px;">📌 Lưu ý</p>
    </div>
    <ul style="margin:0 0 24px;padding-left:20px;color:#374151;line-height:1.8;font-size:14px;">
      <li>Vui lòng có mặt (hoặc sẵn sàng trực tuyến) trước <strong>10–15 phút</strong></li>
      <li>Chuẩn bị <strong>CV</strong> và các giấy tờ cần thiết</li>
      <li>Kiểm tra thiết bị trước nếu phỏng vấn online</li>
    </ul>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:14px 16px;margin-bottom:24px;font-size:13px;color:#166534;">
      Vui lòng xác nhận tham gia bằng cách kiểm tra thông báo trên <strong>Hệ thống Quản lý Thực tập</strong>. Nếu cần hỗ trợ, hãy liên hệ với chúng tôi qua email này.
    </div>

    <div style="margin-bottom:20px;">
      <a href="${gcalLink}"
         style="display:inline-block;background:#4285f4;color:white;padding:11px 22px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;">
        📅 Thêm vào Google Calendar
      </a>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Hoặc mở file <strong>.ics</strong> đính kèm để thêm vào Outlook / lịch khác.</p>
    </div>

    <p style="margin:0 0 20px;">Chúng tôi mong được gặp bạn trong buổi phỏng vấn sắp tới.</p>

    <div style="padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-weight:600;color:#111827;">Trân trọng,</p>
      <p style="margin:4px 0 0;font-weight:600;color:#111827;">${senderName}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${senderTitle}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${companyName}</p>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="font-size:11px;color:#9ca3af;margin:0;">Email này được gửi tự động từ <strong>Hệ thống Quản lý Thực tập – Khoa CNTT, Đại học Đại Nam</strong>. Vui lòng không trả lời email này.</p>
  </div>
</div>`;

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"${companyName} qua Hệ thống Thực tập CNTT" <${process.env.EMAIL_USER}>`,
    to: studentEmail,
    subject: subjectLine,
    html: htmlBody,
    attachments: [
      {
        filename: 'lich-phong-van-thuc-tap.ics',
        content: icsContent,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST'
      }
    ]
  });

  console.log(`[EmailService] Đã gửi email thư mời phỏng vấn đến ${studentEmail}`);
  return { success: true, sent: true };
}

async function sendInterviewResultEmail({
  toEmail,
  toName,
  studentName,
  studentCode,
  companyName,
  result,
  resultNote,
  position = '',
  companyAddress = '',
  senderName = 'Bộ phận Nhân sự',
  senderTitle = 'Đại diện Doanh nghiệp',
  isAdmin = false
}) {
  const canSendInterviewResultEmail = isAdmin ? EMAIL_ENABLED : COMPANY_TO_STUDENT_EMAIL_ENABLED;

  if (!canSendInterviewResultEmail) {
    return skipDisabledEmail({
      recipientType: isAdmin ? 'admin' : 'sinh viên',
      recipientName: toName || studentName,
      recipientEmail: toEmail,
      subject: isAdmin
        ? `[Kết quả PV] ${studentName} (${studentCode}) - ${companyName}`
        : `Kết quả phỏng vấn thực tập - ${companyName}`
    });
  }

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_email@gmail.com') {
    return skipEmail(
      'EMAIL_NOT_CONFIGURED',
      '[EmailService] EMAIL_USER chưa được cấu hình — bỏ qua gửi email kết quả phỏng vấn'
    );
  }

  const isPass = result === 'PASS';
  const transporter = createTransporter();

  // ─── EMAIL GỬI CHO ADMIN ─────────────────────────────────────────────────
  if (isAdmin) {
    const resultText = isPass ? 'ĐẠT (PASS)' : 'KHÔNG ĐẠT (FAIL)';
    const headerColor = isPass ? '#16a34a' : '#dc2626';
    const subjectLine = `[Kết quả PV] ${studentName} (${studentCode}) – ${companyName}: ${resultText}`;
    const noteRow = resultNote
      ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Nhận xét</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${resultNote}</td></tr>`
      : '';
    const adminNote = isPass
      ? `<div style="margin-top:16px;padding:14px 16px;background:#dcfce7;border:1px solid #86efac;border-radius:6px;font-size:13px;color:#166534;"><strong>✅ Lưu ý:</strong> Sinh viên đã đạt phỏng vấn. Hồ sơ thực tập đã hoàn tất quy trình phỏng vấn.</div>`
      : `<div style="margin-top:16px;padding:14px 16px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;font-size:13px;color:#92400e;"><strong>⚠️ Lưu ý:</strong> Sinh viên chưa đạt phỏng vấn. Vui lòng gửi thông báo yêu cầu đăng ký thực tập lần 2 và duyệt hồ sơ mới khi sinh viên nộp lại.</div>`;

    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:${headerColor};color:white;padding:22px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:19px;">${isPass ? '✅' : '❌'} Kết quả phỏng vấn thực tập – Thông báo Admin</h1>
  </div>
  <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <p>Kính gửi <strong>${toName}</strong>,</p>
    <p>Doanh nghiệp <strong>${companyName}</strong> vừa cập nhật kết quả phỏng vấn cho sinh viên sau:</p>
    <table style="border-collapse:collapse;width:100%;background:white;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin:16px 0;">
      <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;width:150px;">Sinh viên</td><td style="padding:10px 14px;">${studentName} (${studentCode})</td></tr>
      <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Doanh nghiệp</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${companyName}</td></tr>
      ${position ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Vị trí</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${position}</td></tr>` : ''}
      <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Kết quả</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;font-weight:700;color:${headerColor};">${resultText}</td></tr>
      ${noteRow}
    </table>
    ${adminNote}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="font-size:12px;color:#9ca3af;margin:0;">Email này được gửi tự động từ <strong>Hệ thống Quản lý Thực tập – Khoa CNTT, Đại học Đại Nam</strong>.</p>
  </div>
</div>`;

    await transporter.sendMail({
      from: `"Hệ thống Thực tập CNTT – Đại học Đại Nam" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: subjectLine,
      html: htmlBody
    });
    console.log(`[EmailService] Đã gửi email kết quả PV (${result}) → admin ${toEmail}`);
    return { success: true, sent: true };
  }

  // ─── EMAIL GỬI CHO SINH VIÊN – PASS ──────────────────────────────────────
  if (isPass) {
    const subjectLine = `Kết quả phỏng vấn thực tập – ${companyName}`;
    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;color:white;padding:22px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">🎉 Kết quả phỏng vấn thực tập – ${companyName}</h1>
  </div>
  <div style="background:#ffffff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 12px;">Kính gửi <strong>${studentName}</strong>,</p>
    <p style="margin:0 0 12px;">Cảm ơn bạn đã tham gia buổi phỏng vấn${position ? ` vị trí <strong>${position}</strong>` : ''} tại <strong>${companyName}</strong>.</p>
    <p style="margin:0 0 20px;">Sau quá trình đánh giá, chúng tôi vui mừng thông báo rằng bạn đã <strong style="color:#16a34a;">TRÚNG TUYỂN</strong> vào chương trình thực tập tại công ty.</p>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:18px 20px;margin-bottom:20px;">
      <p style="margin:0 0 12px;font-weight:700;color:#15803d;font-size:15px;">📋 Thông tin chi tiết</p>
      <table style="border-collapse:collapse;width:100%;">
        ${position ? `<tr><td style="padding:7px 0;color:#374151;font-weight:600;width:160px;">Vị trí:</td><td style="padding:7px 0;color:#111827;">${position}</td></tr>` : ''}
        <tr><td style="padding:7px 0;color:#374151;font-weight:600;">Thời gian bắt đầu:</td><td style="padding:7px 0;color:#111827;">Sẽ được thông báo sớm</td></tr>
        <tr><td style="padding:7px 0;color:#374151;font-weight:600;">Địa điểm làm việc:</td><td style="padding:7px 0;color:#111827;">${companyAddress || 'Sẽ được thông báo sớm'}</td></tr>
        <tr><td style="padding:7px 0;color:#374151;font-weight:600;">Người hướng dẫn:</td><td style="padding:7px 0;color:#111827;">Sẽ được thông báo sớm</td></tr>
      </table>
    </div>

    ${resultNote ? `<div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#713f12;"><strong>📝 Nhận xét từ doanh nghiệp:</strong> ${resultNote}</div>` : ''}

    <p style="margin:0 0 12px;">Trong thời gian tới, bộ phận nhân sự sẽ liên hệ với bạn để hoàn tất các thủ tục cần thiết.</p>
    <p style="margin:0 0 20px;">Vui lòng theo dõi thông báo trong <strong>Hệ thống Quản lý Thực tập</strong> để cập nhật thông tin mới nhất.</p>

    <p style="margin:0 0 4px;">Một lần nữa, chúc mừng bạn và mong được đồng hành cùng bạn trong thời gian tới.</p>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-weight:600;color:#111827;">${senderName}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${senderTitle}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${companyName}</p>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="font-size:11px;color:#9ca3af;margin:0;">Email này được gửi tự động từ <strong>Hệ thống Quản lý Thực tập – Khoa CNTT, Đại học Đại Nam</strong>. Vui lòng không trả lời email này.</p>
  </div>
</div>`;

    await transporter.sendMail({
      from: `"${companyName} qua Hệ thống Thực tập CNTT" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: subjectLine,
      html: htmlBody
    });
    console.log(`[EmailService] Đã gửi email PASS → sinh viên ${toEmail}`);
    return { success: true, sent: true };
  }

  // ─── EMAIL GỬI CHO SINH VIÊN – FAIL ──────────────────────────────────────
  const subjectLine = `Kết quả phỏng vấn thực tập – ${companyName}`;
  const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;color:white;padding:22px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">📋 Kết quả phỏng vấn thực tập – ${companyName}</h1>
  </div>
  <div style="background:#ffffff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 12px;">Kính gửi <strong>${studentName}</strong>,</p>
    <p style="margin:0 0 12px;">Cảm ơn bạn đã dành thời gian tham gia phỏng vấn${position ? ` vị trí <strong>${position}</strong>` : ''} tại <strong>${companyName}</strong>.</p>
    <p style="margin:0 0 20px;">Sau khi cân nhắc kỹ lưỡng, chúng tôi rất tiếc phải thông báo rằng bạn <strong style="color:#dc2626;">chưa phù hợp</strong> với vị trí này tại thời điểm hiện tại.</p>

    ${resultNote ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#7f1d1d;"><strong>📝 Nhận xét từ doanh nghiệp:</strong> ${resultNote}</div>` : ''}

    <p style="margin:0 0 12px;">Chúng tôi đánh giá cao sự quan tâm và nỗ lực của bạn, đồng thời hy vọng sẽ có cơ hội hợp tác với bạn trong các vị trí phù hợp hơn trong tương lai.</p>

    <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:14px 16px;margin:20px 0;font-size:13px;color:#78350f;">
      <strong>📋 Bước tiếp theo:</strong> Admin Khoa CNTT sẽ liên hệ và hướng dẫn bạn <strong>đăng ký thực tập lần 2</strong>. Vui lòng theo dõi thông báo trên hệ thống và chuẩn bị hồ sơ đăng ký mới sớm nhất có thể.
    </div>

    <p style="margin:0 0 20px;">Chúc bạn thành công trong học tập và sự nghiệp sắp tới.</p>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-weight:600;color:#111827;">${senderName}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${senderTitle}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${companyName}</p>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="font-size:11px;color:#9ca3af;margin:0;">Email này được gửi tự động từ <strong>Hệ thống Quản lý Thực tập – Khoa CNTT, Đại học Đại Nam</strong>. Vui lòng không trả lời email này.</p>
  </div>
</div>`;

  await transporter.sendMail({
    from: `"${companyName} qua Hệ thống Thực tập CNTT" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: subjectLine,
    html: htmlBody
  });
  console.log(`[EmailService] Đã gửi email FAIL → sinh viên ${toEmail}`);
  return { success: true, sent: true };
}

/**
 * Gửi email thông báo duyệt đăng ký thực tập đến sinh viên
 *
 * @param {object} params
 * @param {string} params.studentEmail   - Email sinh viên
 * @param {string} params.studentName    - Họ tên sinh viên
 * @param {string} params.studentCode    - Mã sinh viên
 * @param {string} params.companyName    - Tên doanh nghiệp/đơn vị thực tập
 * @param {string} params.position       - Vị trí thực tập
 * @param {string} params.nguyenVong     - 'Tự liên hệ' hoặc 'Khoa giới thiệu'
 * @param {string|null} params.ghiChu    - Ghi chú từ admin (tuỳ chọn)
 */
async function sendApprovalEmail({
  studentEmail,
  studentName,
  studentCode = '',
  companyName = '',
  position = '',
  nguyenVong = '',
  ghiChu = null
}) {
  if (!EMAIL_ENABLED) {
    return skipDisabledEmail({
      recipientName: studentName,
      recipientEmail: studentEmail,
      subject: 'Đăng ký thực tập của bạn đã được duyệt - Khoa CNTT ĐH Đại Nam'
    });
  }

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_email@gmail.com') {
    return skipEmail(
      'EMAIL_NOT_CONFIGURED',
      '[EmailService] EMAIL_USER chưa được cấu hình — bỏ qua gửi email duyệt'
    );
  }
  if (!studentEmail) {
    return skipEmail(
      'NO_RECIPIENT_EMAIL',
      '[EmailService] Sinh viên không có email — bỏ qua'
    );
  }

  const transporter = createTransporter();
  const companyRow = companyName
    ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Đơn vị thực tập</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${companyName}</td></tr>`
    : '';
  const positionRow = position
    ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Vị trí</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${position}</td></tr>`
    : '';
  const nguyenVongRow = nguyenVong
    ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Nguyện vọng</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${nguyenVong}</td></tr>`
    : '';
  const ghiChuRow = ghiChu
    ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Ghi chú</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${ghiChu}</td></tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:32px 32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">✅</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">Đăng ký thực tập đã được duyệt</h1>
      <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">Khoa Công nghệ Thông tin – Đại học Đại Nam</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 16px;">Kính gửi <strong>${studentName}</strong>,</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">
        Khoa Công nghệ Thông tin trân trọng thông báo rằng đăng ký thực tập của bạn đã được <strong style="color:#16a34a;">phê duyệt</strong>.
        Vui lòng đăng nhập vào hệ thống để theo dõi thông tin chi tiết.
      </p>

      <!-- Info table -->
      <table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;width:160px;">Mã sinh viên</td><td style="padding:10px 14px;">${studentCode || '—'}</td></tr>
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Họ tên</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${studentName}</td></tr>
        ${nguyenVongRow}${companyRow}${positionRow}${ghiChuRow}
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Trạng thái</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;"><span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-weight:700;font-size:13px;">Đã duyệt ✓</span></td></tr>
      </table>

      <p style="color:#374151;font-size:14px;margin:0 0 24px;">
        Nếu có bất kỳ thắc mắc nào, vui lòng liên hệ với Khoa hoặc phụ trách thực tập của bạn.
      </p>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="http://localhost:5173" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Đăng nhập hệ thống →</a>
      </div>
    </div>

    <div style="background:#f0f9ff;border-top:1px solid #bae6fd;padding:14px 32px;text-align:center;">
      <p style="margin:0;color:#0369a1;font-size:12px;">Email được gửi tự động từ Hệ thống Quản lý Thực tập – Khoa CNTT, Đại học Đại Nam. Vui lòng không trả lời email này.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Khoa CNTT – Đại học Đại Nam" <${process.env.EMAIL_USER}>`,
    to: studentEmail,
    subject: 'Đăng ký thực tập của bạn đã được duyệt – Khoa CNTT ĐH Đại Nam',
    html
  });

  return { success: true, sent: true };
}

/**
 * Gửi email thông báo khoa giới thiệu doanh nghiệp thực tập
 * Dùng riêng cho luồng tự động gán doanh nghiệp cho sinh viên "Khoa giới thiệu"
 */
async function sendKhoaGioiThieuAssignmentEmail({
  studentEmail,
  studentName,
  studentCode = '',
  companyName = '',
  position = ''
}) {
  if (!EMAIL_ENABLED) {
    return skipDisabledEmail({
      recipientName: studentName,
      recipientEmail: studentEmail,
      subject: '[Thông báo] Doanh nghiệp thực tập của bạn đã được xác nhận - Khoa CNTT ĐH Đại Nam'
    });
  }

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_email@gmail.com') {
    return skipEmail(
      'EMAIL_NOT_CONFIGURED',
      '[EmailService] EMAIL_USER chưa được cấu hình — bỏ qua gửi email gán doanh nghiệp'
    );
  }
  if (!studentEmail) {
    return skipEmail(
      'NO_RECIPIENT_EMAIL',
      '[EmailService] Sinh viên không có email — bỏ qua'
    );
  }

  const transporter = createTransporter();

  const positionRow = position
    ? `<tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Vị trí thực tập</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${position}</td></tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:32px 32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">🏢</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">Thông báo doanh nghiệp thực tập</h1>
      <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">Khoa Công nghệ Thông tin – Đại học Đại Nam</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 16px;">Xin chào <strong>${studentName}</strong>,</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">
        Bạn đã được <strong style="color:#1e40af;">Khoa giới thiệu</strong> doanh nghiệp thực tập:
        <strong style="color:#16a34a;">${companyName}</strong>.
      </p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">
        Hồ sơ của bạn hiện đã được chuyển sang bước <strong>Doanh nghiệp phỏng vấn</strong>.
        Vui lòng đăng nhập hệ thống để kiểm tra thông tin chi tiết.
      </p>
      <table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;width:160px;">Mã sinh viên</td><td style="padding:10px 14px;">${studentCode || '—'}</td></tr>
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Họ tên</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;">${studentName}</td></tr>
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Doanh nghiệp thực tập</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;"><strong>${companyName}</strong></td></tr>
        ${positionRow}
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Bước tiếp theo</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;"><span style="background:#dbeafe;color:#1e40af;padding:3px 10px;border-radius:20px;font-weight:700;font-size:13px;">Doanh nghiệp phỏng vấn 📋</span></td></tr>
        <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:600;border-top:1px solid #e5e7eb;">Trạng thái</td><td style="padding:10px 14px;border-top:1px solid #e5e7eb;"><span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-weight:700;font-size:13px;">Đã duyệt ✓</span></td></tr>
      </table>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="http://localhost:5173" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Đăng nhập hệ thống →</a>
      </div>
    </div>
    <div style="background:#f0f9ff;border-top:1px solid #bae6fd;padding:14px 32px;text-align:center;">
      <p style="margin:0;color:#0369a1;font-size:12px;">Email được gửi tự động từ Hệ thống Quản lý Thực tập – Khoa CNTT, Đại học Đại Nam. Vui lòng không trả lời email này.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Khoa CNTT – Đại học Đại Nam" <${process.env.EMAIL_USER}>`,
    to: studentEmail,
    subject: '[Thông báo] Doanh nghiệp thực tập của bạn đã được xác nhận – Khoa CNTT ĐH Đại Nam',
    html
  });

  return { success: true, sent: true };
}

module.exports = { sendInterviewInviteEmail, sendInterviewResultEmail, sendApprovalEmail, sendKhoaGioiThieuAssignmentEmail };
