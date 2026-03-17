const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
    const { rows } = await pool.query('SELECT key, labels_json FROM score_config WHERE key = \'crm\'');
    const labels = rows[0].labels_json;
    console.log('Type of labels:', typeof labels);
    console.log('Is Array?', Array.isArray(labels));
    console.log('Value:', labels);
    console.log('Default key value:', labels ? labels.default : 'labels is null');
    process.exit(0);
}
check();
