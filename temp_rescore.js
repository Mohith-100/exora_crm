const { Pool } = require('pg');
require('dotenv').config();
const { scoreAllPendingLeads } = require('./lead-scorer');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function rescoreAll() {
  console.log('Resetting scored_at for all leads...');
  await pool.query('UPDATE leads SET scored_at = NULL');
  console.log('All leads reset. Now scoring...');
  await scoreAllPendingLeads();
  console.log('Done!');
  process.exit(0);
}

rescoreAll();
