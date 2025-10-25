import express from "express";
import cors from "cors";
import { Pool } from "pg";
import dotenv from "dotenv";
import type { User } from "./user.ts";

dotenv.config();
interface QueryRequest extends express.Request {
  body: {
    query: string;
  };
}

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.get("/", (req: QueryRequest, res: express.Response) => {
  res.json({ message: "Hello, world" });
});

app.post(
  "/api/execute-sql",
  async (req: QueryRequest, res: express.Response) => {
    const { query } = req.body;

    try {
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (err) {
      console.error("Query error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Query failed",
      });
    }
  }
);

app.get("/api/users", async (req: express.Request, res: express.Response) => {
  try {
    const result =
      await pool.query < User >( "SELECT * FROM users ORDER BY id ASC"
);
    res.json(result.rows);
  } catch (err) {
    console.error("Query error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get(
  "/api/users/:id",
  async (req: express.Request, res: express.Response) => {
    try {
      const result = await pool.query<User>(
        "SELECT * FROM users WHERE id = $1",
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Query error:", err);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  }
);
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
