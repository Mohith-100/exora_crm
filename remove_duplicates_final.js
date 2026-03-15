const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function removeDuplicates() {
    try {
        console.log("🔍 Starting Duplicate Cleanup...");

        // Phase 1: Group by name and address (very safe)
        const res1 = await pool.query(`
            DELETE FROM leads 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM leads 
                GROUP BY LOWER(TRIM(school_name)), LOWER(TRIM(address))
            )
            RETURNING id
        `);
        console.log(`✅ Phase 1: Removed ${res1.rowCount} name+address duplicates.`);

        // Phase 2: Group by name and phone (safe)
        const res2 = await pool.query(`
            DELETE FROM leads 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM leads 
                WHERE phone IS NOT NULL AND phone != '' AND phone != '—'
                GROUP BY LOWER(TRIM(school_name)), TRIM(phone)
                UNION
                SELECT id FROM leads WHERE phone IS NULL OR phone = '' OR phone = '—'
            )
            RETURNING id
        `);
        console.log(`✅ Phase 2: Removed ${res2.rowCount} name+phone duplicates.`);

        // Phase 3: Aggressive grouping by name only (for cases where address is missing or slightly different)
        const res3 = await pool.query(`
            DELETE FROM leads 
            WHERE id NOT IN (
                SELECT FIRST_VALUE(id) OVER (
                    PARTITION BY LOWER(TRIM(school_name)) 
                    ORDER BY 
                      (CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END + 
                       CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) DESC, 
                      id ASC
                )
                FROM leads
            )
            RETURNING id
        `);
        console.log(`✅ Phase 3: Removed ${res3.rowCount} name-only duplicates.`);

        // Final count
        const { rows: stats } = await pool.query("SELECT COUNT(*) FROM leads");
        console.log(`📊 Final lead count: ${stats[0].count}`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

removeDuplicates();
