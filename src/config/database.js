import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DB_URL) {
  throw new Error("DB_URL is required");
}

export const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
