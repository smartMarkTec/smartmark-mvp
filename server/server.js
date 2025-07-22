require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');

const app = express();

// ====== ENABLE CORS ======
app.use(cors({
  origin: 'https://smartmark-mvp.vercel.app',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ====== ROUTES ======
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api', campaignRoutes);

// ====== ROOT ROUTE ======
app.get('/', (req, res) => {
  res.send('SmartMark backend is running!');
});

// ====== START SERVER ======
const PORT = process.env.PORT || 10000; // <-- use 10000 as default for local, but Render will set PORT!
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});
