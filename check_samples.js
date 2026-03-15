const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkSamples() {
  const { rows } = await pool.query("SELECT school_name, address, phone FROM leads ORDER BY school_name LIMIT 100");
  console.table(rows);
  process.exit();
}
checkSamples();
