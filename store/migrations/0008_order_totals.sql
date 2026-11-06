-- The money breakdown of each order, as Stripe charged it (cents). Older orders keep only amount_total.
ALTER TABLE orders ADD COLUMN amount_subtotal INTEGER;
ALTER TABLE orders ADD COLUMN amount_shipping INTEGER;
ALTER TABLE orders ADD COLUMN amount_tax INTEGER;
ALTER TABLE orders ADD COLUMN amount_discount INTEGER;
