-- Allow the same email for different user roles (e.g. teacher + principal accounts).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_role_unique" ON "users" ("email", "role");
