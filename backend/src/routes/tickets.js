const express = require('express');
const { authenticate } = require('../middleware/auth');
const { listAvailable, reserve, confirm, myReservations } = require('../controllers/ticketController');
const { streamTickets } = require('../controllers/sseController');

const router = express.Router();

router.get('/available',       authenticate, listAvailable);
router.get('/my-reservations', authenticate, myReservations);
router.get('/stream',          streamTickets);
router.post('/:id/reserve',    authenticate, reserve);
router.post('/:id/confirm',    authenticate, confirm);

module.exports = router;
