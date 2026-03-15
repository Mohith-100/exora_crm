const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query("DELETE FROM leads WHERE school_name ILIKE '%test%' OR school_name ILIKE '%unknown%' RETURNING school_name");
  console.log('Deleted:', res.rows);
  process.exit();
}
run();
