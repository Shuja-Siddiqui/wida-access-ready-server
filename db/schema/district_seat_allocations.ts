import { pgTable, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { districtAdminsTable } from "./district_admins";
import { schoolsTable } from "./schools";

export const districtSeatAllocationsTable = pgTable(
  "district_seat_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    districtAdminId: uuid("district_admin_id")
      .notNull()
      .references(() => districtAdminsTable.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schoolsTable.id, { onDelete: "cascade" }),
    seatsAllocated: integer("seats_allocated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.districtAdminId, table.schoolId)],
);

export type DistrictSeatAllocation = typeof districtSeatAllocationsTable.$inferSelect;
