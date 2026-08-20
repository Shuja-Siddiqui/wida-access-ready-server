import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const schoolsTable = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Null = independent school not affiliated with a district
  districtId: uuid("district_id").references(() => districtsTable.id),
  name: text("name").notNull(),
  state: text("state"),
  // Short code teachers/students use to join this school (e.g. "WASH-042")
  schoolCode: text("school_code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSchoolSchema = createInsertSchema(schoolsTable).omit({ id: true, createdAt: true });
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schoolsTable.$inferSelect;
