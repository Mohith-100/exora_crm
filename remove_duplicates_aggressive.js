const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function removeDuplicates() {
    try {
        console.log("🔍 Finding duplicate leads by School Name (Aggressive)...");
        
        const findQuery = `
            SELECT 
                LOWER(TRIM(school_name)) as name, 
                COUNT(*), 
                ARRAY_AGG(id ORDER BY (
                    CASE WHEN phone IS NOT NULL AND phone != '' THEN 2 ELSE 0 END +
                    CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END
                ) DESC, id ASC) as ids
            FROM leads 
            GROUP BY LOWER(TRIM(school_name))
            HAVING COUNT(*) > 1
        `;
        
        const { rows } = await pool.query(findQuery);
        
        let deletedCount = 0;

        for (const row of rows) {
            const keepId = row.ids[0]; // Kept based on presence of phone/website
            const duplicateIds = row.ids.slice(1);
            
            console.log(`- Found ${row.ids.length} duplicates for "${row.name}". Keeping ID: ${keepId}.`);
            
            const deleteRes = await pool.query('DELETE FROM leads WHERE id = ANY($1)', [duplicateIds]);
            deletedCount += deleteRes.rowCount;
        }

        console.log(`\n✅ Done! Deleted ${deletedCount} duplicate entries.`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

removeDuplicates();
