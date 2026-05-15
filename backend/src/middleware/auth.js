const jwt = require('jsonwebtoken');

const canonicalizeRole = (role) =>
  String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

const extractRoleFromUser = (user) => {
  if (!user || typeof user !== 'object') return '';
  return (
    user.role ||
    user.userRole ||
    user.vai_tro ||
    user.vaiTro ||
    user.accountRole ||
    ''
  );
};

const normalizeRole = (role) => {
  const raw = canonicalizeRole(role);
  if (
    ['admin', 'administrator', 'quan-tri-vien', 'quantrivien'].includes(raw) ||
    raw.includes('admin') ||
    (raw.includes('quan') && raw.includes('tri') && raw.includes('vien'))
  ) {
    return 'admin';
  }
  if (['giang-vien', 'giangvien', 'teacher', 'lecturer'].includes(raw)) {
    return 'giang-vien';
  }
  if (['sinh-vien', 'sinhvien', 'student'].includes(raw)) {
    return 'sinh-vien';
  }
  if (['doanh-nghiep', 'doanhnghiep', 'company', 'enterprise'].includes(raw)) {
    return 'doanh-nghiep';
  }
  return raw;
};

/**
 * Middleware xác thực JWT token
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access token is required' 
    });
  }

  // Keep default secret consistent with AuthController
  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
    // Normalize role so all controllers get consistent lowercase role.
    if (user) {
      user.role = normalizeRole(extractRoleFromUser(user));
    }
    req.user = user;
    next();
  });
};

/**
 * Middleware kiểm tra role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    const acceptedRoles = roles.map(normalizeRole);
    const userRole = normalizeRole(extractRoleFromUser(req.user));

    if (!acceptedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

/**
 * Middleware chỉ cho phép admin
 */
const requireAdmin = requireRole(['admin']);

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  // Allow requests to proceed without a token while still decoding if provided
  optionalAuthenticateToken: (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return next();
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) return next();
      const token = parts[1];
  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
        if (!err && user) {
          req.user = user;
        }
        return next();
      });
    } catch {
      return next();
    }
  }
};