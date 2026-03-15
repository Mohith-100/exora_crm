require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function checkLeads() {
    try {
        const { rows } = await pool.query('SELECT id, school_name, domain, score, scored_at FROM leads ORDER BY id DESC LIMIT 20');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLeads();
