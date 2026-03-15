const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT * FROM leads WHERE id = 349");
  console.log(rows);
  process.exit();
}
check();
