const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const res = await pool.query("SELECT LOWER(TRIM(school_name)) as name, COUNT(*) FROM leads GROUP BY name HAVING COUNT(*) > 1 ORDER BY count DESC");
  console.log('Duplicate Names Found:');
  console.table(res.rows);
  process.exit();
}
check();
