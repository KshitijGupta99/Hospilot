const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOSPILOT_BASE_URL = process.env.HOSPILOT_BASE_URL || 'https://hospilot.carer.ai';
const CANDIDATE_NAME = 'kshitij';
let cachedToken = null;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Resilient fetch helper with retry mechanism for Hospilot API
async function fetchWithRetry(url, options = {}, retries = 3, backoffMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout per attempt
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`[Network Retry] Hospilot API fetch attempt ${i + 1} failed: ${err.message}. Retrying in ${backoffMs}ms...`);
      await new Promise(res => setTimeout(res, backoffMs));
    }
  }
}

// Helper function to auto-login
async function getAuthToken() {
  if (cachedToken) return cachedToken;

  const username = process.env.HOSPILOT_USERNAME;
  const password = process.env.HOSPILOT_PASSWORD;
  if (!username || !password) {
    throw new Error('HOSPILOT_USERNAME or HOSPILOT_PASSWORD missing in env');
  }

  const response = await fetchWithRetry(`${HOSPILOT_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to authenticate with Hospilot');
  }

  cachedToken = data.token;
  return cachedToken;
}

// Proxy Login Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const token = await getAuthToken();
    res.json({ token, user: { username: process.env.HOSPILOT_USERNAME } });
  } catch (error) {
    console.error('Error logging into Hospilot:', error);
    res.status(500).json({ error: error.message || 'Failed to authenticate with Hospilot' });
  }
});

// Proxy Create Session Endpoint
app.post('/api/sessions', async (req, res) => {
  try {
    const { goal, token } = req.body;
    let authToken = token || cachedToken;

    if (!authToken) {
      authToken = await getAuthToken();
    }

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({ error: 'Goal string is required' });
    }

    const formattedGoal = `[CANDIDATE-${CANDIDATE_NAME}] ${goal.trim()}`;

    const response = await fetchWithRetry(`${HOSPILOT_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        goal: formattedGoal,
        constraints: '',
        autonomous: false
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error creating Hospilot session:', error);
    res.status(500).json({ error: error.message || 'Failed to create session with Hospilot' });
  }
});

// Proxy Get Session Status Endpoint
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : cachedToken;

    if (!token) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const response = await fetchWithRetry(`${HOSPILOT_BASE_URL}/api/sessions/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching Hospilot session:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch session status' });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'demo.html'));
});

app.listen(PORT, () => {
  console.log(`Hospilot Widget Backend running on http://localhost:${PORT}`);
});
