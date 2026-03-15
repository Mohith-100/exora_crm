require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function checkAll() {
    const { rows } = await pool.query("SELECT id, school_name, domain, pitch FROM leads WHERE domain='gym'");
    rows.forEach(r => {
        const hasParent = r.pitch && r.pitch.toLowerCase().includes('parent');
        console.log(`Lead: ${r.school_name} | ID: ${r.id} | Has 'parent': ${hasParent}`);
    });
    process.exit(0);
}

checkAll();
