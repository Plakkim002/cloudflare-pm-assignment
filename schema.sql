CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  sentiment REAL,
  category TEXT,
  user_type TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Severity scores table (for tracking patterns)
CREATE TABLE IF NOT EXISTS severity_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  score REAL NOT NULL,
  feedback_count INTEGER,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
