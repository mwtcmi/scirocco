-- Shipments and tracking for ship orders. One order can have several shipments (partial shipping), and one shipment
-- several tracking numbers (several boxes).
--   tracking: JSON array of tracking numbers
--   items:    JSON array of { i, q }: i is the item's position in orders.items, q how many of it are in this shipment
--   emailed_at: when the customer was emailed about this shipment
-- orders.status for ship orders follows the shipments: 'new', 'partial' (some items shipped) or 'done' (all shipped).
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking TEXT NOT NULL DEFAULT '[]',
  items TEXT NOT NULL DEFAULT '[]',
  emailed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shipments_order ON shipments(session_id);
