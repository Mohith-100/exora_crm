const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT * FROM domains");
  rows.forEach(r => console.log(`${r.id} | ${r.name} | ${r.label} | ${r.icon}`));
  process.exit();
}
check();
