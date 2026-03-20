const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`UPDATE domains SET icon = 'school' WHERE name = 'school'`);
  await pool.query(`UPDATE domains SET icon = 'dumbbell' WHERE name = 'gym'`);
  await pool.query(`UPDATE domains SET icon = 'factory' WHERE name = 'manufacturing'`);
  await pool.query(`UPDATE domains SET icon = 'hospital' WHERE name = 'hospital'`);
  await pool.query(`UPDATE domains SET icon = 'scissors' WHERE name = 'salon'`);
  console.log('Icons updated in DB');
  await pool.end();
}
run();
