const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function check() {
    try {
        const { rows } = await pool.query('SELECT id, school_name, domain, pitch FROM leads WHERE domain = \'manufacturing\' AND pitch IS NOT NULL LIMIT 2');
        rows.forEach(r => {
            console.log(`\nID: ${r.id} | Name: ${r.school_name} | Domain: ${r.domain}`);
            console.log('--- PITCH ---');
            console.log(r.pitch);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
