-- Project memberships must reference real users. Remove legacy orphan rows
-- created before the users table existed, then enforce referential integrity.
DELETE FROM user_project_roles membership
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE users.id = membership.user_id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_project_roles_user_id_fkey'
  ) THEN
    ALTER TABLE user_project_roles
      ADD CONSTRAINT user_project_roles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END
$$;
