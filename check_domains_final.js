const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const { rows } = await pool.query("SELECT DISTINCT domain FROM leads");
  console.log('Current domains in leads:', rows.map(r => r.domain));
  process.exit();
}
run();
