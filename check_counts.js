const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const res = await pool.query('SELECT domain, COUNT(*) FROM leads GROUP BY domain');
  console.log(res.rows);
  process.exit(0);
}
check();
