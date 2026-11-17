import bcrypt from "bcryptjs";
import { loadRdsConfigFromEnv, createClient } from "./apply-migrations.mjs";

const client = createClient(loadRdsConfigFromEnv());
await client.connect();
const r = await client.query(
  `SELECT id, email, role, password_hash, email_verified, is_active FROM users WHERE lower(email) = $1`,
  ["kristi.costellow@gmail.com"],
);
console.log(
  r.rows.map(({ password_hash, ...rest }) => ({
    ...rest,
    hasPassword: Boolean(password_hash),
  })),
);
const hash = r.rows[0]?.password_hash;
if (hash) {
  for (const p of ["hEllo@911.", "hEllo@911", "12345678"]) {
    console.log(p, await bcrypt.compare(p, hash));
  }
}
await client.end();
