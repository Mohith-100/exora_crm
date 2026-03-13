const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function fixWebsites() {
  try {
    console.log('🚀 Fixing website links...');
    const result = await pool.query('SELECT id, school_name, website FROM leads WHERE website IS NOT NULL AND website != \'\'');
    console.log(`Found ${result.rows.length} leads with websites.`);

    let fixedCount = 0;
    for (const row of result.rows) {
      let original = row.website;
      // Remove leading/trailing quotes, spaces
      let clean = original.trim().replace(/^['"\s]+|['"\s]+$/g, '');

      // If it has multiple single quotes at the end (as I saw in logs), clean them all
      clean = clean.replace(/['"]+$/, '');

      // Ensure it starts with http/https
      if (clean && !clean.startsWith('http') && !clean.startsWith('//')) {
        clean = 'https://' + clean;
      }

      if (clean !== original) {
        await pool.query('UPDATE leads SET website = $1 WHERE id = $2', [clean, row.id]);
        console.log(`✅ Fixed [${row.id}]: "${original}" -> "${clean}"`);
        fixedCount++;
      }
    }
    console.log(`\n✨ DONE! Fixed ${fixedCount} website links.`);
  } catch (err) {
    console.error('❌ Error fixing websites:', err);
  } finally {
    await pool.end();
  }
}

fixWebsites();
