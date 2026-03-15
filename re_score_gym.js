require('dotenv').config();
const { Pool } = require('pg');
const { scoreLead } = require('./lead-scorer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function reScore() {
    try {
        const { rows } = await pool.query("SELECT * FROM leads WHERE id = 2052");
        const lead = rows[0];
        console.log(`Rescoring: ${lead.school_name}, Domain: ${lead.domain}`);
        const result = await scoreLead(lead);
        console.log('--- NEW PITCH ---');
        console.log(result.pitch);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

reScore();
