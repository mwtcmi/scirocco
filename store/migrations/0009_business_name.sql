-- Optional business name from checkout (race teams, shops, companies). The person's own name stays in "name".
ALTER TABLE customers ADD COLUMN business TEXT;
ALTER TABLE orders ADD COLUMN business TEXT;
