require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function checkGym() {
    try {
        const { rows } = await pool.query("SELECT id, school_name, domain, score, status FROM leads WHERE school_name LIKE '%A1 fittnes%'");
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkGym();
