const express = require('express');
const RegistrationController = require('../controllers/RegistrationController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/period', RegistrationController.getCurrentPeriod);
router.get('/check', RegistrationController.checkRegistrationStatus);

// Admin only routes
router.post('/period', authenticateToken, requireAdmin, RegistrationController.createPeriod);
router.get('/history', authenticateToken, requireAdmin, RegistrationController.getHistory);
router.delete('/period/:id', authenticateToken, requireAdmin, RegistrationController.deletePeriod);
router.put('/period/:id/status', authenticateToken, requireAdmin, RegistrationController.updateStatus);
router.put('/period/:id/extend', authenticateToken, requireAdmin, RegistrationController.extendPeriod);

module.exports = router;