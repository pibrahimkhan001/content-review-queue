const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const { metrics } = require('./controllers/ticketController');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.get('/metrics', metrics);

app.use('/auth', authRoutes);
app.use('/tickets', ticketRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

module.exports = app;
