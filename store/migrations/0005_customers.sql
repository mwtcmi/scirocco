-- Customers: one record per email (no accounts needed). Built from orders; Pitwall shows and edits them.
-- marketing: 'opt_in' only from the checkout checkbox (or set in Pitwall at the customer's request),
-- 'opt_out' from an unsubscribe or a request, otherwise 'unknown' (never asked or didn't tick the box).
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  billing TEXT,
  shipping TEXT,
  addresses TEXT NOT NULL DEFAULT '[]',
  marketing TEXT NOT NULL DEFAULT 'unknown' CHECK (marketing IN ('opt_in', 'opt_out', 'unknown')),
  marketing_at INTEGER,
  marketing_source TEXT,
  source TEXT NOT NULL DEFAULT 'online',
  stripe_customer TEXT,
  notes TEXT NOT NULL DEFAULT '',
  orders_count INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  first_order_at INTEGER,
  last_order_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customers_recent ON customers(last_order_at);
ALTER TABLE orders ADD COLUMN customer_id INTEGER;
ALTER TABLE orders ADD COLUMN billing TEXT;
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);

-- Backfill from orders placed so far, then from back-in-stock requests.
INSERT OR IGNORE INTO customers (email, name, phone, shipping, source, orders_count, total_spent, first_order_at, last_order_at, created_at, updated_at)
  SELECT lower(email), max(name), max(phone), max(ship_to),
    CASE max(fulfillment) WHEN 'event' THEN 'event' WHEN 'table' THEN 'table' ELSE 'online' END,
    count(*), sum(coalesce(amount_total, 0)), min(created_at), max(created_at), min(created_at), max(created_at)
  FROM orders WHERE email IS NOT NULL AND email <> '' GROUP BY lower(email);
UPDATE orders SET customer_id = (SELECT id FROM customers c WHERE c.email = lower(orders.email)) WHERE email IS NOT NULL AND email <> '';
INSERT OR IGNORE INTO customers (email, source, created_at, updated_at)
  SELECT email, 'notify', min(created_at), min(created_at) FROM restock_requests GROUP BY email;
