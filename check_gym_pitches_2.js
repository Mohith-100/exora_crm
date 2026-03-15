const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
  const { rows } = await pool.query("SELECT id, school_name, domain, pitch FROM leads WHERE (school_name ILIKE '%gym%' OR school_name ILIKE '%fitness%') AND pitch IS NOT NULL LIMIT 10");
  rows.forEach(r => {
      console.log(`ID: ${r.id} | Name: ${r.school_name} | Domain: ${r.domain}`);
      if (r.pitch.includes('Parent Portal')) {
          console.log('  ⚠️ Pitch contains "Parent Portal"!');
      } else {
          console.log('  ✅ Pitch seems correct.');
      }
  });
  process.exit();
}
check();
