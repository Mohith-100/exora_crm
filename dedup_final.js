const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  console.log("🧹 Deduplicating leads (Simple & Robust)...");

  // Keep the most "complete" lead for each name (prefer those with phone/website)
  const dedupSql = `
    DELETE FROM leads 
    WHERE id NOT IN (
      SELECT DISTINCT ON (LOWER(TRIM(school_name))) id
      FROM leads
      ORDER BY LOWER(TRIM(school_name)), 
               (CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END + 
                CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) DESC,
               id ASC
    )
  `;

  const res = await pool.query(dedupSql);
  console.log(`✅ Removed ${res.rowCount} duplicate leads.`);
  
  const stats = await pool.query("SELECT COUNT(*) FROM leads");
  console.log(`📊 Final lead count: ${stats.rows[0].count}`);
  
  process.exit();
}
fix();
