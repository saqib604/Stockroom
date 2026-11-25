USE stockroom;

INSERT INTO permissions (permission_key, description)
VALUES ('customers.read', 'View customer records and balances')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles AS r
JOIN permissions AS p ON p.permission_key = 'customers.read'
WHERE r.is_owner = TRUE
   OR EXISTS (
     SELECT 1
     FROM role_permissions AS existing_role_permission
     JOIN permissions AS existing_permission ON existing_permission.id = existing_role_permission.permission_id
     WHERE existing_role_permission.role_id = r.id
       AND existing_permission.permission_key = 'customers.write'
   );