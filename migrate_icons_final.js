const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const updates = {
    'it': 'monitor',
    'auditing': 'clipboard-check',
    'restaurent': 'utensils-crossed',
    'supermarket': 'shopping-cart',
    'college': 'graduation-cap',
    'school': 'school',
    'gym': 'dumbbell',
    'manufacturing': 'factory',
    'hospital': 'hospital',
    'salon': 'scissors'
  };

  for (const [name, icon] of Object.entries(updates)) {
    await pool.query('UPDATE domains SET icon = $1 WHERE name = $2', [icon, name]);
    console.log(`Updated ${name} to ${icon}`);
  }

  await pool.end();
}
run();
