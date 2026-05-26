-- WMS zbieranie: powiązanie rekordu Pick z wózkiem (audyt + widok /wozki).
ALTER TABLE picks ADD COLUMN cart_id INTEGER NULL REFERENCES carts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_picks_cart_id ON picks(cart_id);
