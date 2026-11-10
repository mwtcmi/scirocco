-- Dealer cost per product (cart key), in cents. Private: kept in the database, never in the public repo.
-- Set in Pitwall -> Products.
CREATE TABLE IF NOT EXISTS product_costs (cart TEXT PRIMARY KEY, cents INTEGER NOT NULL CHECK (cents >= 0), updated_at INTEGER NOT NULL DEFAULT 0);
