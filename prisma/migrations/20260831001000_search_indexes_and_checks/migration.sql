-- Constraints and indexes Prisma's schema language cannot express.
-- See domain-notes.md "Indexes / constraints not expressible in schema.prisma".

-- ---------------------------------------------------------------------------
-- 1. Fuzzy medicine search (pg_trgm)
-- ---------------------------------------------------------------------------
-- Backs the ILIKE '%term%' lookups in CatalogService.findAll. Without a
-- trigram GIN index those are sequential scans; with it Postgres can use the
-- index for both substring and similarity() ranking.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS medicines_name_trgm_idx
  ON medicines USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS medicines_generic_name_trgm_idx
  ON medicines USING GIN (generic_name gin_trgm_ops);

-- Exact-prefix barcode lookups stay on a btree.
CREATE INDEX IF NOT EXISTS medicines_barcode_idx
  ON medicines (barcode);

-- ---------------------------------------------------------------------------
-- 2. Batch location consistency
-- ---------------------------------------------------------------------------
-- Exactly one of warehouse_id / branch_id must be set, and it must agree with
-- location_type. Enforced in InventoryService too, but the DB is the backstop.
ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_location_type_consistency;

ALTER TABLE batches
  ADD CONSTRAINT batches_location_type_consistency CHECK (
    (location_type = 'WAREHOUSE' AND warehouse_id IS NOT NULL AND branch_id IS NULL)
    OR
    (location_type = 'BRANCH' AND branch_id IS NOT NULL AND warehouse_id IS NULL)
  );

-- A batch can never hold negative units.
ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_quantity_non_negative;

ALTER TABLE batches
  ADD CONSTRAINT batches_quantity_non_negative CHECK (quantity >= 0);

-- ---------------------------------------------------------------------------
-- 3. Review rating range
-- ---------------------------------------------------------------------------
ALTER TABLE reviews
  DROP CONSTRAINT IF EXISTS reviews_rating_range;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- 4. Stock cannot go negative
-- ---------------------------------------------------------------------------
-- The checkout transaction decrements with a conditional UPDATE
-- (WHERE quantity_available >= :qty), so this should never fire. It exists so
-- that a bug in any future write path fails loudly instead of silently
-- overselling a branch.
ALTER TABLE branch_inventory
  DROP CONSTRAINT IF EXISTS branch_inventory_quantity_non_negative;

ALTER TABLE branch_inventory
  ADD CONSTRAINT branch_inventory_quantity_non_negative CHECK (quantity_available >= 0);

-- ---------------------------------------------------------------------------
-- 5. Order money sanity
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_amounts_non_negative;

ALTER TABLE orders
  ADD CONSTRAINT orders_amounts_non_negative CHECK (
    subtotal >= 0 AND delivery_fee >= 0 AND discount_total >= 0 AND total >= 0
  );

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_quantity_positive;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_quantity_positive;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0);

-- ---------------------------------------------------------------------------
-- 6. Coupon discount sanity
-- ---------------------------------------------------------------------------
ALTER TABLE coupons
  DROP CONSTRAINT IF EXISTS coupons_discount_value_range;

ALTER TABLE coupons
  ADD CONSTRAINT coupons_discount_value_range CHECK (
    (discount_type = 'PERCENTAGE' AND discount_value > 0 AND discount_value <= 100)
    OR
    (discount_type = 'FIXED' AND discount_value > 0)
  );

ALTER TABLE coupons
  DROP CONSTRAINT IF EXISTS coupons_validity_window;

ALTER TABLE coupons
  ADD CONSTRAINT coupons_validity_window CHECK (valid_to > valid_from);

-- ---------------------------------------------------------------------------
-- 7. Hot-path indexes the schema does not declare
-- ---------------------------------------------------------------------------
-- Branch dashboards list "today's orders by status"; the schema has
-- (branch_id, status) but not the created_at ordering used alongside it.
CREATE INDEX IF NOT EXISTS orders_branch_created_idx
  ON orders (branch_id, created_at DESC);

-- Pharmacist review queue: "orders at my branch awaiting Rx review".
CREATE INDEX IF NOT EXISTS orders_prescription_status_idx
  ON orders (prescription_status)
  WHERE prescription_status = 'PENDING_REVIEW';

-- Per-user coupon-usage counting during checkout validation.
CREATE INDEX IF NOT EXISTS coupon_usages_coupon_user_idx
  ON coupon_usages (coupon_id, user_id);
