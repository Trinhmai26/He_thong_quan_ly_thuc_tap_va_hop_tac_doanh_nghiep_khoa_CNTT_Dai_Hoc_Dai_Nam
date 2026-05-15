// Route: in-browser DOCX template editing for teachers/admin.
// GET  /api/templates                    -> list templates
// GET  /api/templates/:file/content      -> DOCX -> HTML
// PUT  /api/templates/:file/content      -> HTML -> DOCX (overwrite, keep .bak)

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const mammoth = require('mammoth');
const HTMLtoDOCX = require('html-to-docx');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'uploads', 'word');

// Whitelist of editable template files
const ALLOWED_TEMPLATES = {
  'Bang-Diem-TTTN.docx': 'Bảng điểm thực tập tốt nghiệp',
  'Nhan-Xet-TTTN.docx': 'Nhận xét thực tập tốt nghiệp',
  'nhatkythuctap.docx': 'Nhật ký thực tập',
  'Template-BaoCao-TTTN.docx': 'Báo cáo thực tập tốt nghiệp'
};

function resolveTemplatePath(fileName) {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TEMPLATES, fileName)) {
    return null;
  }
  const abs = path.join(TEMPLATES_DIR, fileName);
  // Defense in depth against path traversal
  if (!abs.startsWith(TEMPLATES_DIR)) return null;
  return abs;
}

// Reformat the HTML mammoth produces so the document looks like a Vietnamese
// administrative form: 2-column header (Bộ GD / Cộng hoà) + centered title.
function reformatVnAdminHeader(html) {
  if (typeof html !== 'string' || html.length === 0) return html;

  const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();

  // Split into block-level chunks using a regex on the closing tags of common blocks.
  // We only need to rewrite the FIRST few paragraphs; everything after the title is kept as-is.
  const blockRegex = /<(p|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi;
  const blocks = [];
  let lastIndex = 0;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    if (m.index > lastIndex) blocks.push({ raw: html.slice(lastIndex, m.index), isBlock: false });
    blocks.push({ raw: m[0], isBlock: true, text: stripTags(m[0]) });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < html.length) blocks.push({ raw: html.slice(lastIndex), isBlock: false });

  // Find the first paragraph that contains "BỘ GIÁO DỤC" — we'll rewrite up to the title block.
  let leftIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.isBlock) continue;
    const t = (b.text || '').toUpperCase();
    if (t.includes('BỘ GIÁO DỤC')) { leftIdx = i; break; }
  }
  if (leftIdx === -1) return html;

  // Collect up to the next ~6 block paragraphs to find the pieces
  const candidates = [];
  for (let i = leftIdx; i < blocks.length && candidates.length < 8; i++) {
    if (blocks[i].isBlock) candidates.push({ idx: i, text: blocks[i].text });
  }

  // Identify lines
  let boGdLine = '';
  let truongLine = '';
  let conghoaLine = '';
  let docLapLine = '';
  let titleLine = '';
  let lastCapturedIdx = leftIdx;

  for (const c of candidates) {
    const tUpper = c.text.toUpperCase();
    if (!boGdLine && tUpper.includes('BỘ GIÁO DỤC')) {
      // The first paragraph in the original docx often glues both columns together,
      // e.g. "BỘ GIÁO DỤC VÀ ĐÀO TẠO CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM".
      const idxCh = tUpper.indexOf('CỘNG HOÀ');
      const idxCh2 = idxCh === -1 ? tUpper.indexOf('CỘNG HÒA') : idxCh;
      if (idxCh2 !== -1) {
        boGdLine = c.text.slice(0, idxCh2).trim();
        conghoaLine = c.text.slice(idxCh2).trim();
      } else {
        boGdLine = c.text.trim();
      }
      lastCapturedIdx = c.idx;
      continue;
    }
    if (!truongLine && tUpper.includes('TRƯỜNG ĐẠI HỌC')) {
      const idxDoc = tUpper.indexOf('ĐỘC LẬP');
      if (idxDoc !== -1) {
        truongLine = c.text.slice(0, idxDoc).trim();
        docLapLine = c.text.slice(idxDoc).trim();
      } else {
        truongLine = c.text.trim();
      }
      lastCapturedIdx = c.idx;
      continue;
    }
    if (!conghoaLine && (tUpper.includes('CỘNG HOÀ') || tUpper.includes('CỘNG HÒA'))) {
      conghoaLine = c.text.trim();
      lastCapturedIdx = c.idx;
      continue;
    }
    if (!docLapLine && tUpper.includes('ĐỘC LẬP')) {
      docLapLine = c.text.trim();
      lastCapturedIdx = c.idx;
      continue;
    }
    if (!titleLine && (
      tUpper.includes('BẢNG ĐIỂM') ||
      tUpper.includes('NHẬN XÉT') ||
      tUpper.includes('NHẬT KÝ') ||
      tUpper.includes('BÁO CÁO')
    )) {
      titleLine = c.text.trim();
      lastCapturedIdx = c.idx;
      break;
    }
  }

  if (!boGdLine && !conghoaLine) return html;

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const headerHtml = `
<table style="width:100%;border-collapse:collapse;border:none;margin:0 0 12pt 0;font-family:'Times New Roman',Times,serif;table-layout:fixed;">
  <tbody>
    <tr>
      <td style="width:45%;border:none;text-align:center;vertical-align:top;padding:2pt;">
        <p style="margin:2pt 0;font-weight:bold;font-family:'Times New Roman',Times,serif;font-size:13pt;white-space:nowrap;">${esc(boGdLine)}</p>
        ${truongLine ? `<p style="margin:2pt 0;font-weight:bold;font-family:'Times New Roman',Times,serif;font-size:13pt;white-space:nowrap;"><u>${esc(truongLine)}</u></p>` : ''}
      </td>
      <td style="width:55%;border:none;text-align:center;vertical-align:top;padding:2pt;">
        ${conghoaLine ? `<p style="margin:2pt 0;font-weight:bold;font-family:'Times New Roman',Times,serif;font-size:13pt;white-space:nowrap;">${esc(conghoaLine)}</p>` : ''}
        ${docLapLine ? `<p style="margin:2pt 0;font-weight:bold;font-family:'Times New Roman',Times,serif;font-size:13pt;white-space:nowrap;"><u>${esc(docLapLine)}</u></p>` : ''}
      </td>
    </tr>
  </tbody>
</table>
${titleLine ? `<h2 style="text-align:center;font-weight:bold;margin:12pt 0;font-family:'Times New Roman',Times,serif;font-size:14pt;">${esc(titleLine)}</h2>` : ''}
`.trim();

  // Rebuild: replace blocks [leftIdx .. lastCapturedIdx] (inclusive of any non-block whitespace between them) with our header
  const beforeIdx = leftIdx;
  const afterIdx = lastCapturedIdx + 1;
  const before = blocks.slice(0, beforeIdx).map(b => b.raw).join('');
  const after = blocks.slice(afterIdx).map(b => b.raw).join('');
  return `${before}${headerHtml}${after}`;
}

// Style the header table for Nhan-Xet form: keep "TÊN CƠ SỞ THỰC TẬP" on the left
// and CỘNG HÒA on the right, borderless with proper font.
function rewriteCoSoThucTapHeader(html) {
  if (typeof html !== 'string') return html;
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
  const m = html.match(tableRe);
  if (!m) return html;
  const inner = m[1];
  if (!/TÊN CƠ SỞ THỰC TẬP/i.test(inner)) return html;

  const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  const cells = [];
  let cm;
  while ((cm = cellRe.exec(inner)) !== null) cells.push(cm[1]);
  if (cells.length < 2) return html;

  const st = "font-family:'Times New Roman',Times,serif;font-size:13pt;";
  const headerHtml = `
<table style="width:100%;border-collapse:collapse;border:none;margin:0 0 12pt 0;${st}table-layout:fixed;">
  <tbody>
    <tr>
      <td style="width:45%;border:none;text-align:center;vertical-align:top;padding:2pt;${st}">
        <p style="margin:2pt 0;font-weight:bold;${st}">TÊN CƠ SỞ THỰC TẬP</p>
      </td>
      <td style="width:55%;border:none;text-align:center;vertical-align:top;padding:2pt;${st}">${cells[1]}</td>
    </tr>
  </tbody>
</table>`.trim();

  return html.replace(tableRe, headerHtml);
}

// Fix bảng đánh giá thực tập: TT / Nội dung / Mức độ không đạt / Mức độ đạt / Ghi chú
function fixEvaluationTable(html) {
  if (typeof html !== 'string') return html;
  const stripT = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();

  const tableRe = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  return html.replace(tableRe, (match) => {
    const text = stripT(match);
    if (!text.includes('Nội dung') || !text.includes('Rất kém') || !text.includes('Trung bình')) return match;

    const th = 'border:1px solid #000;text-align:center;vertical-align:middle;padding:5pt 4pt;font-weight:bold;white-space:nowrap;';
    const td = 'border:1px solid #000;text-align:center;vertical-align:middle;padding:5pt 4pt;';
    const tdl = 'border:1px solid #000;vertical-align:middle;padding:5pt 6pt;white-space:nowrap;';
    const tde = 'border:1px solid #000;padding:20pt 4pt;';

    return `<table style="width:100%;border-collapse:collapse;margin:6pt 0;">
<tr>
  <td rowspan="2" style="${th}">TT</td>
  <td rowspan="2" style="${th}">Nội dung</td>
  <td colspan="2" style="${th}">Mức độ đánh giá không đạt</td>
  <td colspan="3" style="${th}">Mức độ đánh giá đạt</td>
  <td rowspan="2" style="${th}">Ghi chú</td>
</tr>
<tr>
  <td style="${th}">Rất kém</td>
  <td style="${th}">Kém</td>
  <td style="${th}">Trung bình</td>
  <td style="${th}">Tốt</td>
  <td style="${th}">Rất tốt</td>
</tr>
<tr>
  <td style="${td}">1</td>
  <td style="${tdl}">Ý thức tổ chức kỷ luật</td>
  <td style="${tde}"></td><td style="${tde}"></td><td style="${tde}"></td>
  <td style="${tde}"></td><td style="${tde}"></td><td style="${tde}"></td>
</tr>
<tr>
  <td style="${td}">2</td>
  <td style="${tdl}">Kết quả thực tập</td>
  <td style="${tde}"></td><td style="${tde}"></td><td style="${tde}"></td>
  <td style="${tde}"></td><td style="${tde}"></td><td style="${tde}"></td>
</tr>
</table>`;
  });
}

// Post-process: ensure fill-in dots after common label fields and center text in tables
function applyDocBodyTweaks(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  let out = html;

  // 0) Rewrite header table "TÊN CƠ SỞ THỰC TẬP"
  out = rewriteCoSoThucTapHeader(out);

  // 0b) Fix bảng đánh giá thực tập (TT / Nội dung / Mức độ đánh giá)
  out = fixEvaluationTable(out);

  // 1) Center align text in every <td> / <th> that doesn't already have a text-align.
  out = out.replace(/<(td|th)\b([^>]*)>/gi, (match, tag, attrs) => {
    if (/text-align\s*:/i.test(attrs)) return match;
    if (/style\s*=\s*"([^"]*)"/i.test(attrs)) {
      return match.replace(/style\s*=\s*"([^"]*)"/i, (_m, s) => {
        const sep = s.trim().endsWith(';') || s.trim() === '' ? '' : ';';
        return `style="${s}${sep}text-align:center;vertical-align:middle;"`;
      });
    }
    return `<${tag}${attrs} style="text-align:center;vertical-align:middle;">`;
  });

  // 2) Dots filling each label line — all segments same visual width using inline-block overflow:hidden
  const D = '.'.repeat(300);
  const seg1 = (label, val) => `<span style="display:inline-block;width:100%;white-space:nowrap;overflow:hidden;">${label} ${val ? val + ' ' : ''}${D}</span>`;
  const seg2 = (l1, v1, l2, v2) =>
    `<span style="display:inline-block;width:49%;white-space:nowrap;overflow:hidden;">${l1} ${v1 ? v1 + ' ' : ''}${D}</span>` +
    `<span style="display:inline-block;width:49%;white-space:nowrap;overflow:hidden;">${l2} ${v2 ? v2 + ' ' : ''}${D}</span>`;
  const seg3 = (l1, v1, l2, v2, l3, v3) =>
    `<span style="display:inline-block;width:32%;white-space:nowrap;overflow:hidden;">${l1} ${v1 ? v1 + ' ' : ''}${D}</span>` +
    `<span style="display:inline-block;width:32%;white-space:nowrap;overflow:hidden;">${l2} ${v2 ? v2 + ' ' : ''}${D}</span>` +
    `<span style="display:inline-block;width:32%;white-space:nowrap;overflow:hidden;">${l3} ${v3 ? v3 + ' ' : ''}${D}</span>`;

  const clean = (s) => (s || '').replace(/\.+/g, '').trim();

  const labelPatterns = [
    // MSV: ... Khóa: ... Lớp: ...
    {
      re: /(M[ãa] sinh viên\s*:|MSV\s*:)\s*([^<\n]*?)(Kh(?:óa|oá|oa)\s*:)\s*([^<\n]*?)(Lớp\s*:)\s*([^<\n]*?)(?=<|\n|$)/gi,
      fn: (_m, l1, m1, l2, m2, l3, m3) => seg3(l1, clean(m1), l2, clean(m2), l3, clean(m3))
    },
    // Số điện thoại: ... Email: ...
    {
      re: /(Số điện thoại\s*:)\s*([^<\n]*?)(Email\s*:)\s*([^<\n]*?)(?=<|\n|$)/gi,
      fn: (_m, l1, mid, l2, tail) => seg2(l1, clean(mid), l2, clean(tail))
    },
    // Ngày sinh: ... Nơi sinh: ...
    {
      re: /(Ngày sinh\s*:)\s*([^<\n]*?)(Nơi sinh\s*:)\s*([^<\n]*?)(?=<|\n|$)/gi,
      fn: (_m, l1, mid, l2, tail) => seg2(l1, clean(mid), l2, clean(tail))
    },
    // Single-column labels
    {
      re: /(Họ và tên(?: sinh viên)?\s*:)\s*([^<\n]*?)(?=<|\n|$)/gi,
      fn: (m, l, rest) => { if (/\.{5,}/.test(rest) || /:/.test(rest)) return m; return seg1(l, clean(rest)); }
    },
    {
      re: /(Ngành đào tạo\s*:)\s*([^<\n]*?)(?=<|\n|$)/gi,
      fn: (m, l, rest) => { if (/\.{5,}/.test(rest) || /:/.test(rest)) return m; return seg1(l, clean(rest)); }
    },
    {
      re: /(Đơn vị thực tập\s*:|Tên doanh nghiệp\s*:|Đơn vị tiếp nhận\s*:|Cán bộ hướng dẫn\s*:|Giảng viên hướng dẫn\s*:|Cơ sở thực tập(?: tốt nghiệp)?\s*:)\s*([^<\n]*?)(?=<|\n|$)/gi,
      fn: (m, l, rest) => { if (/\.{5,}/.test(rest) || /:/.test(rest)) return m; return seg1(l, clean(rest)); }
    }
  ];

  for (const { re, fn } of labelPatterns) {
    out = out.replace(re, fn);
  }

  // 2b) Paragraphs with dots: clip overflow so all lines end at same right margin
  out = out.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, inner) => {
    if (!/\.{10,}/.test(inner)) return match;
    if (/overflow\s*:\s*hidden/i.test(attrs)) return match;
    const extra = 'white-space:nowrap;overflow:hidden;display:block;width:100%;margin:6pt 0;';
    if (/style\s*=\s*"([^"]*)"/i.test(attrs)) {
      const newAttrs = attrs.replace(/style\s*=\s*"([^"]*)"/i, (_m, s) => {
        const sep = s.trim() === '' || s.trim().endsWith(';') ? '' : ';';
        return `style="${s}${sep}${extra}"`;
      });
      return `<p${newAttrs}>${inner}</p>`;
    }
    return `<p${attrs} style="${extra}">${inner}</p>`;
  });

  // 3) Promote standalone bold title paragraphs (e.g. "NHẬN XÉT" + "SINH VIÊN
  //    THỰC TẬP") to a centered H2. Merge consecutive title-like paragraphs.
  out = promoteDocumentTitles(out);

  // 3b) Đảm bảo tất cả h2 tiêu đề đều căn giữa
  out = out.replace(/<h2\b([^>]*)>/gi, (match, attrs) => {
    if (/text-align\s*:\s*center/i.test(attrs)) return match;
    if (/style\s*=\s*"([^"]*)"/i.test(attrs)) {
      return match.replace(/style\s*=\s*"([^"]*)"/i, (_m, s) => {
        const sep = s.trim().endsWith(';') ? '' : ';';
        return `style="${s}${sep}text-align:center;"`;
      });
    }
    return `<h2${attrs} style="text-align:center;">`;
  });

  // 4) Detect signature block — two consecutive paragraphs that list multiple roles
  //    on one line and the "(Ký và ghi rõ họ tên)" labels on the next line — and
  //    rebuild them as a borderless N-column table so each role is its own column.
  out = rebuildSignatureBlock(out);

  // 5) Căn phải "Xác nhận của cơ sở thực tập" và "(Ký tên, đóng dấu)"
  const stripTags2 = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
  out = out.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (match) => {
    if (/text-align\s*:\s*right/i.test(match)) return match;
    const text = stripTags2(match);
    const inner = match.replace(/^<p\b[^>]*>/, '').replace(/<\/p>$/i, '');
    if (text.indexOf('cơ sở thực tập') !== -1 && text.indexOf('nhận') !== -1) {
      return `<p style="text-align:right;"><strong>${stripTags2(inner)}</strong></p>`;
    }
    if (/^\s*\(K[^)]*t[^,]*,[^)]*\)\s*$/.test(text)) {
      return `<p style="text-align:right;font-style:italic;"><em>${stripTags2(inner)}</em></p>`;
    }
    return match;
  });

  return out;
}

function promoteDocumentTitles(html) {
  const TITLE_RE = /(NHẬN XÉT|BẢNG ĐIỂM|NHẬT KÝ|BÁO CÁO|SINH VIÊN THỰC TẬP|THỰC TẬP TỐT NGHIỆP)/i;
  const escHtml = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const stripInline = (s) => String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Find all <p>...</p> with positions
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const blocks = [];
  let pm;
  while ((pm = pRegex.exec(html)) !== null) {
    blocks.push({ start: pm.index, end: pm.index + pm[0].length, inner: pm[1] });
  }
  if (blocks.length === 0) return html;

  // Identify which blocks are short bold title-like paragraphs.
  const isTitleBlock = (b) => {
    const text = stripInline(b.inner);
    if (!text || text.length > 60) return false;
    if (!TITLE_RE.test(text)) return false;
    // Must be entirely wrapped/contain bold marker — accept if original inner has <strong> or <b>
    return /<strong\b|<b\b/i.test(b.inner) || /<h[1-6]/i.test(b.inner);
  };

  // Find first run of consecutive (adjacent) title blocks.
  let runStart = -1, runEnd = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (!isTitleBlock(blocks[i])) continue;
    runStart = i;
    runEnd = i;
    for (let j = i + 1; j < blocks.length; j++) {
      const between = html.substring(blocks[j - 1].end, blocks[j].start);
      if (between.trim() !== '') break;
      if (!isTitleBlock(blocks[j])) break;
      runEnd = j;
    }
    break;
  }
  if (runStart === -1) return html;

  const parts = [];
  for (let i = runStart; i <= runEnd; i++) parts.push(stripInline(blocks[i].inner));
  const titleText = parts.join(' ').replace(/\s+/g, ' ').trim();

  const replacement = `<h2 style="text-align:center;font-weight:bold;margin:14pt 0 10pt 0;font-family:'Times New Roman',Times,serif;font-size:14pt;text-transform:uppercase;">${escHtml(titleText)}</h2>`;

  return html.substring(0, blocks[runStart].start) + replacement + html.substring(blocks[runEnd].end);
}

function rebuildSignatureBlock(html) {
  const escHtml = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const stripInline = (s) => String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const knownRolePatterns = [
    /Cán bộ chấm thi\s*\d+/gi,
    /Trưởng bộ môn(?:\s*\([^)]*\))?/gi,
    /Trưởng khoa/gi,
    /Giảng viên hướng dẫn/gi,
    /Cán bộ hướng dẫn/gi,
    /Sinh viên thực tập/gi,
    /Sinh viên/gi,
    /Xác nhận của[^()]*?(?=\(|$)/gi
  ];

  // Collect every <p>...</p> block with its position so we can inspect any
  // arbitrary pair (not just even-aligned ones like a global .replace would).
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const blocks = [];
  let pm;
  while ((pm = pRegex.exec(html)) !== null) {
    blocks.push({ start: pm.index, end: pm.index + pm[0].length, full: pm[0], inner: pm[1] });
  }
  if (blocks.length < 2) return html;

  // Find the first adjacent pair where the 1st has >=2 role keywords and the
  // 2nd has >=2 "(Ký ...)" labels.
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    // Ensure they are adjacent (only whitespace between them).
    const between = html.substring(a.end, b.start);
    if (between.trim() !== '') continue;

    const rolesText = stripInline(a.inner);
    const kyText = stripInline(b.inner);
    if (!rolesText || !kyText) continue;

    const kyMatches = kyText.match(/\(\s*Ký[^)]*\)/gi) || [];
    if (kyMatches.length < 2) continue;

    const matches = [];
    for (const re of knownRolePatterns) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(rolesText)) !== null) {
        matches.push({ idx: m.index, text: m[0].trim() });
      }
    }
    if (matches.length < 2) continue;
    matches.sort((x, y) => x.idx - y.idx);
    const roles = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (m.idx >= lastEnd) {
        roles.push(m.text);
        lastEnd = m.idx + m.text.length;
      }
    }
    if (roles.length < 2) continue;

    while (kyMatches.length < roles.length) kyMatches.push('(Ký và ghi rõ họ tên)');

    const colWidth = (100 / roles.length).toFixed(2);
    const cells = roles.map((role, idx) => `
      <td style="width:${colWidth}%;border:none;text-align:center;vertical-align:top;padding:6pt 4pt;font-family:'Times New Roman',Times,serif;font-size:13pt;white-space:nowrap;">
        <p style="margin:0;font-weight:bold;text-align:center;white-space:nowrap;">${escHtml(role)}</p>
        <p style="margin:2pt 0 60pt 0;font-style:italic;text-align:center;white-space:nowrap;">${escHtml(kyMatches[idx] || '(Ký và ghi rõ họ tên)')}</p>
      </td>`).join('');

    const replacement = `<table style="width:100%;border-collapse:collapse;border:none;margin:14pt 0 0 0;font-family:'Times New Roman',Times,serif;table-layout:auto;"><tbody><tr>${cells}</tr></tbody></table>`;

    return html.substring(0, a.start) + replacement + html.substring(b.end);
  }

  return html;
}

// List
router.get('/', authenticateToken, requireRole(['giang-vien', 'admin']), async (req, res) => {
  try {
    const items = await Promise.all(
      Object.entries(ALLOWED_TEMPLATES).map(async ([file, label]) => {
        const abs = path.join(TEMPLATES_DIR, file);
        let exists = false;
        let size = 0;
        let mtime = null;
        try {
          const st = await fsp.stat(abs);
          exists = st.isFile();
          size = st.size;
          mtime = st.mtime;
        } catch (_) { /* ignore */ }
        return { file, label, exists, size, updatedAt: mtime };
      })
    );
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách biểu mẫu' });
  }
});

// Get HTML content
router.get('/:file/content', authenticateToken, requireRole(['giang-vien', 'admin']), async (req, res) => {
  try {
    const absPath = resolveTemplatePath(req.params.file);
    if (!absPath) {
      return res.status(404).json({ success: false, message: 'Biểu mẫu không tồn tại hoặc không được phép chỉnh sửa' });
    }
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, message: 'Tệp biểu mẫu không tồn tại trên máy chủ' });
    }
    const result = await mammoth.convertToHtml({ path: absPath });
    const formattedHtml = applyDocBodyTweaks(reformatVnAdminHeader(result.value));
    res.json({
      success: true,
      data: {
        file: req.params.file,
        label: ALLOWED_TEMPLATES[req.params.file],
        html: formattedHtml,
        messages: result.messages
      }
    });
  } catch (err) {
    console.error('Get template content error:', err);
    res.status(500).json({ success: false, message: 'Không thể đọc nội dung biểu mẫu' });
  }
});

// Save HTML -> DOCX
router.put('/:file/content', authenticateToken, requireRole(['giang-vien', 'admin']), async (req, res) => {
  try {
    const absPath = resolveTemplatePath(req.params.file);
    if (!absPath) {
      return res.status(404).json({ success: false, message: 'Biểu mẫu không tồn tại hoặc không được phép chỉnh sửa' });
    }
    const { html } = req.body || {};
    if (typeof html !== 'string' || html.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nội dung biểu mẫu không hợp lệ' });
    }

    // Wrap the HTML fragment into a full document so html-to-docx parses it correctly.
    // Apply Times New Roman 13pt as the base font (chuẩn văn bản hành chính VN).
    const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${ALLOWED_TEMPLATES[req.params.file]}</title>
<style>
  body, p, td, th, h1, h2, h3, h4, h5, h6, span, div, li {
    font-family: 'Times New Roman', Times, serif;
    font-size: 13pt;
  }
  h1 { font-size: 16pt; }
  h2 { font-size: 14pt; }
  h3 { font-size: 13pt; }
  table { border-collapse: collapse; }
  table td, table th { font-size: 13pt; }
</style>
</head><body>${html}</body></html>`;

    const buffer = await HTMLtoDOCX(wrapped, null, {
      orientation: 'portrait',
      margins: { top: 1134, right: 1134, bottom: 1134, left: 1701 }, // 2/2/2/3 cm (chuẩn TCVN 5700)
      font: 'Times New Roman',
      fontSize: 26 // half-points = 13pt
    });

    // Backup existing file once per save (overwrite .bak)
    try {
      if (fs.existsSync(absPath)) {
        await fsp.copyFile(absPath, `${absPath}.bak`);
      }
    } catch (e) {
      console.warn('Backup failed (continuing):', e.message);
    }

    await fsp.writeFile(absPath, buffer);

    res.json({
      success: true,
      message: 'Đã lưu biểu mẫu thành công',
      data: { file: req.params.file, size: buffer.length, updatedAt: new Date() }
    });
  } catch (err) {
    console.error('Save template content error:', err);
    res.status(500).json({ success: false, message: 'Không thể lưu biểu mẫu' });
  }
});

module.exports = router;
