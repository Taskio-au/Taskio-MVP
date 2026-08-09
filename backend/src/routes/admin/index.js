'use strict';

const express = require('express');

const profileRoutes = require('./profileRoutes');
const userRoutes = require('./userRoutes');
const jobRoutes = require('./jobRoutes');
const bootstrapRoutes = require('./bootstrapRoutes');
const notesRoutes = require('./notesRoutes');
const supportAdminRoutes = require('./supportAdminRoutes');
const workflowRoutes = require('./workflowRoutes');

const router = express.Router();

router.use(bootstrapRoutes);
router.use(notesRoutes);
router.use(workflowRoutes);
router.use(supportAdminRoutes);
router.use(profileRoutes);
router.use(userRoutes);
router.use(jobRoutes);

module.exports = router;
