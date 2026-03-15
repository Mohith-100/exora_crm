require('dotenv').config();
const { Pool } = require('pg');
const { scoreLead } = require('./lead-scorer');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function debug() {
    const { rows } = await pool.query("SELECT * FROM leads WHERE school_name LIKE '%A1 fittnes%'");
    const lead = rows[0];
    const result = await scoreLead(lead);
    process.exit(0);
}

debug();
