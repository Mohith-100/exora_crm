require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const { scrapeAndSave } = require('./lead-scraper');
const { scoreAllPendingLeads, scoreLead } = require('./lead-scorer');

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve frontend ──
app.use(express.static(path.join(__dirname)));

const JWT_SECRET = process.env.JWT_SECRET || 'leadflow_super_secret_2024';

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
        territory TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'salesperson',
        phone TEXT DEFAULT '',
        territory TEXT DEFAULT '',
        team_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Safe migration: add columns that may be missing from older DB instances
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS base_score     NUMERIC     DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS final_score    NUMERIC     DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS score          INTEGER     DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_status TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS gaps_found     JSONB;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority       TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS pitch          TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS scored_at      TIMESTAMPTZ;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS search_query   TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS missing_services TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_pitch    TEXT;
    `);

    // ── Safe migrations (add columns if missing) ──
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team' AND column_name='territory') THEN
          ALTER TABLE team ADD COLUMN territory TEXT DEFAULT '';
        END IF;
      END $$;
    `);

    // Seed default admin if not exists
    const adminCheck = await pool.query("SELECT id FROM users WHERE email=$1", ['admin@leadflow.com']);
    if (adminCheck.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`,
        ['Admin User', 'admin@leadflow.com', hash, 'admin']
      );
      console.log('✅ Default admin created: admin@leadflow.com / admin123');
    }

    console.log('✅ Connected to PostgreSQL —', process.env.DATABASE_URL.split('/').pop());
    console.log('✅ Tables ready!');
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
  }
}

initDB();

// ── AUTH MIDDLEWARE ──
function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token provided' });
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    } catch (e) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// ── AUTH ROUTES ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, team_id: user.team_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, team_id: user.team_id, territory: user.territory } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

app.put('/api/auth/update', requireAuth(), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  try {
    const userId = req.user.id;
    let query, params;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query = `UPDATE users SET name=$1, email=$2, password_hash=$3 WHERE id=$4 RETURNING id, name, email, role, team_id, territory`;
      params = [name, email.toLowerCase().trim(), hash, userId];
    } else {
      query = `UPDATE users SET name=$1, email=$2 WHERE id=$3 RETURNING id, name, email, role, team_id, territory`;
      params = [name, email.toLowerCase().trim(), userId];
    }
    const result = await pool.query(query, params);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const updatedUser = result.rows[0];
    const token = jwt.sign(
      { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, team_id: updatedUser.team_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ success: true, user: updatedUser, token });
  } catch (err) {
    if (err.message.includes('unique')) return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', requireAuth(['admin']), async (req, res) => {
  const { name, email, password, phone, territory, color } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone, territory) VALUES ($1,$2,$3,'salesperson',$4,$5) RETURNING *`,
      [name, email.toLowerCase().trim(), hash, phone || '', territory || '']
    );
    const newUser = userResult.rows[0];
    const teamResult = await pool.query(
      `INSERT INTO team (name, role, email, phone, color, territory) VALUES ($1,'Sales Person',$2,$3,$4,$5) RETURNING *`,
      [name, email.toLowerCase().trim(), phone || '', color || '#5b6af7', territory || '']
    );
    const teamMember = teamResult.rows[0];
    await pool.query('UPDATE users SET team_id=$1 WHERE id=$2', [teamMember.id, newUser.id]);
    console.log('✅ New salesperson registered:', email);
    res.json({ success: true, user: { ...newUser, team_id: teamMember.id }, team: teamMember });
  } catch (err) {
    if (err.message.includes('unique')) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function cleanPhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/^['"\s]+/, '').trim();
}
function calcBaseScore({ rating, reviews, phone, website, address }) {
  let score = 0;
  const r = parseFloat(rating) || 0;
  if (r >= 4.5) score += 25; else if (r >= 4.0) score += 20; else if (r >= 3.5) score += 14; else if (r >= 3.0) score += 8; else if (r > 0) score += 4;
  const rv = parseInt(reviews) || 0;
  if (rv >= 200) score += 20; else if (rv >= 100) score += 16; else if (rv >= 50) score += 12; else if (rv >= 20) score += 8; else if (rv >= 5) score += 4;
  if (phone) score += 10;
  if (website) score += 15;
  if (address) score += 10;
  return Math.min(score, 80);
}

// ── LEADS ──
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/leads/mine', requireAuth(['salesperson']), async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const result = await pool.query(
      'SELECT * FROM leads WHERE assigned_id=$1 ORDER BY created_at DESC',
      [teamId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leads', async (req, res) => {
  const { school_name, address, phone, website, rating, reviews, source, status, assigned_id, notes } = req.body;
  try {
    const cleanedPhone = cleanPhone(phone);
    const base = calcBaseScore({ rating, reviews, phone: cleanedPhone, website, address });
    const result = await pool.query(
      `INSERT INTO leads (school_name, address, phone, website, rating, reviews, base_score, score, source, status, assigned_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [school_name, address, cleanedPhone, website, rating || null, reviews || null, base, base, source || 'manual', status || 'new', assigned_id || null, notes || '']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  try {
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
    const setClause = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    const result = await pool.query(
      `UPDATE leads SET ${setClause} WHERE id=$${values.length} RETURNING *`,
      values
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

app.post('/api/leads/assign', async (req, res) => {
  const { lead_ids, team_id } = req.body;
  if (!lead_ids || !lead_ids.length) return res.status(400).json({ error: 'lead_ids required' });
  try {
    await pool.query(
      `UPDATE leads SET assigned_id=$1 WHERE id = ANY($2::int[])`,
      [team_id, lead_ids]
    );
    res.json({ success: true, updated: lead_ids.length });
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
  const { name, role, email, phone, color, status, territory } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO team (name, role, email, phone, color, status, territory) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, role, email || '', phone || '', color || '#5b6af7', status || 'online', territory || '']
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

// ── n8n WEBHOOK ──────────────────────────────────────────────
app.post('/webhook/leads', async (req, res) => {
  const { school_name, address, phone, website, rating, reviews } = req.body;
  try {
    const cleanedPhone = cleanPhone(phone);
    const base = calcBaseScore({ rating, reviews, phone: cleanedPhone, website, address });
    const result = await pool.query(
      `INSERT INTO leads (school_name, address, phone, website, rating, reviews, base_score, score, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'n8n','new')
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [school_name || 'Unknown', address || '', cleanedPhone, website || '', rating || null, reviews || null, base, base]
    );
    if (!result.rows.length) {
      return res.json({ success: true, skipped: true, message: 'Duplicate lead, skipped.' });
    }
    console.log('⚡ New lead from n8n:', school_name, '| base_score:', base);
    res.json({ success: true, lead: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Re-score a single lead on demand ─────────────────────────
app.post('/api/leads/:id/score', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    const scored = await scoreLead(rows[0]);
    res.json({ success: true, lead: scored });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Scrape trigger ────────────────────────────────────────────
app.post('/api/trigger-scrape', async (req, res) => {
  const query = req.body?.query || process.env.N8N_QUERY || 'preschools in Bengaluru';
  try {
    console.log(`\n⚡ Scrape triggered for: "${query}"`);
    const results = await scrapeAndSave(query);
    res.json({ success: true, query, saved: results.saved.length, skipped: results.skipped.length, errors: results.errors.length, leads: results.saved });
  } catch (err) {
    console.error('Scrape trigger error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Score trigger ─────────────────────────────────────────────
app.post('/api/trigger-score', async (req, res) => {
  try {
    console.log('\n⚡ Score trigger received');
    const scored = await scoreAllPendingLeads();
    res.json({ success: true, scored: scored.length });
  } catch (err) {
    console.error('Score trigger error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Full pipeline: Scrape → Score ─────────────────────────────
app.post('/api/trigger-all', async (req, res) => {
  const query = req.body?.query || process.env.N8N_QUERY || 'preschools in Bengaluru';
  try {
    console.log(`\n🚀 FULL PIPELINE triggered for: "${query}"`);
    const scrapeResults = await scrapeAndSave(query);
    const scored = await scoreAllPendingLeads();
    const { rows: allLeads } = await pool.query(
      `SELECT id, school_name, score, priority, website_status, gaps_found FROM leads WHERE search_query=$1 ORDER BY score DESC`,
      [query]
    );
    res.json({ success: true, query, pipeline: { scraped: scrapeResults.saved.length, skipped: scrapeResults.skipped.length, scored: scored.length }, leads: allLeads });
  } catch (err) {
    console.error('Pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Stats summary ─────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [total, byStatus, byPriority, avgScore] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM leads'),
      pool.query('SELECT status, COUNT(*) FROM leads GROUP BY status'),
      pool.query('SELECT priority, COUNT(*) FROM leads WHERE priority IS NOT NULL GROUP BY priority'),
      pool.query('SELECT AVG(score)::numeric(5,1) as avg_score FROM leads WHERE score > 0'),
    ]);
    res.json({ total: parseInt(total.rows[0].count), by_status: byStatus.rows, by_priority: byPriority.rows, avg_score: avgScore.rows[0]?.avg_score || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Trigger n8n (proxy) ──────────────────────────────────────
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

// ── Fix status endpoint ───────────────────────────────────────
app.get('/api/fix-status', async (req, res) => {
  try {
    await pool.query(`UPDATE leads SET status = 'new' WHERE status IS NULL OR (TRIM(LOWER(status)) != 'contacted' AND TRIM(LOWER(status)) != 'qualified' AND TRIM(LOWER(status)) != 'closed' AND TRIM(LOWER(status)) != 'scored');`);
    const result = await pool.query('SELECT status, COUNT(*) FROM leads GROUP BY status');
    res.json({ success: true, message: 'All status fixed!', breakdown: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: '✅ LeadFlow CRM Backend is running', db: 'PostgreSQL', port: process.env.PORT });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 LeadFlow backend running at http://localhost:${PORT}`);
  console.log(`🔗 n8n webhook     → POST http://localhost:${PORT}/webhook/leads`);
  console.log(`📊 Trigger score   → POST http://localhost:${PORT}/api/trigger-score`);
  console.log(`⚡ Full pipeline   → POST http://localhost:${PORT}/api/trigger-all`);
  console.log(`📋 Leads API       → GET  http://localhost:${PORT}/api/leads`);
});

// ── Graceful EADDRINUSE handling ─────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Run this to free it:`);
    console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

