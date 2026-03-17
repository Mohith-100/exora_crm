const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  try {
    console.log('Adding unique constraints to leads table...');
    
    // First, let's remove any existing duplicates that would prevent adding the unique constraints
    await pool.query(`
      DELETE FROM leads a USING leads b
      WHERE a.id > b.id 
      AND a.school_name = b.school_name 
      AND (a.address = b.address OR (a.address IS NULL AND b.address IS NULL));
    `);
    
    await pool.query(`
      DELETE FROM leads a USING leads b
      WHERE a.id > b.id 
      AND a.school_name = b.school_name 
      AND (a.phone = b.phone OR (a.phone IS NULL AND b.phone IS NULL));
    `);

    await pool.query(`
      ALTER TABLE leads ADD CONSTRAINT unique_lead_name_addr UNIQUE (school_name, address);
    `).catch(e => console.log('Constraint name_addr might already exist or failed:', e.message));

    await pool.query(`
      ALTER TABLE leads ADD CONSTRAINT unique_lead_name_phone UNIQUE (school_name, phone);
    `).catch(e => console.log('Constraint name_phone might already exist or failed:', e.message));

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}
migrate();
