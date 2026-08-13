# Hospilot Full-Stack Assessment — Complete Project Context & Handoff Document

> **Author**: Kshitij  
> **Date**: August 13, 2026  
> **Project Scope**: Hospilot Assessment completion (Part 1 Widget & Part 2 RAG Service)

---

## 📌 Executive Summary & Architecture Overview

This project completes the Hospilot Full-Stack Assessment. All code is isolated strictly within candidate directories as required:
- **Part 1 (Widget)**: `widget/kshitij/`
- **Part 2 (RAG Service)**: `rag/kshitij/`

---

## 🚀 Part 1: Hospilot Session Management Widget (`widget/kshitij/`)

### **1. Architecture & Design Decisions**
- **Proxy Backend (`server.js`)**: Express server running on port `3001`. Handles login and session creation with Hospilot API (`https://hospilot.carer.ai`) so secrets remain server-side.
- **Auto-Authentication**: Transparently auto-logs in using `HOSPILOT_USERNAME` and `HOSPILOT_PASSWORD` environment variables if no client token is provided.
- **Candidate Prefix & Autonomous Constraint**: Enforces `[CANDIDATE-kshitij]` prefix on all goals and sets `autonomous: false`.
- **Resilient Network Handling**: Implements `fetchWithRetry` with up to 3 automatic retries and a 15s `AbortController` timeout for calls to `hospilot.carer.ai`.
- **Iframe Contract & postMessage**: Embedded in `demo.html`. Shows floating trigger button, floating widget panel, and an iframe loading `https://hospilot.carer.ai`. Once the iframe `load` event fires, it posts:
  ```json
  {
    "type": "widget_init",
    "token": "<JWT_TOKEN>",
    "sessionId": "<SESSION_ID>"
  }
  ```
- **Big Screen Mode**: Features a 📺 Big Screen Mode toggle allowing full-viewport interactive plan viewing.
- **localStorage Caching**: Caches active session parameters in `localStorage` (`hospilot_active_session`) and features a **🔄 Resume Last Plan** button to restore state across page reloads.

### **2. Part 1 Files**
- `widget/kshitij/server.js`: Express proxy backend.
- `widget/kshitij/demo.html`: Enhanced dashboard web UI with widget button, status card, iframe loader, caching, and Big Screen mode.
- `widget/kshitij/.env`: Environment configuration (`HOSPILOT_USERNAME`, `HOSPILOT_PASSWORD`, `HOSPILOT_BASE_URL`).

---

## 🤖 Part 2: "Ask Hospilot" RAG Service (`rag/kshitij/`)

### **1. Architecture & Design Decisions**
- **Express RAG Backend (`server.js`)**: Port `3002`. Exposes `POST /api/ask` for grounded Text-to-SQL querying.
- **Database (`db/init_db.js` & `db/hospilot.db`)**: Initialized SQLite database with 35 operational tables adapted from `schema.sql1` and populated with realistic hospital seed data (ICU beds, OT schedules, admissions, staff rosters, patient stats).
- **SQLite Singleton**: Connection uses a singleton pattern (`getDbInstance()`) with WAL journal mode to prevent `EBUSY` file locking errors on Windows.
- **Text-to-SQL Engine (`services/rag_service.js`)**:
  - Uses Google Gemini 1.5 Flash (`@google/generative-ai`) or fallback pattern-matcher engine.
  - Formats output as markdown with bold highlights, SQL query code blocks, and raw data rows.
- **Anti-Hallucination Guard**: Rejects queries requesting metrics outside the hospital database schema (e.g., patient satisfaction ratings, billing details not in schema). Returns standard refusal message:
  `"I can't answer that from the available hospital data because the database does not contain the required information."`
- **SQL Safety Validator**: Enforces read-only execution by blocking `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `REPLACE`, `EXEC`, `CREATE`.

### **2. Part 2 Files**
- `rag/kshitij/server.js`: Express API endpoint.
- `rag/kshitij/services/rag_service.js`: RAG logic, Text-to-SQL engine, safety validator, domain check.
- `rag/kshitij/db/init_db.js`: DDL & database seed script.
- `rag/kshitij/public/index.html`: Responsive search UI with query chips, answer cards, SQL viewer, and data tables.
- `rag/kshitij/.env`: Environment variables (`GEMINI_API_KEY`, `PORT=3002`).

---

## 📊 Database Schema Summary (35 Tables)

Key operational tables in `rag/kshitij/db/hospilot.db`:
- `bed`: `id`, `ward`, `bed_number`, `status` (`available`, `occupied`, `maintenance`), `is_active`.
- `operation_theater`: `id`, `ot_number`, `room_name`, `status`, `current_procedure`.
- `patient_admission`: `id`, `patient_id`, `admission_date`, `discharge_date`, `ward`, `status`.
- `staff_roster`: `id`, `staff_id`, `shift_date`, `shift_type`, `department`, `role`.
- `emergency_queue`: `id`, `patient_id`, `triage_level`, `wait_time_minutes`, `status`.

---

## 🧪 Verification & Testing Commands

### **Part 1 Proxy & Session Creation**:
```bash
# 1. Start Server
cd widget/kshitij && node server.js

# 2. Test Login Proxy
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json"

# 3. Test Session Creation Proxy
curl -X POST http://localhost:3001/api/sessions -H "Content-Type: application/json" -d "{\"goal\":\"Check ICU bed capacity\"}"
```
**Expected Output**: `{"session_id":"...","status":"planning","autonomous":false}`

---

### **Part 2 RAG Service Queries**:
```bash
# 1. Start Server
cd rag/kshitij && npm start

# 2. Test Valid Grounded Query (ICU Bed Capacity)
curl -X POST http://localhost:3002/api/ask -H "Content-Type: application/json" -d "{\"question\":\"How many ICU beds are free right now?\"}"
```
**Expected Output**:
```json
{
  "answer": "There are **6 ICU beds** available right now.",
  "sql": "SELECT COUNT(*) AS available_icu_beds FROM bed WHERE LOWER(ward) LIKE '%icu%' AND LOWER(status) = 'available' AND is_active = 1;",
  "rows": [{"available_icu_beds": 6}]
}
```

```bash
# 3. Test Anti-Hallucination Refusal Guard
curl -X POST http://localhost:3002/api/ask -H "Content-Type: application/json" -d "{\"question\":\"What is our average patient satisfaction rating this month?\"}"
```
**Expected Output**:
```json
{
  "answer": "I can't answer that from the available hospital data because the database does not contain the required information.",
  "sql": "-- Query rejected: requested domain not present in hospital database schema",
  "rows": []
}
```

---

## 🤖 Context Handoff for Future AI Models

If you are a new AI model picking up this project, note the following key facts:
1. **Repository Structure**:
   - `widget/demo.html` (Original, UNTOUCHED)
   - `widget/kshitij/` (Candidate widget workspace)
   - `rag/kshitij/` (Candidate RAG workspace)
2. **Current Status**: Both Part 1 and Part 2 are 100% completed, fully tested, and verified.
3. **No Unfinished Tasks**: All APIs, retry handling, EBUSY singleton database fixes, big-screen UI features, and anti-hallucination rules are actively running.
