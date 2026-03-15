const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT id, school_name, domain, pitch FROM leads WHERE domain = 'gym' AND pitch LIKE '%Parent Portal%'");
  console.log(`Found ${rows.length} gym leads with 'Parent Portal' in pitch.`);
  rows.forEach(r => console.log(`- ID: ${r.id}, Name: ${r.school_name}`));
  process.exit();
}
check();
