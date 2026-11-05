-- Store settings edited in Pitwall. Values are JSON. Keys:
--   order_copies: list of emails that get a blind copy of every order confirmation (missing = Mike only).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
