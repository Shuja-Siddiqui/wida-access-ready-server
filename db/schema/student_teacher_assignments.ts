import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { profilesTable } from "./profiles";

/** Many-to-many: a student can have multiple assigned teachers at a school. */
export const studentTeacherAssignmentsTable = pgTable(
  "student_teacher_assignments",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    teacherProfileId: uuid("teacher_profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.teacherProfileId] })],
);