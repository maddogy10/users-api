# --- 1. SET YOUR VARIABLES ---

# Get this from your Render DB's "Info" tab, under "External Connection String"
export RENDER_DB_URL="postgresql://users_api_disc_user:fwc6V07hHiPCHvTprU9r6X62HA7vmiIh@dpg-d3u6520dl3ps73et4ghg-a.ohio-postgres.render.com/users_api_disc"

# Get this from Supabase: Project > Settings > Database > "Connection string" (use the "Session pooler" one)
# Make sure to replace [YOUR-PASSWORD] with your actual DB password
export SUPABASE_DB_URL="postgresql://postgres.ypxjrbesbjcwphekeaky:adzDjS6EYTfJErFc@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

# --- 2. DUMP THE RENDER DATABASE ---

# This command connects to your Render DB and exports its contents
# --clean: Adds commands to drop existing tables in the target before creating new ones
# --if-exists: Adds checks so it doesn't error if a table doesn't exist
# --no-owner: Skips dumping object ownership (Supabase manages its own roles)
# --no-privileges: Skips dumping access privileges
# -f: Specifies the output file name
echo "Dumping database from Render..."
pg_dump "$RENDER_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -f render_dump.sql

echo "Dump complete: render_dump.sql"


# --- 3. RESTORE TO SUPABASE DATABASE ---

# This command connects to your Supabase DB and runs the SQL file to import the data
echo "Restoring database to Supabase..."
psql "$SUPABASE_DB_URL" -f render_dump.sql

echo "Migration complete!"