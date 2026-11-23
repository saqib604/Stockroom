ALTER TABLE inventory
  DROP CHECK chk_inventory_nonnegative,
  DROP INDEX idx_inventory_stock,
  CHANGE COLUMN quantity_on_hand qty_warehouse INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN qty_display INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id,
  ADD COLUMN qty_home INT UNSIGNED NOT NULL DEFAULT 0 AFTER qty_warehouse,
  ADD CONSTRAINT chk_inventory_nonnegative CHECK (qty_display >= 0 AND qty_warehouse >= 0 AND qty_home >= 0);