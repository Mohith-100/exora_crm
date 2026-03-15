require('dotenv').config();
const { Pool } = require('pg');
const { scoreLead } = require('./lead-scorer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function rescoreSalons() {
    try {
        const { rows: salonLeads } = await pool.query("SELECT * FROM leads WHERE domain='salon' LIMIT 5");
        console.log(`Rescoring ${salonLeads.length} salon leads...`);
        for (const lead of salonLeads) {
            await scoreLead(lead);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

rescoreSalons();
