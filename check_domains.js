const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT id, school_name, domain FROM leads WHERE school_name ILIKE '%Bal Pharma%' OR school_name ILIKE '%Bangalore Spring%' OR school_name ILIKE '%Biesse India%'");
  rows.forEach(r => console.log(`${r.id} | ${r.school_name} | ${r.domain}`));
  process.exit();
}
check();
