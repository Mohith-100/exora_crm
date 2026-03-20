const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const result = await pool.query('SELECT id, name, icon FROM domains');
  console.log('Current domains:', result.rows);

  const updates = {
    'school': 'school',
    'hospital': 'hospital',
    'gym': 'dumbbell',
    'it': 'monitor',
    'manufacturing': 'factory',
    'salon': 'scissors',
    'auditings': 'clipboard-check',
    'restaurents': 'utensils',
    'supermarket': 'shopping-cart',
    'colleges': 'graduation-cap'
  };

  for (const row of result.rows) {
    const icon = updates[row.name.toLowerCase()] || updates[row.name.toLowerCase().replace(/s$/, '')];
    if (icon) {
      await pool.query('UPDATE domains SET icon = $1 WHERE id = $2', [icon, row.id]);
      console.log(`Updated ${row.name} to ${icon}`);
    } else if (row.icon.length <= 2) {
      // It's probably an emoji, set to default
      await pool.query('UPDATE domains SET icon = $1 WHERE id = $2', ['layers', row.id]);
      console.log(`Updated ${row.name} (emoji) to layers`);
    }
  }

  await pool.end();
}
run();
