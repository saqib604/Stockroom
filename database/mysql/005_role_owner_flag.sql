USE stockroom;

SET @owner_flag_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'roles'
    AND column_name = 'is_owner'
);
SET @owner_flag_sql = IF(
  @owner_flag_exists = 0,
  'ALTER TABLE roles ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT FALSE AFTER name',
  'SELECT 1'
);
PREPARE owner_flag_statement FROM @owner_flag_sql;
EXECUTE owner_flag_statement;
DEALLOCATE PREPARE owner_flag_statement;

UPDATE roles SET is_owner = (name = 'owner');