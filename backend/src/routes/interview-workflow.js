const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const InterviewWorkflowController = require('../controllers/InterviewWorkflowController');

router.use(authenticateToken);

// Student
router.post('/student/applications', InterviewWorkflowController.createStudentApplication);
router.get('/student/applications', InterviewWorkflowController.getMyStudentApplications);
router.get('/student/latest', InterviewWorkflowController.getMyLatestStudentApplication);

// Admin
router.get('/admin/applications', InterviewWorkflowController.getAdminApplications);
router.put('/admin/applications/:id/review', InterviewWorkflowController.adminReviewApplication);

// Company
router.get('/company/applications', InterviewWorkflowController.getCompanyApprovedApplications);
router.put('/company/applications/:id/interview', InterviewWorkflowController.companyConfirmInterview);
router.put('/company/applications/:id/result', InterviewWorkflowController.companySetInterviewResult);

module.exports = router;
