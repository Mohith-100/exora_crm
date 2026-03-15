require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function checkSalonLeadsDetailed() {
    try {
        const { rows } = await pool.query("SELECT id, school_name, score, scored_at, website_status, status FROM leads WHERE domain='salon' ORDER BY id DESC");
        console.log('Salon Leads Status:');
        rows.forEach(r => {
            console.log(`- ${r.school_name}: Score=${r.score}, ScoredAt=${r.scored_at}, Status=${r.status}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSalonLeadsDetailed();
