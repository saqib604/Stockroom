USE stockroom;

INSERT INTO permissions (permission_key, description) VALUES
  ('settings.write', 'Manage store settings'),
  ('users.write', 'Manage store users and role permissions')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles AS r
JOIN permissions AS p ON p.permission_key IN ('settings.write', 'users.write')
WHERE r.is_owner = TRUE;