// Core auth & role tables (new unified schema)
export * from "./users";
export * from "./districts";
export * from "./schools";

// Role-specific profile tables — each linked to users via userId FK
export * from "./profiles";        // teacher | parent | principal
export * from "./district_admins"; // district_admin

// Student + learning tables
export * from "./students";
export * from "./student_levels";
export * from "./sessions";
export * from "./session_answers";
export * from "./student_object_mastery";

// Auth session management
export * from "./user_sessions";
export * from "./password_reset_tokens";
export * from "./email_verification_tokens";
export * from "./invitations";

// Billing & payments
export * from "./billing";
export * from "./billing_config";

// District seat allocations — tracks how many seats a district admin assigns to each school
export * from "./district_seat_allocations";

// Long-lived refresh tokens — issued alongside every session token for transparent re-auth
export * from "./refresh_tokens";

// Media library — images, videos, audio files, and documents stored in S3
export * from "./media_assets";

// Library — stores S3 key, tags, description and detection results for detect-page uploads
export * from "./library";

// Content hierarchy: Theme → Topic → Library images (via join table)
export * from "./themes";
export * from "./topics";
export * from "./library_topics";
