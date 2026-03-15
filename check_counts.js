const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT domain, COUNT(*) FROM leads GROUP BY domain");
  console.table(rows);
  process.exit();
}
check();
