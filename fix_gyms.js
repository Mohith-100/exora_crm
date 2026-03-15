require('dotenv').config();
const { Pool } = require('pg');
const { scoreLead } = require('./lead-scorer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function fixAllGyms() {
    try {
        const { rows: gymLeads } = await pool.query("SELECT * FROM leads WHERE domain='gym'");
        console.log(`Force re-scoring ${gymLeads.length} gym leads...`);
        for (const lead of gymLeads) {
            await scoreLead(lead);
        }
        console.log('All gym leads updated with new dynamic logic.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixAllGyms();
