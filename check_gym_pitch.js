require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function checkGymPitch() {
    try {
        const { rows } = await pool.query("SELECT id, school_name, domain, pitch FROM leads WHERE school_name LIKE '%A1 fittnes%'");
        if (rows.length > 0) {
            fs.writeFileSync('gym_pitch.txt', rows[0].pitch);
            console.log('Pitch written to gym_pitch.txt');
        } else {
            console.log('Lead not found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkGymPitch();
