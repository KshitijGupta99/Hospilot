const express = require('express');
const cors = require('cors');
const path = require('path');
const { runInit } = require('./db/init_db');
const { askHospilot } = require('./services/rag_service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database on startup
runInit();

// POST /api/ask endpoint
app.post('/api/ask', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        answer: "Please provide a valid non-empty question string.",
        sql: "",
        rows: []
      });
    }

    console.log(`[Ask Hospilot] Received question: "${question}"`);
    const result = await askHospilot(question);
    res.json(result);
  } catch (error) {
    console.error('Error handling /api/ask:', error);
    res.status(500).json({
      answer: `Internal server error: ${error.message}`,
      sql: "",
      rows: []
    });
  }
});

// Serve frontend SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Part 2 'Ask Hospilot' RAG Service running on http://localhost:${PORT}`);
});
