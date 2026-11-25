USE stockroom;

ALTER TABLE roles
  DROP INDEX uq_roles_name,
  ADD COLUMN store_id BIGINT UNSIGNED NULL AFTER id,
  ADD UNIQUE KEY uq_roles_store_name (store_id, name),
  ADD KEY idx_roles_store (store_id),
  ADD CONSTRAINT fk_roles_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
