require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── PostgreSQL Connection ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// ── Auto-create tables on startup ──
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        school_name TEXT,
        address TEXT,
        phone TEXT,
        website TEXT,
        rating NUMERIC,
        reviews INTEGER,
        source TEXT DEFAULT 'n8n',
        status TEXT DEFAULT 'new',
        assigned_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS team (
        id SERIAL PRIMARY KEY,
        name TEXT,
        role TEXT,
        email TEXT,
        phone TEXT,
        color TEXT DEFAULT '#5b6af7',
        status TEXT DEFAULT 'online',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Safe migration: add columns that may be missing from older DB instances
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS base_score NUMERIC DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS final_score NUMERIC DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'low';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS missing_services TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_pitch TEXT;
    `);

    console.log('✅ Connected to PostgreSQL —', process.env.DATABASE_URL.split('/').pop());
    console.log('✅ Tables ready!');
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
  }
}

initDB();


// ── LEADS ──
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leads', async (req, res) => {
  const { school_name, address, phone, website, rating, reviews, source, status, assigned_id, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO leads (school_name, address, phone, website, rating, reviews, source, status, assigned_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [school_name, address, phone, website, rating || null, reviews || null, source || 'n8n', status || 'new', assigned_id || null, notes || '']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const { school_name, address, phone, website, rating, reviews, source, status, assigned_id, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE leads SET school_name=$1, address=$2, phone=$3, website=$4, rating=$5,
       reviews=$6, source=$7, status=$8, assigned_id=$9, notes=$10 WHERE id=$11 RETURNING *`,
      [school_name, address, phone, website, rating || null, reviews || null, source, status, assigned_id || null, notes, id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TEAM ──
app.get('/api/team', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM team ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/team', async (req, res) => {
  const { name, role, email, phone, color, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO team (name, role, email, phone, color, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, role, email || '', phone || '', color || '#5b6af7', status || 'online']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/team/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM team WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── n8n WEBHOOK ──
app.post('/webhook/leads', async (req, res) => {
  const { school_name, address, phone, website, rating, reviews } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO leads (school_name, address, phone, website, rating, reviews, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,'n8n','new') RETURNING *`,
      [school_name || 'Unknown', address || '', phone || '', website || '', rating || null, reviews || null]
    );
    console.log('⚡ New lead from n8n:', school_name);
    res.json({ success: true, lead: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Trigger n8n (proxy) ──
app.post('/api/trigger-n8n', async (req, res) => {
  try {
    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: process.env.N8N_QUERY })
    });
    const data = await response.text();
    console.log('⚡ n8n workflow triggered:', data);
    res.json({ success: true, message: 'n8n workflow triggered!' });
  } catch (err) {
    console.error('n8n trigger error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: '✅ LeadFlow CRM Backend is running', db: 'PostgreSQL', port: process.env.PORT });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 LeadFlow backend running at http://localhost:${PORT}`);
  console.log(`🔗 n8n webhook endpoint: http://localhost:${PORT}/webhook/leads`);
});
