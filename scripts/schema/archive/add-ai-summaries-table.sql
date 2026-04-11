CREATE TABLE IF NOT EXISTS ai_summaries (
  cert_number INTEGER PRIMARY KEY,
  summary TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT DEFAULT 'claude-haiku-4-5-20251001',
  source TEXT DEFAULT 'api'
);
CREATE INDEX IF NOT EXISTS ai_summaries_generated_at_idx ON ai_summaries(generated_at);
