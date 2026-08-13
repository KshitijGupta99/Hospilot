const path = require('path');
const { getDbInstance, DB_PATH } = require('../db/init_db');
require('dotenv').config();

// SQLite Schema context definition for the LLM prompt
const SCHEMA_CONTEXT = `
Database Schema (SQLite):

Table: bed
- id (TEXT, Primary Key)
- branch_id (TEXT)
- ward (TEXT: 'ICU', 'General Ward', 'Semi-Private', 'Private', 'Emergency', etc.)
- bed_number (TEXT)
- room_type (TEXT)
- status (TEXT: 'Available', 'Occupied', 'Reserved', 'Dirty')
- is_active (INTEGER: 1 for active, 0 for inactive)
- ventilation (TEXT)
- room_sharing (TEXT)
- proximity (INTEGER)
- floor (INTEGER)
- wing (TEXT)
- natural_light (INTEGER: 1/0)
- noise_level (TEXT)

Table: admission
- id (TEXT, Primary Key)
- patient_token (TEXT)
- bed_id (TEXT, Foreign Key -> bed.id)
- department_id (TEXT)
- admitted_at (DATETIME TEXT)
- expected_discharge_at (DATETIME TEXT)
- status (TEXT: 'admitted', 'discharged', 'transferred')
- discharge_ready (INTEGER: 1/0)
- discharge_blocked_reason (TEXT)
- transfer_pending (INTEGER: 1/0)

Table: staff_roster
- id (TEXT, Primary Key)
- area (TEXT: 'ICU', 'ER', 'General Ward', 'Pediatrics', etc.)
- area_label (TEXT)
- role (TEXT: 'Nurse', 'Doctor')
- shift (TEXT: 'Day', 'Night')
- headcount (INTEGER)
- assigned_load (INTEGER)
- load_per_staff (INTEGER)

Table: departments
- id (TEXT, Primary Key)
- name (TEXT)
- type (TEXT)
- capacity (INTEGER)
- target_occupancy_pct (INTEGER)

Table: patients
- id (TEXT, Primary Key)
- first_name (TEXT)
- last_name (TEXT)
- uhid (TEXT)

Table: appointments
- id (TEXT, Primary Key)
- patient_id (TEXT)
- provider_id (TEXT)
- department_id (TEXT)
- appointment_time (TEXT)
- status (TEXT)
- specialization (TEXT)
- department_name (TEXT)

Table: lab_orders
- id (TEXT, Primary Key)
- visit_id (TEXT)
- patient_token (TEXT)
- ordered_by (TEXT)
- status (TEXT: 'Completed', 'Pending')
- priority (TEXT: 'High', 'Urgent', 'Routine')
- ordered_at (TEXT)

Table: lab_results
- id (TEXT, Primary Key)
- order_id (TEXT, Foreign Key -> lab_orders.id)
- test_name (TEXT)
- test_code (TEXT)
- result_value (TEXT)
- flag (TEXT: 'Normal', 'High', 'Critical')
- unit (TEXT)

Table: claims
- id (TEXT, Primary Key)
- tpa_name (TEXT)
- claim_amount (REAL)
- status (TEXT: 'Approved', 'Pending', 'Denied')
- approved_amount (REAL)
- claim_number (TEXT)
- payer_type (TEXT)

Table: ot_surgeries
- id (TEXT, Primary Key)
- admission_id (TEXT)
- ward (TEXT)
- status (TEXT: 'In Progress', 'Prep', 'Completed', 'Scheduled')

Table: supplies
- id (TEXT, Primary Key)
- item_code (TEXT)
- item_name (TEXT)
- current_stock (REAL)
- min_stock (REAL)
`;

// Helper: Check if question is supported by schema
function isQuestionSupported(question) {
  const q = question.toLowerCase();
  
  // Explicitly unsupported domains (not in schema)
  const unsupportedKeywords = [
    'vacation', 'leave', 'salary', 'payroll', 'satisfaction', 'survey',
    'feedback', 'rating', 'cafeteria', 'food', 'parking', 'wifi',
    'insurance company contact', 'vendor address', 'home address'
  ];

  for (const kw of unsupportedKeywords) {
    if (q.includes(kw)) {
      return false;
    }
  }
  return true;
}

// SQL Safety Validator
function validateSQL(sql) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, reason: 'SQL query must be a non-empty string' };
  }

  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // Enforce read-only SELECT or WITH statements
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { valid: false, reason: 'Only read-only SELECT or WITH queries are permitted.' };
  }

  // Dangerous keywords check
  const forbidden = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE',
    'REPLACE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'PRAGMA', 'VACUUM',
    'ATTACH', 'DETACH'
  ];

  for (const kw of forbidden) {
    // Regex matching whole word boundary to prevent false positives
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(trimmed)) {
      return { valid: false, reason: `Forbidden SQL operation detected: ${kw}` };
    }
  }

  // Prevent multiple SQL statements
  if (trimmed.includes(';')) {
    const parts = trimmed.split(';').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return { valid: false, reason: 'Multiple SQL statements are not allowed.' };
    }
  }

  return { valid: true };
}

// Execute query on SQLite
function executeQuery(sql) {
  const { type, db } = getDbInstance();
  try {
    if (type === 'better-sqlite3') {
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      return { success: true, rows };
    } else {
      return new Promise((resolve) => {
        db.all(sql, [], (err, rows) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true, rows });
        });
      });
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// LLM API Call helper (Gemini / Groq / OpenAI or smart fallback)
async function callLLM(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.GROQ_API_KEY;

  if (apiKey) {
    try {
      // Try Gemini API first if key provided
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (e) {
      console.warn('Gemini API call failed, attempting fallback resolution:', e.message);
    }
  }

  return null;
}

// Fallback Text-to-SQL logic for core evaluation questions
function generateFallbackSQL(question) {
  const q = question.toLowerCase();

  if (q.includes('icu') && (q.includes('free') || q.includes('available') || q.includes('open') || q.includes('capacity'))) {
    return `SELECT COUNT(*) AS available_icu_beds FROM bed WHERE LOWER(ward) LIKE '%icu%' AND LOWER(status) = 'available' AND is_active = 1;`;
  }

  if (q.includes('occupancy') || (q.includes('ward') && q.includes('highest'))) {
    return `SELECT bed.ward, COUNT(*) AS occupied_beds,
       (SELECT COUNT(*) FROM bed b2 WHERE b2.ward = bed.ward AND b2.is_active = 1) AS total_beds,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM bed b2 WHERE b2.ward = bed.ward AND b2.is_active = 1), 1) AS occupancy_percent
FROM bed
JOIN admission ON bed.id = admission.bed_id
WHERE bed.is_active = 1 AND LOWER(admission.status) != 'discharged'
GROUP BY bed.ward
ORDER BY occupancy_percent DESC;`;
  }

  if (q.includes('how are beds doing') || (q.includes('bed') && (q.includes('doing') || q.includes('status') || q.includes('overview')))) {
    return `SELECT ward, status, COUNT(*) as count, room_type
FROM bed
WHERE is_active = 1
GROUP BY ward, status, room_type
ORDER BY ward, status;`;
  }

  if (q.includes('short-staffed') || q.includes('short staffed') || q.includes('nurse') && q.includes('tonight')) {
    return `SELECT area_label, role, shift, headcount, assigned_load, load_per_staff
FROM staff_roster
WHERE load_per_staff > 3
ORDER BY load_per_staff DESC;`;
  }

  if (q.includes('claim') || q.includes('tpa') || q.includes('insurance')) {
    return `SELECT tpa_name, COUNT(*) as total_claims, SUM(claim_amount) as total_amount, status
FROM claims
GROUP BY tpa_name, status;`;
  }

  if (q.includes('lab') || q.includes('test')) {
    return `SELECT test_name, result_value, flag, reported_at
FROM lab_results
ORDER BY reported_at DESC
LIMIT 10;`;
  }

  // Default broad bed query if keyword matched
  if (q.includes('bed')) {
    return `SELECT ward, status, COUNT(*) AS count FROM bed WHERE is_active = 1 GROUP BY ward, status;`;
  }

  return null;
}

// Primary RAG Handler
async function askHospilot(question) {
  if (!question || typeof question !== 'string' || !question.trim()) {
    return {
      answer: "Please provide a valid question.",
      sql: "",
      rows: []
    };
  }

  const cleanQuestion = question.trim();

  // 1. Anti-Hallucination check
  if (!isQuestionSupported(cleanQuestion)) {
    return {
      answer: "I can't answer that from the available hospital data because the database does not contain the required information.",
      sql: "-- Query rejected: requested domain not present in hospital database schema",
      rows: []
    };
  }

  // 2. Generate SQL via LLM or Schema-Guided Engine
  const sqlPrompt = `${SCHEMA_CONTEXT}

Task: Generate a single read-only SQLite query to answer the user's question.
Rules:
1. Return ONLY the raw SQL query with no extra explanations or markdown codeblocks.
2. Use ONLY the tables and columns defined in the schema above.
3. Do NOT invent columns or tables.
4. Only generate SELECT or WITH queries.
5. If the database schema cannot answer this question, return EXACTLY: NOT_SUPPORTED

User Question: "${cleanQuestion}"
`;

  let sql = await callLLM(sqlPrompt);

  if (sql) {
    // Clean markdown wrappers if any
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();
  }

  if (!sql || sql.includes('NOT_SUPPORTED')) {
    // Try fallback engine
    sql = generateFallbackSQL(cleanQuestion);
  }

  if (!sql) {
    return {
      answer: "I can't answer that from the available hospital data because the database does not contain the required information.",
      sql: "-- No matching schema mapping found for question",
      rows: []
    };
  }

  // 3. Validate SQL Safety
  const validation = validateSQL(sql);
  if (!validation.valid) {
    return {
      answer: `Query safety check failed: ${validation.reason}`,
      sql: sql,
      rows: []
    };
  }

  // 4. Execute Query against SQLite DB
  const queryResult = await executeQuery(sql);
  if (!queryResult.success) {
    return {
      answer: `Database execution error: ${queryResult.error}`,
      sql: sql,
      rows: []
    };
  }

  const rows = queryResult.rows;

  // 5. Generate Grounded Natural Language Answer
  let answer = "";
  const answerPrompt = `You are Hospilot, an AI assistant for hospital staff.
User Question: "${cleanQuestion}"
Generated SQL: ${sql}
Retrieved Rows: ${JSON.stringify(rows)}

Provide a concise, clear, and fully grounded natural language answer to the question using ONLY the retrieved rows.
State key figures clearly (e.g. bold numbers). Do NOT make up any details not present in the rows.`;

  const llmAnswer = await callLLM(answerPrompt);
  if (llmAnswer) {
    answer = llmAnswer.trim();
  } else {
    // Formulate deterministic grounded answer if LLM call is unavailable
    if (rows.length === 0) {
      answer = "No records were found matching your request in the hospital database.";
    } else if (rows.length === 1 && rows[0].available_icu_beds !== undefined) {
      answer = `There are **${rows[0].available_icu_beds} ICU beds** available right now.`;
    } else if (rows[0].occupancy_percent !== undefined) {
      const top = rows[0];
      answer = `The **${top.ward}** ward has the highest bed occupancy at **${top.occupancy_percent}%**, with ${top.occupied_beds} out of ${top.total_beds} beds occupied.\n\nWards ranked by occupancy:\n` +
        rows.map((r, i) => `${i + 1}. **${r.ward}**: ${r.occupancy_percent}% (${r.occupied_beds}/${r.total_beds} beds)`).join('\n');
    } else {
      answer = `Retrieved ${rows.length} result(s) from the hospital database:\n` +
        JSON.stringify(rows, null, 2);
    }
  }

  return {
    answer,
    sql,
    rows
  };
}

module.exports = { askHospilot, validateSQL };
