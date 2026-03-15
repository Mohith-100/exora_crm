require('dotenv').config();
const { Pool } = require('pg');
const { scoreLead } = require('./lead-scorer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function testScoreOne() {
    try {
        const { rows } = await pool.query("SELECT * FROM leads WHERE school_name LIKE '%Blown%' LIMIT 1");
        if (rows.length === 0) {
            console.log('Lead not found');
            process.exit(0);
        }
        const lead = rows[0];
        console.log(`Lead found: ${lead.school_name}, Status: ${lead.status}, ScoredAt: ${lead.scored_at}`);
        const result = await scoreLead(lead);
        console.log('Scoring result:', result.score);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testScoreOne();
