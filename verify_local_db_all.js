const { Client } = require('pg');
const passwords = ['ExoraSolutions@2004', 'admin123', 'postgres', 'root', '123456', 'password'];
async function check() {
  for (const p of passwords) {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: p,
      database: 'postgres' // Try the default system DB
    });
    try {
      await client.connect();
      console.log(`✅ Connection success with password: ${p}`);
      const res = await client.query('SELECT datname FROM pg_database WHERE datname = $1', ['exora_crm']);
      if (res.rows.length > 0) {
        console.log(`✅ Database "exora_crm" exists!`);
        await client.end();
        // Now try with the exora_crm DB
        const dbClient = new Client({
           host: 'localhost',
           port: 5432,
           user: 'postgres',
           password: p,
           database: 'exora_crm'
        });
        await dbClient.connect();
        const users = await dbClient.query('SELECT name, email FROM users');
        console.log('✅ Found users:');
        console.table(users.rows);
        await dbClient.end();
        return;
      } else {
        console.log(`❌ Database "exora_crm" not found in local postgres.`);
      }
      await client.end();
    } catch (e) {
      console.log(`❌ Password failed: ${p} - ${e.message}`);
    }
  }
}
check();
