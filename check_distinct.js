const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const res = await pool.query("SELECT DISTINCT domain FROM leads");
  console.log('Available domains:', res.rows.map(r => `[${r.domain}]`));
  process.exit();
}
check();
