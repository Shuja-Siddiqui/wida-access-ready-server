/**
 * AWS: create/update a principal for Kristi's first school in her district.
 * Usage: node scripts/seed-kristi-principal-aws.mjs [email] [password]
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { loadRdsConfigFromEnv, createClient } from "./apply-migrations.mjs";

const DISTRICT_ADMIN_EMAIL = "kristi.costellow@gmail.com";
const PRINCIPAL_EMAIL = (process.argv[2] ?? "kristi.principal.demo@accessready.test").trim().toLowerCase();
const PRINCIPAL_NAME = "Demo Principal";
const PLAIN_PASSWORD = process.argv[3] ?? "12345678";

const config = loadRdsConfigFromEnv();
const client = createClient(config);
await client.connect();
console.log("RDS:", config.host);

const da = await client.query(
  `SELECT da.district_id FROM district_admins da
   JOIN users u ON u.id = da.user_id WHERE lower(u.email) = $1`,
  [DISTRICT_ADMIN_EMAIL],
);
if (!da.rows.length) {
  console.error("District admin not found:", DISTRICT_ADMIN_EMAIL);
  process.exit(1);
}
const districtId = da.rows[0].district_id;

const schools = await client.query(
  `SELECT id, name, school_code FROM schools WHERE district_id = $1 ORDER BY created_at ASC NULLS LAST, name`,
  [districtId],
);
if (!schools.rows.length) {
  console.error("No schools in Kristi district — add a school first.");
  process.exit(1);
}
const school = schools.rows[0];
console.log("School:", school.name, school.id);

const passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 12);

const existing = await client.query(
  `SELECT u.id AS user_id, p.id AS profile_id FROM users u
   LEFT JOIN profiles p ON p.user_id = u.id
   WHERE lower(u.email) = $1 AND u.role = 'principal'`,
  [PRINCIPAL_EMAIL],
);

let userId;
let profileId;

if (existing.rows.length) {
  userId = existing.rows[0].user_id;
  profileId = existing.rows[0].profile_id;
  await client.query(
    `UPDATE users SET name = $1, password_hash = $2, email_verified = true, is_active = true WHERE id = $3`,
    [PRINCIPAL_NAME, passwordHash, userId],
  );
  if (profileId) {
    await client.query(`UPDATE profiles SET school_id = $1 WHERE id = $2`, [school.id, profileId]);
  } else {
    profileId = randomUUID();
    await client.query(`INSERT INTO profiles (id, user_id, school_id) VALUES ($1, $2, $3)`, [
      profileId,
      userId,
      school.id,
    ]);
  }
  console.log("Updated existing principal");
} else {
  userId = randomUUID();
  profileId = randomUUID();
  await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, email_verified, is_active)
     VALUES ($1, $2, $3, $4, 'principal', true, true)`,
    [userId, PRINCIPAL_EMAIL, PRINCIPAL_NAME, passwordHash],
  );
  await client.query(`INSERT INTO profiles (id, user_id, school_id) VALUES ($1, $2, $3)`, [
    profileId,
    userId,
    school.id,
  ]);
  console.log("Created new principal");
}

await client.end();
console.log(`
Principal login (educator / administrator app):
  Email:    ${PRINCIPAL_EMAIL}
  Password: ${PLAIN_PASSWORD}
  School:   ${school.name}
  Profile:  ${profileId}
`);
