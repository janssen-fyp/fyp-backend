const Database = require("better-sqlite3");

const db = new Database("route_history.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS route_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_location TEXT NOT NULL,
    destination TEXT NOT NULL,
    requested_mode TEXT,
    effective_mode TEXT,
    predicted_traffic REAL,
    threshold_value REAL,
    congestion_scenario TEXT,
    alternatives_count INTEGER,
    selected_route_id INTEGER,
    distance REAL,
    duration REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;