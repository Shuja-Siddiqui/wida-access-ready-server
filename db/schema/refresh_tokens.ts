import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

/**
 * Long-lived refresh tokens issued alongside every session token.
 * When a session token expires the client calls POST /api/auth/refresh
 * with the refresh token to get a new session+refresh pair.
 *
 * Security properties:
 *  - Single-use: used_at is set on consumption; a used token is rejected.
 *  - Rotation: every refresh issues a brand-new refresh token so the old one
 *    is permanently invalidated — limits the blast radius of token theft.
 *  - 90-day TTL: much longer than the 30-day session token so users rarely
 *    need to re-enter credentials.
 */
export const refreshTokensTable = pgTable("refresh_tokens", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull(),
  userType:    text("user_type").notNull(),   // 'student' | 'teacher' | 'parent' | ...
  tokenHash:   text("token_hash").notNull().unique(),
  expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RefreshToken = typeof refreshTokensTable.$inferSelect;
