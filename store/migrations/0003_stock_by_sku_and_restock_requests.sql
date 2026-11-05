-- Stock is now keyed by SKU. Copy today's counts from the old keys; the old rows stay (unused) until a later
-- cleanup migration, so a worker that hasn't redeployed yet keeps working for the few seconds in between.
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'RUASVS20', qty, updated_at FROM stock WHERE key = 'jug/color/Red';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'WUASVS20', qty, updated_at FROM stock WHERE key = 'jug/color/White';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'YUASVS20', qty, updated_at FROM stock WHERE key = 'jug/color/Yellow';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'KUASVS20', qty, updated_at FROM stock WHERE key = 'jug/color/Kawi Green';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'OUAS20VS', qty, updated_at FROM stock WHERE key = 'jug/color/Orange';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'BLKUASVS20', qty, updated_at FROM stock WHERE key = 'jug/color/Black';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'LTP', qty, updated_at FROM stock WHERE key = 'pump';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'BLKR20', qty, updated_at FROM stock WHERE key = 'ripper';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'TUFFSPOUT', qty, updated_at FROM stock WHERE key = 'tuffspout';
INSERT OR IGNORE INTO stock (key, qty, updated_at) SELECT 'SpoutBender', qty, updated_at FROM stock WHERE key = 'spoutbender';

-- "Email me when it's back": one request per SKU and email. notified_at is set when the email goes out.
CREATE TABLE IF NOT EXISTS restock_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  notified_at INTEGER,
  UNIQUE (sku, email)
);
CREATE INDEX IF NOT EXISTS restock_waiting ON restock_requests(sku, notified_at);
