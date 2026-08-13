const fs = require('fs');
const path = require('path');

let sqlite3;
try {
  sqlite3 = require('better-sqlite3');
} catch (e) {
  try {
    sqlite3 = require('sqlite3');
  } catch (e2) {
    console.error('Neither better-sqlite3 nor sqlite3 is installed.');
  }
}

const DB_PATH = path.join(__dirname, 'hospilot.db');

let activeDbInstance = null;

function getDbInstance() {
  if (activeDbInstance) {
    return activeDbInstance;
  }

  try {
    const BetterSqlite = require('better-sqlite3');
    const db = new BetterSqlite(DB_PATH);
    db.pragma('journal_mode = WAL');
    activeDbInstance = { type: 'better-sqlite3', db };
    return activeDbInstance;
  } catch (e) {
    const Sqlite3 = require('sqlite3').verbose();
    const db = new Sqlite3.Database(DB_PATH);
    activeDbInstance = { type: 'sqlite3', db };
    return activeDbInstance;
  }
}

function runInit() {
  console.log('Initializing Hospilot SQLite database at:', DB_PATH);
  const { type, db } = getDbInstance();

  const ddlStatements = `
    -- 1. appointments
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, patient_id TEXT, provider_id TEXT, department_id TEXT,
      appointment_time TEXT, status TEXT, type TEXT, patient_name TEXT, phone TEXT,
      email TEXT, specialization TEXT, department_name TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. bed (beds)
    CREATE TABLE IF NOT EXISTS bed (
      id TEXT PRIMARY KEY, branch_id TEXT, ward TEXT NOT NULL, bed_number TEXT NOT NULL,
      room_type TEXT, status TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      ventilation TEXT, room_sharing TEXT, proximity INTEGER, floor INTEGER, wing TEXT,
      natural_light INTEGER, noise_level TEXT, features TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. claim_history
    CREATE TABLE IF NOT EXISTS claim_history (
      id TEXT PRIMARY KEY, claim_id TEXT, from_status TEXT, to_status TEXT, action TEXT,
      changed_at TEXT, changed_by TEXT, remarks TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. claim_line_items
    CREATE TABLE IF NOT EXISTS claim_line_items (
      id TEXT PRIMARY KEY, claim_id TEXT, service_code TEXT, service_name TEXT, description TEXT,
      quantity REAL, rate REAL, amount REAL, approved_amount REAL, approved_quantity REAL,
      approved_rate REAL, status TEXT, category TEXT, unit TEXT, rejection_reason TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. claim_queries
    CREATE TABLE IF NOT EXISTS claim_queries (
      id TEXT PRIMARY KEY, claim_id TEXT, query_type TEXT, query_text TEXT, status TEXT,
      raised_at TEXT, raised_by TEXT, responded_by TEXT, response_date TEXT, response_text TEXT,
      created_at TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. claims
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY, patient_token TEXT, visit_id TEXT, tpa_id TEXT, tpa_name TEXT,
      claim_amount REAL, status TEXT, created_at TEXT, submitted_date TEXT, approved_amount REAL,
      denial_reason TEXT, claim_number TEXT, payer_type TEXT, risk_level TEXT, risk_score REAL,
      stage TEXT, compliance_status TEXT, diagnosis_code TEXT, branch_id TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. contract_service_rates
    CREATE TABLE IF NOT EXISTS contract_service_rates (
      id TEXT PRIMARY KEY, contract_id TEXT, service_id TEXT, service_code TEXT, service_name TEXT,
      contract_rate REAL, hospital_rate REAL, discount_percentage REAL, is_active INTEGER, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. daily_collections
    CREATE TABLE IF NOT EXISTS daily_collections (
      id TEXT PRIMARY KEY, org_id TEXT, collection_date TEXT NOT NULL, cash_total REAL DEFAULT 0,
      upi_total REAL DEFAULT 0, card_total REAL DEFAULT 0, bank_transfer_total REAL DEFAULT 0,
      cheque_total REAL DEFAULT 0, total_collection REAL DEFAULT 0, invoice_count INTEGER DEFAULT 0,
      payment_count INTEGER DEFAULT 0, is_reconciled INTEGER DEFAULT 0, reconciled_by TEXT,
      reconciled_at TEXT, variance REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. departments
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      capacity INTEGER, target_occupancy_pct INTEGER
    );

    -- 10. discharge_summaries
    CREATE TABLE IF NOT EXISTS discharge_summaries (
      id TEXT PRIMARY KEY, admission_id TEXT, summary_text TEXT, created_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP, ai_generated_note TEXT
    );

    -- 11. doctor_slots
    CREATE TABLE IF NOT EXISTS doctor_slots (
      id TEXT PRIMARY KEY, provider_id TEXT, slot_date TEXT, slot_start TEXT, slot_end TEXT,
      slot_type TEXT, status TEXT, max_patients INTEGER, booked_count INTEGER, specialization TEXT
    );

    -- 12. waitlist
    CREATE TABLE IF NOT EXISTS waitlist (
      id TEXT PRIMARY KEY, patient_id TEXT, patient_name TEXT, phone TEXT, email TEXT,
      specialization TEXT, priority TEXT DEFAULT 'medium', requested_date TEXT, status TEXT DEFAULT 'waitlisted', reason TEXT
    );

    -- 13. staff_roster
    CREATE TABLE IF NOT EXISTS staff_roster (
      id TEXT PRIMARY KEY, area TEXT, area_label TEXT, role TEXT, shift TEXT, headcount INTEGER DEFAULT 0,
      assigned_load INTEGER DEFAULT 0, load_per_staff INTEGER DEFAULT 1, branch_id TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. service_slots
    CREATE TABLE IF NOT EXISTS service_slots (
      id TEXT PRIMARY KEY, slot_type TEXT, slot_date TEXT, slot_start TEXT, slot_end TEXT, location TEXT,
      specialization TEXT, max_patients INTEGER DEFAULT 1, booked_count INTEGER DEFAULT 0, status TEXT DEFAULT 'open'
    );

    -- 15. hospilot_agent_registry
    CREATE TABLE IF NOT EXISTS hospilot_agent_registry (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT DEFAULT '', emoji TEXT DEFAULT '🤖',
      color TEXT DEFAULT '#94a3b8', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
    );

    -- 16. hospilot_subagent_registry
    CREATE TABLE IF NOT EXISTS hospilot_subagent_registry (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, label TEXT NOT NULL, description TEXT DEFAULT '',
      capabilities TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1, is_prefetch_eligible INTEGER DEFAULT 0
    );

    -- 17. hospilot_task_registry
    CREATE TABLE IF NOT EXISTS hospilot_task_registry (
      id TEXT PRIMARY KEY, subagent_id TEXT NOT NULL, label TEXT NOT NULL, description TEXT DEFAULT '',
      outputs TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
    );

    -- 18. infection_cases
    CREATE TABLE IF NOT EXISTS infection_cases (
      id TEXT PRIMARY KEY, patient_token TEXT, admission_id TEXT, ward TEXT, pathogen TEXT,
      severity TEXT, isolation_required INTEGER, isolation_confirmed INTEGER, isolation_room TEXT,
      status TEXT, reported_at TEXT, notes TEXT
    );

    -- 19. insurance_contracts
    CREATE TABLE IF NOT EXISTS insurance_contracts (
      id TEXT PRIMARY KEY, insurer_name TEXT, tpa_name TEXT, contract_type TEXT, contract_number TEXT,
      start_date TEXT, end_date TEXT, status TEXT, branch_id TEXT, total_claims INTEGER, approved_amount REAL,
      rejection_rate REAL, avg_settlement_days REAL
    );

    -- 20. invoice_line_items
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY, invoice_id TEXT, service_id TEXT, service_code TEXT, service_name TEXT,
      description TEXT, quantity REAL, rate REAL, amount REAL, total REAL, gst_rate REAL, gst_amount REAL, discount_amount REAL
    );

    -- 21. invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, org_id TEXT, invoice_number TEXT, patient_id TEXT, invoice_date TEXT,
      due_date TEXT, invoice_type TEXT, subtotal REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0, grand_total REAL, paid_amount REAL DEFAULT 0, balance REAL,
      status TEXT DEFAULT 'Draft', payment_status TEXT DEFAULT 'Unpaid'
    );

    -- 22. admission (ipd_admissions)
    CREATE TABLE IF NOT EXISTS admission (
      id TEXT PRIMARY KEY, patient_token TEXT, bed_id TEXT, department_id TEXT, admitted_at TEXT,
      expected_discharge_at TEXT, status TEXT, discharge_ready INTEGER DEFAULT 0,
      discharge_blocked_reason TEXT, transfer_pending INTEGER DEFAULT 0, synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bed_id) REFERENCES bed(id)
    );

    -- 23. lab_orders
    CREATE TABLE IF NOT EXISTS lab_orders (
      id TEXT PRIMARY KEY, visit_id TEXT, patient_token TEXT, ordered_by TEXT, status TEXT,
      priority TEXT, ordered_at TEXT, completed_at TEXT
    );

    -- 24. lab_results
    CREATE TABLE IF NOT EXISTS lab_results (
      id TEXT PRIMARY KEY, order_id TEXT, patient_token TEXT, test_name TEXT, test_code TEXT,
      result_value TEXT, flag TEXT, reference_range TEXT, unit TEXT, reported_at TEXT
    );

    -- 25. nursing_tasks
    CREATE TABLE IF NOT EXISTS nursing_tasks (
      id TEXT PRIMARY KEY, admission_id TEXT, task TEXT NOT NULL, completed INTEGER DEFAULT 0,
      due_at TEXT, assigned_to TEXT
    );

    -- 26. ot_surgeries
    CREATE TABLE IF NOT EXISTS ot_surgeries (
      id TEXT PRIMARY KEY, admission_id TEXT, patient_token TEXT, ward TEXT, status TEXT, created_at TEXT
    );

    -- 27. patients
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, uhid TEXT
    );

    -- 28. payment_entries
    CREATE TABLE IF NOT EXISTS payment_entries (
      id TEXT PRIMARY KEY, payment_id TEXT, payment_mode TEXT, amount REAL, transaction_reference TEXT, bank_name TEXT, card_last_four TEXT
    );

    -- 29. payment_reconciliation
    CREATE TABLE IF NOT EXISTS payment_reconciliation (
      id TEXT PRIMARY KEY, reconciliation_date TEXT NOT NULL, total_expected REAL, total_actual REAL,
      total_variance REAL, actual_cash REAL, actual_card REAL, actual_upi REAL, actual_bank REAL, status TEXT
    );

    -- 30. payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, org_id TEXT, receipt_number TEXT, invoice_id TEXT, patient_id TEXT,
      payment_date TEXT, total_amount REAL, status TEXT DEFAULT 'Completed', notes TEXT, branch_id TEXT
    );

    -- 31. purchase_orders
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY, po_number TEXT, vendor_id TEXT, status TEXT, total REAL, order_date TEXT, expected_delivery TEXT
    );

    -- 32. refunds
    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY, invoice_id TEXT, payment_id TEXT, refund_amount REAL, reason TEXT, status TEXT, refund_date TEXT
    );

    -- 33. supplies
    CREATE TABLE IF NOT EXISTS supplies (
      id TEXT PRIMARY KEY, item_code TEXT, item_name TEXT, category TEXT, current_stock REAL, min_stock REAL, unit TEXT, unit_cost REAL
    );

    -- 34. visits
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY, patient_token TEXT, department_id TEXT, arrived_at TEXT, status TEXT, chief_complaint TEXT, triage_score INTEGER, visit_type TEXT
    );

    -- 35. vitals
    CREATE TABLE IF NOT EXISTS vitals (
      id TEXT PRIMARY KEY, patient_token TEXT, admission_id TEXT, recorded_at TEXT NOT NULL,
      temperature REAL, pulse INTEGER, bp_systolic INTEGER, bp_diastolic INTEGER, spo2 INTEGER,
      respiratory_rate INTEGER, gcs INTEGER, is_critical INTEGER
    );
  `;

  if (type === 'better-sqlite3') {
    db.exec(ddlStatements);

    // Insert Beds (matching example-qa.md distributions)
    const insertBed = db.prepare(`
      INSERT INTO bed (id, branch_id, ward, bed_number, room_type, status, is_active, ventilation, room_sharing, proximity, floor, wing, natural_light, noise_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // ICU Beds: 30 total (6 Available, 17 Occupied, 3 Reserved, 4 Dirty)
    for (let i = 1; i <= 30; i++) {
      let status = 'Available';
      if (i <= 6) status = 'Available';
      else if (i <= 23) status = 'Occupied';
      else if (i <= 26) status = 'Reserved';
      else status = 'Dirty';
      
      insertBed.run(`bed-icu-${i}`, 'b1', 'ICU', `ICU-${100 + i}`, 'Single', status, 1, 'Ventilator', 'Private', 1, 3, 'A', 1, 'Quiet');
    }

    // General Ward Beds: 19 total (4 Available, 6 Occupied, 9 Reserved)
    for (let i = 1; i <= 19; i++) {
      let status = 'Available';
      if (i <= 4) status = 'Available';
      else if (i <= 10) status = 'Occupied';
      else status = 'Reserved';
      
      insertBed.run(`bed-gen-${i}`, 'b1', 'General Ward', `GW-${200 + i}`, 'Multi-bed', status, 1, 'None', 'Shared', 5, 2, 'B', 1, 'Moderate');
    }

    // Semi-Private Beds: 6 total (1 Available, 4 Occupied, 1 Reserved)
    for (let i = 1; i <= 6; i++) {
      let status = 'Available';
      if (i === 1) status = 'Available';
      else if (i <= 5) status = 'Occupied';
      else status = 'Reserved';

      insertBed.run(`bed-semi-${i}`, 'b1', 'Semi-Private', `SP-${300 + i}`, 'Double', status, 1, 'Oxygen', 'Shared-2', 3, 4, 'C', 1, 'Quiet');
    }

    // Private Ward Beds: 8 total (2 Available, 4 Occupied, 2 Reserved)
    for (let i = 1; i <= 8; i++) {
      let status = 'Available';
      if (i <= 2) status = 'Available';
      else if (i <= 6) status = 'Occupied';
      else status = 'Reserved';

      insertBed.run(`bed-pvt-${i}`, 'b1', 'Private', `PVT-${400 + i}`, 'Single Suite', status, 1, 'Oxygen', 'Private', 2, 5, 'D', 1, 'Quiet');
    }

    // Emergency Beds: 13 total (4 Available, 3 Occupied, 6 Reserved)
    for (let i = 1; i <= 13; i++) {
      let status = 'Available';
      if (i <= 4) status = 'Available';
      else if (i <= 7) status = 'Occupied';
      else status = 'Reserved';

      insertBed.run(`bed-er-${i}`, 'b1', 'Emergency', `ER-${500 + i}`, 'Bays', status, 1, 'Portable', 'Shared', 1, 1, 'E', 0, 'Loud');
    }

    // Insert Admissions corresponding to occupied beds
    const insertAdmission = db.prepare(`
      INSERT INTO admission (id, patient_token, bed_id, department_id, admitted_at, expected_discharge_at, status, discharge_ready)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Add occupied admissions for ICU, General Ward, Semi-Private, Private
    let admIndex = 1;
    // ICU Occupied (17)
    for (let i = 7; i <= 23; i++) {
      insertAdmission.run(`adm-icu-${i}`, `pt-icu-${i}`, `bed-icu-${i}`, 'dept-icu', '2026-08-10 10:00:00', '2026-08-15 12:00:00', 'admitted', 0);
    }
    // Semi-Private Occupied (3)
    for (let i = 2; i <= 4; i++) {
      insertAdmission.run(`adm-sp-${i}`, `pt-sp-${i}`, `bed-semi-${i}`, 'dept-med', '2026-08-11 09:00:00', '2026-08-14 11:00:00', 'admitted', 0);
    }
    // General Ward Occupied (6)
    for (let i = 5; i <= 10; i++) {
      insertAdmission.run(`adm-gen-${i}`, `pt-gen-${i}`, `bed-gen-${i}`, 'dept-gen', '2026-08-12 14:00:00', '2026-08-16 10:00:00', 'admitted', 0);
    }
    // Private Ward Occupied (2)
    for (let i = 3; i <= 4; i++) {
      insertAdmission.run(`adm-pvt-${i}`, `pt-pvt-${i}`, `bed-pvt-${i}`, 'dept-pvt', '2026-08-09 16:00:00', '2026-08-14 09:00:00', 'admitted', 1);
    }

    // Insert Departments
    const insertDept = db.prepare(`
      INSERT INTO departments (id, name, type, capacity, target_occupancy_pct)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertDept.run('dept-icu', 'ICU', 'Critical Care', 30, 85);
    insertDept.run('dept-er', 'Emergency', 'Emergency', 20, 75);
    insertDept.run('dept-gen', 'General Ward', 'Inpatient', 50, 90);
    insertDept.run('dept-surg', 'Surgery', 'Surgical', 25, 80);

    // Insert Staff Roster (for shift/staffing questions)
    const insertRoster = db.prepare(`
      INSERT INTO staff_roster (id, area, area_label, role, shift, headcount, assigned_load, load_per_staff)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertRoster.run('ros-1', 'ICU', 'Intensive Care Unit', 'Nurse', 'Night', 4, 18, 4); // Short-staffed! 18 patients / 4 nurses = 4.5 load per staff
    insertRoster.run('ros-2', 'ER', 'Emergency Room', 'Nurse', 'Night', 6, 12, 2);
    insertRoster.run('ros-3', 'General Ward', 'General Ward 2B', 'Nurse', 'Night', 3, 15, 5); // Short-staffed!
    insertRoster.run('ros-4', 'Pediatrics', 'Children Ward', 'Nurse', 'Night', 5, 8, 2);
    insertRoster.run('ros-5', 'ICU', 'Intensive Care Unit', 'Doctor', 'Night', 2, 18, 9);

    // Insert Lab Orders & Results
    const insertLabOrder = db.prepare(`
      INSERT INTO lab_orders (id, visit_id, patient_token, ordered_by, status, priority, ordered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLabResult = db.prepare(`
      INSERT INTO lab_results (id, order_id, patient_token, test_name, test_code, result_value, flag, reference_range, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLabOrder.run('lo-1', 'v-101', 'pt-101', 'Dr. Neha', 'Completed', 'High', '2026-08-13 08:00:00');
    insertLabResult.run('lr-1', 'lo-1', 'pt-101', 'Complete Blood Count (CBC)', 'CBC001', '14.2', 'Normal', '12.0-16.0', 'g/dL');
    insertLabOrder.run('lo-2', 'v-102', 'pt-102', 'Dr. Arjun', 'Pending', 'Urgent', '2026-08-13 10:15:00');

    // Insert Claims
    const insertClaim = db.prepare(`
      INSERT INTO claims (id, patient_token, visit_id, tpa_name, claim_amount, status, created_at, approved_amount, claim_number, payer_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertClaim.run('cl-1', 'pt-101', 'v-101', 'Star Health', 45000.0, 'Approved', '2026-08-10 11:00:00', 42000.0, 'CLM-9001', 'Insurance');
    insertClaim.run('cl-2', 'pt-102', 'v-102', 'HDFC ERGO', 78000.0, 'Pending', '2026-08-12 15:30:00', 0, 'CLM-9002', 'Insurance');

    console.log('Database successfully seeded with realistic hospital data!');
  }
}

if (require.main === module) {
  runInit();
}

module.exports = { runInit, getDbInstance, DB_PATH };
