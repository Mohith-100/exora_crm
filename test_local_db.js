const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'ExoraSolutions@2004',
  database: 'exora_crm',
  port: 5432,
});
async function run() {
  try {
    const res = await pool.query('SELECT name, email FROM users');
    console.table(res.rows);
  } catch (e) {
    console.error('Local connection failed:', e.message);
  } finally {
     process.exit();
  }
}
run();
