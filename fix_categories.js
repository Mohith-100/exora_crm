const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function fix() {
  // 1. Rename 'schools' domain to 'school' in domains table and leads table
  await pool.query("UPDATE domains SET name = 'school' WHERE name = 'schools'");
  await pool.query("UPDATE leads SET domain = 'school' WHERE domain = 'schools'");
  console.log("✅ Unified 'schools' -> 'school'");

  // 2. Re-categorize mis-tagged leads
  const { rows: allLeads } = await pool.query("SELECT id, school_name, domain FROM leads WHERE domain = 'school'");
  console.log(`Checking ${allLeads.length} leads currently tagged as 'school'...`);

  for(const r of allLeads) {
    let newDomain = null;
    const name = (r.school_name || '').toLowerCase();

    // Check for obvious non-school patterns
    if (name.includes('hospital') || name.includes('clinic') || name.includes('medical') || name.includes('healthcare') || name.includes('super speciality')) {
      newDomain = 'hospital';
    } 
    else if (name.includes('manufacturing') || name.includes('industry') || name.includes('industries') || name.includes('ltd') || name.includes('limited') || name.includes('pharma') || name.includes('energy') || name.includes('foods') || name.includes('private limited') || name.includes('pvt ltd') || name.includes('springs')) {
       // Only move if 'school' is NOT also in the name (to be safe)
       if (!name.includes('school') && !name.includes('preschool') && !name.includes('daycare')) {
         newDomain = 'manufacturing';
       }
    } 
    else if (name.includes('gym') || name.includes('fitness') || name.includes('workout') || name.includes('bodybuilding')) {
      newDomain = 'gym';
    } 
    else if (name.includes('salon') || name.includes('parlour') || name.includes('beauty') || name.includes('spa')) {
      newDomain = 'salon';
    }

    if (newDomain) {
      await pool.query('UPDATE leads SET domain = $1 WHERE id = $2', [newDomain, r.id]);
      console.log(` - Moved [${r.school_name}] -> ${newDomain}`);
    }
  }
  process.exit();
}
fix();
