const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT id, school_name, domain FROM leads WHERE domain = 'school' AND (school_name ILIKE '%hospital%' OR school_name ILIKE '%gym%' OR school_name ILIKE '%fitness%' OR school_name ILIKE '%manufacturing%' OR school_name ILIKE '%industries%' OR school_name ILIKE '%clinic%' OR school_name ILIKE '%salon%')");
  console.log(`Found ${rows.length} potentially mis-categorized leads in 'school' domain.`);
  rows.forEach(r => console.log(`- ID: ${r.id}, Name: ${r.school_name}`));
  process.exit();
}
check();
