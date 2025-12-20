'use strict';

const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => res.status(200).json({ ok: true }));

router.get('/', (req, res) => {
  res.send('Taskio Backend is running and connected to Firebase!');
});

module.exports = router;


