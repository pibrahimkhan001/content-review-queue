const express = require('express');
const { authenticate } = require('../middleware/auth');
const { listAvailable, reserve, confirm } = require('../controllers/ticketController');
const { streamTickets } = require('../controllers/sseController');

const router = express.Router();

// All ticket routes require a valid JWT
router.get('/available',      authenticate, listAvailable);
router.get('/stream',          streamTickets);
router.post('/:id/reserve',   authenticate, reserve);
router.post('/:id/confirm',   authenticate, confirm);

module.exports = router;
