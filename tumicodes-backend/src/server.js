require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('./config/db');
const telegram = require('./config/telegram');
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const contactRoutes = require('./routes/contactRoutes');
const errorHandler = require('./utils/errorHandler');

const app = express();
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
app.use(limiter);

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/contact', contactRoutes);

app.get('/', (req, res) => res.json({ status: 'OK', service: 'TumiCodes Backend' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // Example: notify admin that server started (non-blocking)
  if (process.env.ADMIN_CHAT_ID && process.env.TELEGRAM_BOT_TOKEN) {
    telegram.sendAdmin(`📡 TumiCodes backend started on port ${PORT}`)
      .catch(() => {});
  }
});