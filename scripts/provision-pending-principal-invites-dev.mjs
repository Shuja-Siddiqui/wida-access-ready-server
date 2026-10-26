/**
 * Backfill: create school + principal user for open principal invites that only
 * have metadata (pre-provision flow). Usage: node scripts/provision-pending-principal-invites-dev.mjs [districtAdminEmail]
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const adminEmail = (process.argv[2] ?? "dadmin@gmail.com").trim().toLowerCase();
const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
const client = new pg.Client({ connectionString: conn });
await client.connect();

const da = await client.query(
  `SELECT da.id FROM district_admins da JOIN users u ON u.id = da.user_id WHERE lower(u.email) = $1`,
  [adminEmail],
);
if (!da.rows.length) {
  console.error("District admin not found");
  process.exit(1);
}
const inviterId = da.rows[0].id;

const invites = await client.query(
  `SELECT id, invitee_email, invitee_name, metadata
   FROM invitations
   WHERE inviter_id = $1 AND invitee_role = 'principal' AND accepted_at IS NULL AND expires_at > now()`,
  [inviterId],
);

for (const inv of invites.rows) {
  let meta;
  try {
    meta = JSON.parse(inv.metadata ?? "{}");
  } catch {
    console.warn("Skip corrupt invite", inv.id);
    continue;
  }
  if (meta.schoolId && meta.profileId) {
    console.log("Already provisioned:", meta.schoolName, inv.invitee_email);
    continue;
  }
  if (!meta.schoolName || !meta.districtId) {
    console.warn("Skip invite missing school meta", inv.id);
    continue;
  }

  const existingUser = await client.query(
    `SELECT id FROM users WHERE lower(email) = lower($1) AND role = 'principal'`,
    [inv.invitee_email],
  );
  if (existingUser.rows.length) {
    console.log("Principal user already exists:", inv.invitee_email);
    continue;
  }

  await client.query("BEGIN");
  try {
    const school = await client.query(
      `INSERT INTO schools (name, district_id, state, school_code)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [meta.schoolName, meta.districtId, meta.state ?? null, meta.schoolCode ?? null],
    );
    const schoolId = school.rows[0].id;

    const user = await client.query(
      `INSERT INTO users (email, name, role, password_hash, email_verified, is_active)
       VALUES ($1, $2, 'principal', NULL, false, true) RETURNING id`,
      [inv.invitee_email.toLowerCase(), inv.invitee_name],
    );
    const userId = user.rows[0].id;

    const profile = await client.query(
      `INSERT INTO profiles (user_id, school_id) VALUES ($1, $2) RETURNING id`,
      [userId, schoolId],
    );
    const profileId = profile.rows[0].id;

    meta.schoolId = schoolId;
    meta.userId = userId;
    meta.profileId = profileId;

    await client.query(`UPDATE invitations SET metadata = $1 WHERE id = $2`, [
      JSON.stringify(meta),
      inv.id,
    ]);

    await client.query("COMMIT");
    console.log("Provisioned:", meta.schoolName, "→", inv.invitee_email, schoolId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

await client.end();
