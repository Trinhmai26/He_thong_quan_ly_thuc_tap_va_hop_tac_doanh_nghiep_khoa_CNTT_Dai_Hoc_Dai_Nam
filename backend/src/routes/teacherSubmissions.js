const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadDocuments } = require('../middleware/uploadDocuments');
const ctrl = require('../controllers/TeacherSubmissionsController');

// Teacher manages slots
router.post('/slots', authenticateToken, requireRole(['giang-vien']), ctrl.createSlot);
router.get('/slots', authenticateToken, requireRole(['giang-vien']), ctrl.listTeacherSlots);
router.get('/slots/:slotId/statuses', authenticateToken, requireRole(['giang-vien']), ctrl.getSlotStatuses);
router.put('/submissions/:submissionId/comment', authenticateToken, requireRole(['giang-vien']), ctrl.commentSubmission);
router.put('/slots/:slotId', authenticateToken, requireRole(['giang-vien']), ctrl.updateSlot);
router.put('/slots/:slotId/times', authenticateToken, requireRole(['giang-vien']), ctrl.updateSlotTimes);
router.delete('/slots/:slotId', authenticateToken, requireRole(['giang-vien']), ctrl.deleteSlot);

// Student uploads into a slot
router.get('/student/open-slots', authenticateToken, requireRole(['sinh-vien']), ctrl.listOpenSlotsForStudent);
router.get('/student/all-slots', authenticateToken, requireRole(['sinh-vien']), ctrl.listAllSlotsForStudent);
router.post('/student/slots/:slotId/upload', authenticateToken, requireRole(['sinh-vien']), uploadDocuments.single('file'), ctrl.uploadSubmission);
// multi-file upload
router.post('/student/slots/:slotId/uploads', authenticateToken, requireRole(['sinh-vien']), uploadDocuments.array('files', 10), ctrl.uploadMultipleSubmissions);

// advisor info and my submissions
router.get('/student/advisor', authenticateToken, requireRole(['sinh-vien']), ctrl.getAdvisorInfo);
router.get('/student/slots/:slotId/my-submissions', authenticateToken, requireRole(['sinh-vien']), ctrl.listMySubmissions);
router.get('/student/all-my-submissions', authenticateToken, requireRole(['sinh-vien']), ctrl.listAllMySubmissions);
router.delete('/student/submissions/:submissionId', authenticateToken, requireRole(['sinh-vien']), ctrl.deleteMySubmission);

module.exports = router;
