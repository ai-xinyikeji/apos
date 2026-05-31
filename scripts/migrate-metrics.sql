-- Migration: Add metrics table for Growth OS
-- Date: 2026-05-26

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  properties TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_metrics_event ON metrics(event);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);

-- Insert sample data for testing
INSERT INTO metrics (event, properties, timestamp) VALUES
  ('feature_used', '{"feature":"ProtoBuilder","duration":5000}', datetime('now', '-1 day')),
  ('feature_used', '{"feature":"ReviewBot","duration":3000}', datetime('now', '-1 day')),
  ('feature_used', '{"feature":"SignalCollector","duration":2000}', datetime('now', '-2 days')),
  ('page_view', '{"page":"/prototypes"}', datetime('now', '-1 day')),
  ('page_view', '{"page":"/insights"}', datetime('now', '-1 day')),
  ('page_view', '{"page":"/workflows"}', datetime('now', '-2 days')),
  ('agent_execution', '{"agentName":"ProtoBuilder","success":true,"duration":5000}', datetime('now', '-1 day')),
  ('agent_execution', '{"agentName":"ReviewBot","success":true,"duration":3000}', datetime('now', '-1 day')),
  ('agent_execution', '{"agentName":"SignalCollector","success":true,"duration":2000}', datetime('now', '-2 days'));

SELECT 'Migration completed successfully!' as message;
