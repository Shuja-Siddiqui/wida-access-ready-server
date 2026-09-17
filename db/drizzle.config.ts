import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env — read api-server/.env when you run npm run db:push
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to api-server/.env, then run npm run db:push from api-server.");
}

export default defineConfig({
  // Relative to process.cwd() (api-server root when you run npm run db:push).
  schema: "./db/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
