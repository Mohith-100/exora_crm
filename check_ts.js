require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function check() {
    const { rows } = await pool.query("SELECT school_name, scored_at FROM leads WHERE school_name LIKE '%A1 fittnes%'");
    console.log(JSON.stringify(rows[0], null, 2));
    process.exit(0);
}

check();
