import postgres from "postgres";

const connectionString = process.env.SUPADB_URL;
const sql = postgres(connectionString);

export default sql;
