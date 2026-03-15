const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function removeDuplicates() {
    try {
        console.log("🧹 Starting Smart Duplicate Removal...");

        // 1. Remove obvious test/junk data
        const junkRes = await pool.query(`
            DELETE FROM leads 
            WHERE school_name ILIKE '%test%' 
               OR school_name ILIKE '%unknown%'
               OR school_name IS NULL
            RETURNING id, school_name
        `);
        console.log(`✅ Removed ${junkRes.rowCount} junk/test leads.`);

        // 2. Remove "sub-building" duplicates (e.g., "Salem Hospital - Building B" if "Salem Hospital" exists)
        // Strategy: If name contains " - " or " | ", check if the base name exists
        const { rows: allLeads } = await pool.query("SELECT id, school_name FROM leads");
        const toDeleteIds = [];
        
        for (const lead of allLeads) {
            const name = lead.school_name || '';
            const baseParts = name.split(/[-|]/);
            if (baseParts.length > 1) {
                const baseName = baseParts[0].trim();
                const parent = allLeads.find(l => l.id !== lead.id && l.school_name.trim().toLowerCase() === baseName.toLowerCase());
                if (parent) {
                    console.log(` - Found sub-unit: [${name}] matches parent [${baseName}]. Adding to delete list.`);
                    toDeleteIds.push(lead.id);
                }
            }
        }

        if (toDeleteIds.length > 0) {
            const subRes = await pool.query('DELETE FROM leads WHERE id = ANY($1)', [toDeleteIds]);
            console.log(`✅ Removed ${subRes.rowCount} sub-unit duplicates.`);
        }

        // 3. Final Aggressive Deduplication by Name (Simplified)
        // Keep the one with highest score or most info
        const dedupRes = await pool.query(`
            DELETE FROM leads 
            WHERE id NOT IN (
                SELECT DISTINCT ON (LOWER(TRIM(school_name))) id
                FROM leads
                ORDER BY LOWER(TRIM(school_name)), 
                         (CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END + 
                          CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) DESC,
                         id ASC
            )
        `);
        console.log(`✅ Final Pass: Removed ${dedupRes.rowCount} identical-name duplicates.`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

removeDuplicates();
