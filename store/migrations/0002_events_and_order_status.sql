-- Events: where 799 will be, for paddock pickup and the "We'll be at..." line. Managed in Pitwall.
-- Dates are local (America/Detroit) calendar dates, YYYY-MM-DD. order_by is the last day to order ahead.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts TEXT NOT NULL,
  ends TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  where_to_find TEXT NOT NULL DEFAULT '',
  order_by TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_dates ON events(active, ends);

-- Orders: who to hand them to, and whether they've been handed over or shipped (Pitwall).
ALTER TABLE orders ADD COLUMN event_id TEXT;
ALTER TABLE orders ADD COLUMN name TEXT;
ALTER TABLE orders ADD COLUMN phone TEXT;
ALTER TABLE orders ADD COLUMN ship_to TEXT;
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE orders ADD COLUMN handled_at INTEGER;
CREATE INDEX IF NOT EXISTS orders_recent ON orders(created_at);
