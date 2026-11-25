CREATE DATABASE IF NOT EXISTS stockroom CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE stockroom;

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  permission_key VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_permissions_key (permission_key)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE stores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(40) NULL,
  address_line1 VARCHAR(180) NULL,
  address_line2 VARCHAR(180) NULL,
  city VARCHAR(100) NULL,
  region VARCHAR(100) NULL,
  postal_code VARCHAR(24) NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'US',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id), KEY idx_stores_name (name)
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_users_email (email), KEY idx_users_active (is_active, deleted_at)
) ENGINE=InnoDB;

CREATE TABLE store_users (
  store_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, user_id),
  CONSTRAINT fk_store_users_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_store_users_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_store_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE registers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(30) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_registers_store_code (store_id, code),
  CONSTRAINT fk_registers_store FOREIGN KEY (store_id) REFERENCES stores(id)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_categories_store_name (store_id, name), KEY idx_categories_parent (parent_id),
  CONSTRAINT fk_categories_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  sku VARCHAR(80) NOT NULL,
  barcode VARCHAR(100) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  reorder_level INT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  in_demand BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_products_store_sku (store_id, sku), UNIQUE KEY uq_products_store_barcode (store_id, barcode),
  KEY idx_products_store_name (store_id, name), KEY idx_products_category (category_id), KEY idx_products_active (store_id, is_active, deleted_at),
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT chk_products_prices CHECK (cost_price >= 0 AND selling_price >= 0 AND tax_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE inventory (
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty_display INT UNSIGNED NOT NULL DEFAULT 0,
  qty_warehouse INT UNSIGNED NOT NULL DEFAULT 0,
  qty_home INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, product_id),
  CONSTRAINT fk_inventory_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_inventory_nonnegative CHECK (qty_display >= 0 AND qty_warehouse >= 0 AND qty_home >= 0)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(40) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id), KEY idx_customers_store_name (store_id, last_name, first_name), KEY idx_customers_store_email (store_id, email),
  CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores(id)
) ENGINE=InnoDB;

CREATE TABLE sales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  register_id BIGINT UNSIGNED NULL,
  customer_id BIGINT UNSIGNED NULL,
  cashier_user_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(50) NOT NULL,
  status ENUM('completed','voided','refunded') NOT NULL DEFAULT 'completed',
  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  notes VARCHAR(500) NULL,
  sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_sales_store_receipt (store_id, receipt_number),
  KEY idx_sales_store_sold (store_id, sold_at), KEY idx_sales_customer (customer_id), KEY idx_sales_cashier (cashier_user_id),
  CONSTRAINT fk_sales_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_sales_register FOREIGN KEY (register_id) REFERENCES registers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id),
  CONSTRAINT chk_sales_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE sale_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  sku_snapshot VARCHAR(80) NOT NULL,
  name_snapshot VARCHAR(180) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  line_total DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id), KEY idx_sale_items_sale (sale_id), KEY idx_sale_items_product (product_id),
  CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT chk_sale_items_values CHECK (quantity > 0 AND unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id BIGINT UNSIGNED NOT NULL,
  method ENUM('cash','card','gift_card','store_credit','other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference VARCHAR(120) NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_payments_sale (sale_id),
  CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  sale_id BIGINT UNSIGNED NULL,
  movement_type ENUM('opening','sale','restock','adjustment','return','void') NOT NULL,
  quantity_delta INT NOT NULL,
  quantity_after INT UNSIGNED NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_movements_store_date (store_id, created_at), KEY idx_movements_product_date (product_id, created_at),
  CONSTRAINT fk_movements_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_movements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_movements_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
  CONSTRAINT chk_movements_delta CHECK (quantity_delta <> 0)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  ip_address VARBINARY(16) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_audit_store_date (store_id, created_at), KEY idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE store_settings (
  store_id BIGINT UNSIGNED NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, setting_key),
  CONSTRAINT fk_settings_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE data_exports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  export_type ENUM('products','sales','customers','inventory') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  status ENUM('queued','completed','failed') NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id), KEY idx_exports_store_date (store_id, created_at),
  CONSTRAINT fk_exports_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_exports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO roles (name, is_owner, description) VALUES
  ('owner', TRUE, 'Full access to the store'),
  ('manager', FALSE, 'Manage products, inventory, and reporting'),
  ('cashier', FALSE, 'Process sales and manage customers');

INSERT INTO permissions (permission_key, description) VALUES
  ('products.read', 'View the product catalog'),
  ('products.write', 'Create and update products'),
  ('inventory.adjust', 'Restock and adjust inventory'),
  ('sales.read', 'View sales records'),
  ('sales.create', 'Complete checkout'),
  ('customers.read', 'View customer records and balances'),
  ('customers.write', 'Manage customer records'),
  ('reports.read', 'View business reports'),
  ('settings.write', 'Manage store settings'),
  ('users.write', 'Manage store users');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'owner';
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('products.read','products.write','inventory.adjust','sales.read','sales.create','customers.read','customers.write','reports.read') WHERE r.name = 'manager';
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('products.read','sales.create','customers.read','customers.write') WHERE r.name = 'cashier';
