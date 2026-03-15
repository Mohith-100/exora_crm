const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const res = await pool.query("SELECT TRIM(phone) as ph, COUNT(*) FROM leads WHERE phone IS NOT NULL AND phone != '' AND phone != '—' GROUP BY ph HAVING COUNT(*) > 1 ORDER BY count DESC");
  console.log('Duplicate Phones Found:');
  console.table(res.rows);
  process.exit();
}
check();
