const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const { rows } = await pool.query("SELECT COUNT(*) FROM leads");
  console.log('Lead count:', rows[0].count);
  
  const { rows: dups } = await pool.query("SELECT LOWER(TRIM(school_name)) as name, COUNT(*) FROM leads GROUP BY name HAVING COUNT(*) > 1");
  console.log('Duplicate count:', dups.length);
  if (dups.length > 0) console.table(dups);
  
  process.exit();
}
run();
