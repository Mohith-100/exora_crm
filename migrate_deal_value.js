require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function migrate() {
  try {
    console.log('🚀 Starting migration: Adding deal_value to leads...');
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value NUMERIC DEFAULT 0;
    `);
    console.log('✅ Migration successful: deal_value column added.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
