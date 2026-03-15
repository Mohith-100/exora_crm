const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
    try {
        console.log("🧹 Final Categorization Cleanup...");
        
        const mappings = [
            { k: 'hospital', q: "school_name ILIKE '%hospital%' OR school_name ILIKE '%medical%' OR school_name ILIKE '%clinic%'" },
            { k: 'gym', q: "school_name ILIKE '%gym%' OR school_name ILIKE '%fitness%' OR school_name ILIKE '%workout%' OR school_name ILIKE '%muscle%'" },
            { k: 'manufacturing', q: "school_name ILIKE '%manufacturing%' OR school_name ILIKE '%industries%' OR school_name ILIKE '%pvt ltd%' OR school_name ILIKE '%ltd%'" },
            { k: 'salon', q: "school_name ILIKE '%salon%' OR school_name ILIKE '%hair%' OR school_name ILIKE '%unisex%'" },
            { k: 'it', q: "school_name ILIKE '% it %' OR school_name ILIKE '%software%' OR school_name ILIKE '%technologies%'" }
        ];

        for (const m of mappings) {
            const res = await pool.query(`UPDATE leads SET domain = $1 WHERE domain = 'school' AND (${m.q})`, [m.k]);
            if (res.rowCount > 0) console.log(`✅ Re-categorized ${res.rowCount} leads to '${m.k}'`);
        }

        process.exit();
    } catch (e) { console.error(e); process.exit(1); }
}
fix();
