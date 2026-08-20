import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = ["student", "parent", "teacher", "principal", "district_admin", "super_admin"] as const;
export type UserRole = typeof USER_ROLES[number];

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),      // null for Google-only accounts
  googleId: text("google_id").unique(),     // Google OAuth "sub"
  role: text("role").notNull(),             // UserRole
  emailVerified: boolean("email_verified").notNull().default(false),
  school: text("school"),                   // optional school name for educators
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
