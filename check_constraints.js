const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const res = await pool.query(`
    SELECT
        conname AS constraint_name,
        pg_get_constraintdef(c.oid) AS constraint_definition
    FROM
        pg_constraint c
    JOIN
        pg_namespace n ON n.oid = c.connamespace
    WHERE
        contype IN ('u', 'p')
        AND conrelid = 'leads'::regclass;
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
check();
