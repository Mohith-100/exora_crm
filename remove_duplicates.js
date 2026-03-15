const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function removeDuplicates() {
    try {
        console.log("🔍 Finding duplicate leads...");
        
        // Strategy: Group by school_name and address (case-insensitive and trimmed)
        const findQuery = `
            SELECT 
                LOWER(TRIM(school_name)) as name, 
                LOWER(TRIM(address)) as addr, 
                COUNT(*), 
                ARRAY_AGG(id ORDER BY id ASC) as ids
            FROM leads 
            GROUP BY LOWER(TRIM(school_name)), LOWER(TRIM(address))
            HAVING COUNT(*) > 1
        `;
        
        const { rows } = await pool.query(findQuery);
        
        let totalDuplicates = 0;
        let deletedCount = 0;

        for (const row of rows) {
            const keepId = row.ids[0];
            const duplicateIds = row.ids.slice(1);
            totalDuplicates += row.ids.length;
            
            console.log(`- Found ${row.ids.length} duplicates for "${row.name}" at "${row.addr}". Keeping ID: ${keepId}.`);
            
            const deleteRes = await pool.query('DELETE FROM leads WHERE id = ANY($1)', [duplicateIds]);
            deletedCount += deleteRes.rowCount;
        }

        console.log(`\n✅ Done! Found ${totalDuplicates} leads involved in duplication.`);
        console.log(`🗑️ Deleted ${deletedCount} duplicate entries.`);
        
        // Also check duplicates by school_name and phone
        console.log("\n🔍 Finding duplicates by Name + Phone...");
        const findPhoneQuery = `
            SELECT 
                LOWER(TRIM(school_name)) as name, 
                TRIM(phone) as ph, 
                COUNT(*), 
                ARRAY_AGG(id ORDER BY id ASC) as ids
            FROM leads 
            WHERE phone IS NOT NULL AND phone != '' AND phone != '—'
            GROUP BY LOWER(TRIM(school_name)), TRIM(phone)
            HAVING COUNT(*) > 1
        `;
        
        const { rows: phoneRows } = await pool.query(findPhoneQuery);
        let phoneDeletedCount = 0;

        for (const row of phoneRows) {
            const keepId = row.ids[0];
            const duplicateIds = row.ids.slice(1);
            
            console.log(`- Found ${row.ids.length} duplicates for "${row.name}" with phone "${row.ph}". Keeping ID: ${keepId}.`);
            
            // Note: Since we might have already deleted some IDs in the first pass, we check if they still exist
            const deleteRes = await pool.query('DELETE FROM leads WHERE id = ANY($1)', [duplicateIds]);
            phoneDeletedCount += deleteRes.rowCount;
        }

        console.log(`🗑️ Deleted ${phoneDeletedCount} more duplicate entries by phone.`);

    } catch (err) {
        console.error("❌ Error removing duplicates:", err.message);
    } finally {
        await pool.end();
    }
}

removeDuplicates();
