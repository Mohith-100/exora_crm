const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
    const { rows } = await pool.query('SELECT key, labels_json, pitches_json FROM score_config WHERE key = \'crm\'');
    console.log(JSON.stringify(rows[0], null, 2));
    process.exit(0);
}
check();
