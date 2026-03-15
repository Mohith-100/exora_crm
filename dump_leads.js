const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT id, school_name FROM leads ORDER BY school_name");
  rows.forEach(r => console.log(`${r.id} | ${r.school_name}`));
  process.exit();
}
check();
