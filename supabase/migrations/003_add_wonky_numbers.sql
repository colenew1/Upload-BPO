-- Create wonky_numbers table for tracking suspicious values
CREATE TABLE IF NOT EXISTS wonky_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source_table TEXT NOT NULL CHECK (source_table IN ('behavioral_coaching', 'monthly_metrics', 'activity_metrics')),
  source_id UUID,
  client TEXT NOT NULL,
  organization TEXT,
  program TEXT,
  metric_name TEXT,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  original_value NUMERIC,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('negative', 'zero', 'too_large', 'percentage_over_100', 'suspicious_outlier')),
  notes TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- Index for filtering unresolved issues
CREATE INDEX idx_wonky_numbers_resolved ON wonky_numbers(resolved);

-- Index for source lookups
CREATE INDEX idx_wonky_numbers_source ON wonky_numbers(source_table, source_id);

-- Index for client filtering
CREATE INDEX idx_wonky_numbers_client ON wonky_numbers(client);
