const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const res = await pool.query("SELECT LOWER(TRIM(address)) as addr, COUNT(*) FROM leads WHERE address IS NOT NULL AND address != '' GROUP BY addr HAVING COUNT(*) > 1 ORDER BY count DESC");
  console.log('Duplicate Addresses Found:');
  console.table(res.rows);
  process.exit();
}
check();
