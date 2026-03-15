const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fuzzyDedup() {
    try {
        console.log("🔍 Running Fuzzy Deduplication...");
        const { rows } = await pool.query("SELECT id, school_name, address FROM leads");
        
        const toDelete = [];
        const seen = new Map();

        for (const l of rows) {
            const nameKey = (l.school_name || '').toLowerCase().substring(0, 15).trim();
            const addrKey = (l.address || '').toLowerCase().substring(0, 10).trim();
            const key = `${nameKey}|${addrKey}`;

            if (seen.has(key)) {
                toDelete.push(l.id);
            } else {
                seen.set(key, l.id);
            }
        }

        if (toDelete.length > 0) {
            await pool.query("DELETE FROM leads WHERE id = ANY($1)", [toDelete]);
            console.log(`✅ Removed ${toDelete.length} fuzzy duplicates.`);
        } else {
            console.log("✅ No fuzzy duplicates found.");
        }

        process.exit();
    } catch (e) { console.error(e); process.exit(1); }
}
fuzzyDedup();
