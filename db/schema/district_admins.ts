import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { districtsTable } from "./districts";

export const districtAdminsTable = pgTable("district_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  districtId: uuid("district_id").references(() => districtsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDistrictAdminSchema = createInsertSchema(districtAdminsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDistrictAdmin = z.infer<typeof insertDistrictAdminSchema>;
export type DistrictAdmin = typeof districtAdminsTable.$inferSelect;
