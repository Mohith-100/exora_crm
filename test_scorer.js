const { scoreLead } = require('./lead-scorer');
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
    try {
        console.log("🧪 Testing Dynamic Scorer...");
        const { rows } = await pool.query("SELECT * FROM leads WHERE domain = 'gym' LIMIT 1");
        if (rows.length === 0) {
            console.log("No gym leads found for test.");
            process.exit();
        }
        const lead = rows[0];
        console.log(`Lead: ${lead.school_name} | Domain: ${lead.domain}`);
        const result = await scoreLead(lead);
        console.log("--- RESULTS ---");
        console.log("Pitch snippet:", result.pitch.substring(0, 300));
        if (result.pitch.includes('Parent Portal')) {
            console.log("❌ FAIL: Still sees 'Parent Portal' for gym!");
        } else {
            console.log("✅ SUCCESS: No 'Parent Portal' for gym.");
        }
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
