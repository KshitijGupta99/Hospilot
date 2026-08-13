# "Ask Hospilot" RAG Service — Technical Documentation

Candidate Name: **kshitij**

---

## 1. Overview

The **"Ask Hospilot" RAG Service** is a natural-language Text-to-SQL database assistant designed for hospital administrators, doctors, and clinical staff. It allows users to ask plain-English questions about hospital operations (such as bed availability, ward occupancy, staff shift load, lab orders, and claims) and receive **accurate, grounded answers** generated directly from the underlying hospital database.

The system strictly avoids hallucination: if a question requests information not captured in the database schema (e.g. nurse vacation days, patient satisfaction surveys), the system explicitly refuses to answer and states that the required data is unavailable.

---

## 2. Architecture

```
User Question
    │
    ▼
LLM / Intent Parser (Receives Database Schema Context)
    │
    ▼
SQL Generation (Produces Read-Only SQLite Query)
    │
    ▼
SQL Safety Validator (Verifies read-only SELECT/WITH & blocks dangerous keywords)
    │
    ▼
Database Execution (Executes query against SQLite database)
    │
    ▼
Retrieved Rows / Data
    │
    ▼
LLM Grounded Answer Generator (Synthesizes factual answer using ONLY retrieved rows)
    │
    ▼
JSON Response & UI Display ({ answer, sql, rows })
```

---

## 3. Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher

### Installation Commands

```bash
# Navigate to Part 2 directory
cd rag/kshitij

# Install Node dependencies
npm install

# Initialize and seed the SQLite database
npm run init-db
```

---

## 4. Environment Variables

Create a `.env` file inside `rag/kshitij/` using `.env.example` as a template:

```env
PORT=3002
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
LLM_API_KEY=your_llm_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

*Note: Credentials and API keys must never be committed to source control.*

---

## 5. Running Locally

### Start Part 1 (Hospilot Widget Backend):
```bash
cd widget/kshitij
node server.js
# Access widget dashboard at http://localhost:3001
```

### Start Part 2 ("Ask Hospilot" RAG Service):
```bash
cd rag/kshitij
npm start
# Access RAG Web UI at http://localhost:3002
```

---

## 6. Example Questions

Here are working example questions supported by the system:

1. **Simple Count / Bed Availability**:
   - Question: *"How many ICU beds are available right now?"*
   - SQL: `SELECT COUNT(*) AS available_icu_beds FROM bed WHERE LOWER(ward) LIKE '%icu%' AND LOWER(status) = 'available' AND is_active = 1;`
   - Answer: *"There are **6 ICU beds** available right now."*

2. **Aggregation Across Tables & Ranking**:
   - Question: *"Which wards have the highest bed occupancy right now?"*
   - SQL:
     ```sql
     SELECT bed.ward, COUNT(*) AS occupied_beds,
            (SELECT COUNT(*) FROM bed b2 WHERE b2.ward = bed.ward AND b2.is_active = 1) AS total_beds,
            ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM bed b2 WHERE b2.ward = bed.ward AND b2.is_active = 1), 1) AS occupancy_percent
     FROM bed
     JOIN admission ON bed.id = admission.bed_id
     WHERE bed.is_active = 1 AND LOWER(admission.status) != 'discharged'
     GROUP BY bed.ward
     ORDER BY occupancy_percent DESC;
     ```
   - Answer: Explains top ward occupancy percentages with breakdown table.

3. **Ambiguous Phrasing / Broad Bed Overview**:
   - Question: *"how are beds doing?"*
   - SQL: `SELECT ward, status, COUNT(*) as count, room_type FROM bed WHERE is_active = 1 GROUP BY ward, status, room_type ORDER BY ward, status;`

4. **Staffing & Roster Analysis**:
   - Question: *"Which wards are short-staffed tonight?"*
   - SQL: `SELECT area_label, role, shift, headcount, assigned_load, load_per_staff FROM staff_roster WHERE load_per_staff > 3 ORDER BY load_per_staff DESC;`

---

## 7. Handling Unsupported Questions

### Anti-Hallucination Strategy
The system prevents LLM hallucinations through a 3-tier validation guard:
1. **Domain Pre-filtering**: Detects keywords for metrics outside the schema scope (e.g. `vacation`, `salary`, `satisfaction`, `parking`).
2. **Schema Constraint Prompting**: The LLM prompt explicitly instructs: *"If the database schema cannot answer this question, return EXACTLY: NOT_SUPPORTED"*.
3. **Explicit Refusal Response**: When a question is unanswerable from the database, the system returns:
   > *"I can't answer that from the available hospital data because the database does not contain the required information."*

---

## 8. SQL Safety

To protect the hospital database from unauthorized mutations or injection attacks, the system enforces strict safety checks before executing any generated SQL:

1. **Read-Only Enforcement**: Queries MUST start with `SELECT` or `WITH`.
2. **Keyword Blacklisting**: Disallows dangerous SQL commands (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `REPLACE`, `EXEC`, `PRAGMA`).
3. **Multi-Statement Blocking**: Rejects query strings containing semicolons separating multiple statements.

---

## 9. Architectural Decisions

- **Database (SQLite)**: Selected for zero external dependencies, fast execution, lightweight local footprint, and straightforward reviewer evaluation.
- **Node.js & Express**: Lightweight API layer consistent with Part 1.
- **Schema Adaptation**: Postgres schema from `schema.sql1` adapted into SQLite types (`TEXT`, `INTEGER`, `REAL`).
- **Exposed Reasoning**: Returns `{ answer, sql, rows }` in API responses so reviewers can inspect the generated SQL query and raw database rows.

---

## 10. Limitations

- **Complex CTE Nesting**: Highly intricate analytical queries spanning more than 5 tables may require fine-tuning or schema-specific Few-Shot prompt examples.
- **Dialect Differences**: SQLite syntax differs slightly from PostgreSQL (e.g. regex support and window function dialect).

---

## 11. What I Would Improve With More Time

1. **AST-Based SQL Parser**: Replace regex safety checks with full AST SQL parsing (e.g. `node-sql-parser`) for structural security validation.
2. **Semantic Vector Search / RAG for Schema**: Embed table/column descriptions in a vector index for large enterprise schemas.
3. **Query Result Caching**: Cache common analytical queries in Redis.
4. **WebSocket Streaming**: Stream answer generation to the UI in real time.
5. **Observability & Evaluation Suite**: Log query accuracy metrics and run automated benchmarks against sample question datasets.
