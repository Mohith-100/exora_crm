const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
async function run() {
  try {
    console.log('Connecting to database...');
    const res = await pool.query('SELECT name, email, role FROM users');
    console.table(res.rows);
    process.exit();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
}
run();
