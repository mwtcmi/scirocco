-- 799 News (mailing list in Resend). Customers are synced to Resend's "799 News" topic and segment.
--   news_synced_at: when this customer's 799 News status was last sent to Resend
--   news_checked_at: when an unsubscribe was last checked for in Resend (hourly job)
ALTER TABLE customers ADD COLUMN news_synced_at INTEGER;
ALTER TABLE customers ADD COLUMN news_checked_at INTEGER;
-- Site sign-ups wait here until the person clicks the confirmation link (double opt-in).
CREATE TABLE IF NOT EXISTS signups (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
CREATE INDEX IF NOT EXISTS signups_email ON signups(email, created_at);
