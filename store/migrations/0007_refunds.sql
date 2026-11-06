-- Refunds: Stripe's charge.refunded event records how much of an order was refunded.
--   payment_intent: the Stripe payment behind the order (links a refund to its order)
--   refunded_cents: total refunded so far (full or partial); refunded_at: when the last refund came in
-- A fully refunded order drops out of sales, top sellers and "to hand over", and out of the customer's totals.
ALTER TABLE orders ADD COLUMN payment_intent TEXT;
ALTER TABLE orders ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
CREATE INDEX IF NOT EXISTS orders_payment_intent ON orders(payment_intent);
