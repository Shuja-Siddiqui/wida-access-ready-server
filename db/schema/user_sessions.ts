import { index, pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const userSessionsTable = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    userType: text("user_type").notNull(), // 'student' | 'teacher' | 'parent' | ...
    tokenHash: text("token_hash").notNull().unique(),
    /** Client user-agent captured at login for session context. */
    userAgent: text("user_agent"),
    /** Client IP (or first x-forwarded-for hop) captured at login. */
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("user_sessions_user_id_user_type_idx").on(table.userId, table.userType),
  ],
);

export type UserSession = typeof userSessionsTable.$inferSelect;
