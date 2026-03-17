require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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

// ── Globals for n8n tracking ──
global.lastN8nTrigger = 'System';
global.lastN8nDomain = 'school';

// ── Serve frontend ──
app.use(express.static(path.join(__dirname)));

const JWT_SECRET = process.env.JWT_SECRET || 'leadflow_super_secret_2024';

// ── PostgreSQL Connection ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
        deal_value NUMERIC DEFAULT 0,
        domain TEXT DEFAULT 'school',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_lead_name_addr UNIQUE (school_name, address),
        CONSTRAINT unique_lead_name_phone UNIQUE (school_name, phone)
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

    // ── Call logs, Lead notes, Reminders ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id            SERIAL PRIMARY KEY,
        lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        called_by     TEXT    NOT NULL,
        called_at     TIMESTAMPTZ DEFAULT NOW(),
        duration      INTEGER DEFAULT 0,
        outcome       TEXT    DEFAULT 'no_answer',
        notes         TEXT    DEFAULT '',
        next_followup DATE
      );
      CREATE TABLE IF NOT EXISTS lead_notes (
        id         SERIAL PRIMARY KEY,
        lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        added_by   TEXT    NOT NULL,
        note       TEXT    NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS reminders (
        id          SERIAL PRIMARY KEY,
        lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        call_log_id INTEGER REFERENCES call_logs(id) ON DELETE CASCADE,
        remind_at   TIMESTAMPTZ NOT NULL,
        message     TEXT DEFAULT '',
        status      TEXT DEFAULT 'pending',
        created_by  TEXT NOT NULL DEFAULT 'Unknown',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Score config table ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS score_config (
        id         SERIAL PRIMARY KEY,
        category   TEXT    NOT NULL,
        key        TEXT    NOT NULL UNIQUE,
        label      TEXT    NOT NULL,
        points     INTEGER NOT NULL DEFAULT 0,
        enabled    BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        labels_json JSONB,
        pitches_json JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // ── Score config table migration ──
    await pool.query(`
      ALTER TABLE score_config ADD COLUMN IF NOT EXISTS labels_json JSONB;
      ALTER TABLE score_config ADD COLUMN IF NOT EXISTS pitches_json JSONB;
    `);

    const cfgCount = await pool.query('SELECT COUNT(*) FROM score_config');
    if (parseInt(cfgCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO score_config (category, key, label, points, enabled, sort_order) VALUES
          ('base', 'rating_4_5',   'Rating >= 4.5 stars',     25, true,  1),
          ('base', 'rating_4_0',   'Rating >= 4.0 stars',     20, true,  2),
          ('base', 'rating_3_5',   'Rating >= 3.5 stars',     14, true,  3),
          ('base', 'rating_3_0',   'Rating >= 3.0 stars',      8, true,  4),
          ('base', 'rating_any',   'Rating > 0 (any)',          4, true,  5),
          ('base', 'reviews_200',  '200+ Google reviews',     20, true,  6),
          ('base', 'reviews_100',  '100+ Google reviews',     16, true,  7),
          ('base', 'reviews_50',   '50+ Google reviews',      12, true,  8),
          ('base', 'reviews_20',   '20+ Google reviews',       8, true,  9),
          ('base', 'reviews_5',    '5+ Google reviews',        4, true,  10),
          ('base', 'has_phone',    'Has phone number',        10, true,  11),
          ('base', 'has_website',  'Has website',             15, true,  12),
          ('base', 'has_address',  'Has address',             10, true,  13),
          ('gap',  'crm',         'No CRM / Enquiry System', 10, true,  20),
          ('gap',  'lms',         'No LMS / Online Learning',10, true,  21),
          ('gap',  'payment',     'No Online Fee Payment',   10, true,  22),
          ('gap',  'admission',   'No Admission Portal',      8, true,  23),
          ('gap',  'app',         'No Mobile App',            7, true,  24),
          ('gap',  'attendance',  'No Attendance / ERP',      7, true,  25),
          ('gap',  'chatbot',     'No Live Chat / WhatsApp',  5, true,  26),
          ('gap',  'ssl',         'No HTTPS / Secure Site',   5, true,  27)
        ON CONFLICT (key) DO NOTHING;
      `);
      console.log('  ✅ Score config seeded');
    }

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
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS domain         TEXT DEFAULT 'school';
    `);

    // ── Domains table ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS domains (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        icon TEXT DEFAULT '📋',
        query TEXT NOT NULL,
        target_term TEXT DEFAULT 'customers',
        type_term TEXT DEFAULT 'business',
        created_by TEXT DEFAULT 'Admin',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE domains ADD COLUMN IF NOT EXISTS target_term TEXT DEFAULT 'customers';
      ALTER TABLE domains ADD COLUMN IF NOT EXISTS type_term TEXT DEFAULT 'business';
    `);
    const domCount = await pool.query('SELECT COUNT(*) FROM domains');
    if (parseInt(domCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO domains (name, label, icon, query, target_term, type_term, created_by) 
        VALUES 
          ('school', 'Schools', '🏫', 'Preschools in Bengaluru', 'parents', 'admissions', 'System'),
          ('gym', 'Gyms', '💪', 'Gyms in Bengaluru', 'potential members', 'memberships', 'System'),
          ('manufacturing', 'Manufacturing', '🏭', 'Manufacturing companies in Bengaluru', 'potential clients', 'deals', 'System'),
          ('hospital', 'Hospitals', '🏥', 'Hospitals in Bengaluru', 'patients', 'consultations', 'System'),
          ('salon', 'Salons', '✂️', 'Salons in Bengaluru', 'new clients', 'bookings', 'System')
        ON CONFLICT DO NOTHING;
      `);
      console.log('  ✅ Default domains seeded');
    }

    // Safe migration for Reminders (rename note to message if exists)
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reminders' AND column_name='note') THEN
          ALTER TABLE reminders RENAME COLUMN note TO message;
        END IF;
      END $$;
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
  console.log(`🔑 Login attempt: ${email}`);
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    if (!result.rows.length) {
      console.log(`❌ Login failed: User not found (${email})`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.log(`❌ Login failed: Invalid password for ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, team_id: user.team_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    console.log(`✅ Login success: ${email} (${user.role})`);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, team_id: user.team_id, territory: user.territory } });
  } catch (err) { 
    console.error(`❌ Login error: ${err.message}`);
    res.status(500).json({ error: err.message }); 
  }
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

// ── Helpers ────────────────────────────────────────────
function cleanPhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // Remove leading single quote (from Excel imports)
  s = s.replace(/^[']+/, '').trim();
  // Filter out literal garbage strings
  if (/^(undefined|null|none|nan|#ERROR!|#N\/A|#VALUE!|#REF!|#NAME\?|#DIV\/0!|#NULL!)$/i.test(s)) return '';
  return s;
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

// ── Score Config API ─────────────────────────────────
app.get('/api/score-config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM score_config ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.patch('/api/score-config/:id', async (req, res) => {
  const { points, enabled } = req.body;
  const updates = []; const vals = []; let i = 1;
  if (points !== undefined) { updates.push(`points=$${i++}`); vals.push(parseInt(points)); }
  if (enabled !== undefined) { updates.push(`enabled=$${i++}`); vals.push(Boolean(enabled)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  updates.push(`updated_at=NOW()`); vals.push(req.params.id);
  try {
    const r = await pool.query(`UPDATE score_config SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LEADS ──
app.get('/api/leads', async (req, res) => {
  const { domain } = req.query;
  try {
    let q = 'SELECT * FROM leads';
    let params = [];
    if (domain && domain !== 'all') {
      q += ' WHERE domain = $1';
      params.push(domain);
    }
    q += ' ORDER BY school_name ASC';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DOMAINS API ──
app.get('/api/domains', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM domains ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/domains/:name', requireAuth(['admin']), async (req, res) => {
  const { name } = req.params;
  const { label, icon, target_term, type_term } = req.body;
  try {
    const result = await pool.query(
      `UPDATE domains SET label = COALESCE($1, label), icon = COALESCE($2, icon), target_term = COALESCE($3, target_term), type_term = COALESCE($4, type_term)
       WHERE name = $5 RETURNING *`,
      [label, icon, target_term, type_term, name]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Sector not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/domains', requireAuth(['admin']), async (req, res) => {
  const { name, label, icon, query, created_by, target_term, type_term } = req.body;
  try {
    const exists = await pool.query('SELECT id FROM domains WHERE name = $1', [name]);
    if (exists.rows.length > 0) return res.json({ exists: true });
    
    const result = await pool.query(
      'INSERT INTO domains (name, label, icon, query, created_by, target_term, type_term) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, label, icon, query, created_by || 'Admin', target_term || 'customers', type_term || 'business']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/domains/:name', requireAuth(['admin']), async (req, res) => {
  const { name } = req.params;
  if (name === 'school') return res.status(400).json({ error: 'Cannot delete the base Schools sector' });
  try {
    const result = await pool.query('DELETE FROM domains WHERE name = $1 RETURNING *', [name]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sector not found' });
    
    // Also delete leads associated with this domain
    const leadCount = await pool.query('DELETE FROM leads WHERE domain = $1', [name]);
    
    console.log(`🗑️ Deleted sector: ${name} and ${leadCount.rowCount} associated leads`);
    res.json({ success: true, message: `Sector '${name}' and its leads deleted successfully.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/leads/mine', requireAuth(['salesperson']), async (req, res) => {
  try {
    const teamId = req.user.team_id;
    const result = await pool.query(
      'SELECT * FROM leads WHERE assigned_id=$1 ORDER BY school_name ASC',
      [teamId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leads', async (req, res) => {
  const { school_name, address, phone, website, rating, reviews, source, status, assigned_id, notes, deal_value } = req.body;
  try {
    const cleanedPhone = cleanPhone(phone);
    const base = calcBaseScore({ rating, reviews, phone: cleanedPhone, website, address });
    const result = await pool.query(
      `INSERT INTO leads (school_name, address, phone, website, rating, reviews, base_score, score, source, status, assigned_id, notes, deal_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [school_name, address, cleanedPhone, website, rating || null, reviews || null, base, base, source || 'manual', status || 'new', assigned_id || null, notes || '', deal_value || 0]
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

app.patch('/api/leads/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    const result = await pool.query(
      'UPDATE leads SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });
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

app.post('/api/leads/dedup', requireAuth(['admin']), async (req, res) => {
  try {
    const r1 = await pool.query(`
      DELETE FROM leads a USING leads b
      WHERE a.id > b.id 
      AND a.school_name = b.school_name 
      AND (a.address = b.address OR (a.address IS NULL AND b.address IS NULL))
    `);
    const r2 = await pool.query(`
      DELETE FROM leads a USING leads b
      WHERE a.id > b.id 
      AND a.school_name = b.school_name 
      AND (a.phone = b.phone OR (a.phone IS NULL AND b.phone IS NULL))
    `);
    res.json({ success: true, removed: r1.rowCount + r2.rowCount });
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
  const { school_name, address, phone, website, rating, reviews, domain } = req.body;
  try {
    const cleanedPhone = cleanPhone(phone);
    const base = calcBaseScore({ rating, reviews, phone: cleanedPhone, website, address });
    const result = await pool.query(
      `INSERT INTO leads (school_name, address, phone, website, rating, reviews, base_score, score, source, status, domain)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'n8n','new',$9)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [school_name || 'Unknown', address || '', cleanedPhone, website || '', rating || null, reviews || null, base, base, domain || global.lastN8nDomain || 'school']
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

// ── CALL LOGS ─────────────────────────────────────────
app.post('/api/leads/:id/calls', async (req, res) => {
  const { id } = req.params;
  let { called_by, duration, outcome, notes, next_followup } = req.body;
  if (!called_by || called_by === 'undefined' || called_by === 'null') called_by = 'Unknown';
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO call_logs (lead_id, called_by, duration, outcome, notes, next_followup)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [id, called_by, duration || 0, outcome || 'no_answer', notes || '', next_followup || null]
      );
      const newCall = result.rows[0];

      // If there's a follow-up, create a reminder automatically
      if (next_followup) {
        // Fetch lead school name for the note
        const leadRes = await client.query('SELECT school_name FROM leads WHERE id=$1', [id]);
        const schoolName = leadRes.rows[0]?.school_name || 'Prospect';

        // Set reminder time to 09:00 AM on that day
        const remindAt = new Date(next_followup);
        remindAt.setHours(9, 0, 0, 0);
        
        const outcomeLabel = { interested: 'Interested', callback: 'Call Back', no_answer: 'No Answer', voicemail: 'Left Voicemail', not_interested: 'Not Interested', closed: 'Deal Closed!' }[outcome] || outcome;
        const msg = `Follow up with ${schoolName} - outcome: ${outcomeLabel}`;

        await client.query(
          `INSERT INTO reminders (lead_id, call_log_id, remind_at, message, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, newCall.id, remindAt, msg, called_by]
        );
      }

      await client.query('COMMIT');
      res.json(newCall);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/leads/:id/calls', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM call_logs WHERE lead_id=$1 ORDER BY called_at DESC', [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/leads/:id/calls/:callId', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM call_logs WHERE id=$1 AND lead_id=$2 RETURNING id', [req.params.callId, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Call log not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/activity', async (req, res) => {
  try {
    const result = await pool.query(`
      (SELECT 
        id, lead_id, called_by as added_by, called_at as created_at, 
        'call' as type, outcome, duration, notes, next_followup 
       FROM call_logs)
      UNION ALL
      (SELECT 
        id, lead_id, added_by, created_at, 
        'note' as type, NULL as outcome, NULL as duration, note as notes, NULL as next_followup 
       FROM lead_notes)
      ORDER BY created_at DESC 
      LIMIT 30
    `);
    
    // Fetch school names for these activities
    const activities = result.rows;
    if (activities.length === 0) return res.json([]);
    
    const leadIds = [...new Set(activities.map(a => a.lead_id))];
    const leadsResult = await pool.query('SELECT id, school_name FROM leads WHERE id = ANY($1)', [leadIds]);
    const leadMap = {};
    leadsResult.rows.forEach(l => leadMap[l.id] = l.school_name);
    
    res.json(activities.map(a => ({ ...a, school_name: leadMap[a.lead_id] || 'Unknown School' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LEAD NOTES ─────────────────────────────────────────
app.post('/api/leads/:id/notes', async (req, res) => {
  const { id } = req.params;
  let { added_by, note } = req.body;
  if (!added_by || added_by === 'undefined') added_by = 'Unknown';
  if (!note) return res.status(400).json({ error: 'note is required' });
  try {
    const result = await pool.query(`INSERT INTO lead_notes (lead_id, added_by, note) VALUES ($1,$2,$3) RETURNING *`, [id, added_by, note]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/leads/:id/notes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lead_notes WHERE lead_id=$1 ORDER BY created_at DESC', [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/leads/:id/notes/:noteId', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM lead_notes WHERE id=$1 AND lead_id=$2 RETURNING id', [req.params.noteId, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REMINDERS ─────────────────────────────────────────
app.post('/api/reminders', async (req, res) => {
  const { lead_id, call_log_id, remind_at, message, created_by } = req.body;
  if (!lead_id || !remind_at) return res.status(400).json({ error: 'lead_id and remind_at required' });
  const by = (!created_by || created_by === 'undefined') ? 'Unknown' : created_by;
  try {
    const result = await pool.query(
      `INSERT INTO reminders (lead_id, call_log_id, remind_at, message, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [lead_id, call_log_id || null, remind_at, message || '', by]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/reminders/today', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, 
             l.school_name, 
             l.phone,
             u.email as rep_email,
             u.name as rep_name
      FROM reminders r
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN users u ON LOWER(r.created_by) = LOWER(u.name)
      WHERE r.remind_at::date = CURRENT_DATE
      AND r.status = 'pending'
      ORDER BY r.created_by, r.remind_at ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/reminders/upcoming', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, 
             l.school_name, 
             l.phone,
             u.email as rep_email,
             u.name as rep_name
      FROM reminders r
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN users u ON LOWER(r.created_by) = LOWER(u.name)
      WHERE r.remind_at >= NOW() 
      AND r.remind_at <= NOW() + INTERVAL '7 days'
      AND r.status = 'pending'
      ORDER BY r.remind_at ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reminders/by-rep/:email', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, 
             l.school_name, 
             l.phone,
             u.email as rep_email,
             u.name as rep_name
      FROM reminders r
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN users u ON LOWER(r.created_by) = LOWER(u.name)
      WHERE u.email = $1
      AND r.status = 'pending'
      ORDER BY r.remind_at ASC
    `, [req.params.email]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.patch('/api/reminders/:id', async (req, res) => {
  const { status } = req.body;
  if (!['done', 'dismissed'].includes(status)) return res.status(400).json({ error: 'status must be done or dismissed' });
  try {
    const result = await pool.query(`UPDATE reminders SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/leads/:id/reminders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reminders WHERE lead_id=$1 ORDER BY remind_at ASC', [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fix corrupted data ──────────────────────────────
app.get('/api/fix-data', async (req, res) => {
  try {
    const corrupted = ['undefined', 'null', 'none', 'NaN', '#ERROR!', '#N/A'];
    let totalFixed = 0;

    // Fix phones
    const r1 = await pool.query(`
      UPDATE leads 
      SET phone = '' 
      WHERE phone IS NULL 
         OR TRIM(LOWER(phone)) = ANY($1) 
         OR phone ~* '^#(ERROR|N\/A|VALUE|REF|NAME|DIV/0|NULL)'
      RETURNING id
    `, [corrupted]);
    totalFixed += r1.rowCount;

    // Fix school names
    const r2 = await pool.query(`
      UPDATE leads 
      SET school_name = 'Unknown School' 
      WHERE school_name IS NULL OR TRIM(LOWER(school_name)) = ANY($1)
      RETURNING id
    `, [corrupted]);
    totalFixed += r2.rowCount;

    // Fix call logs
    const r3 = await pool.query(`
      UPDATE call_logs 
      SET called_by = 'Unknown' 
      WHERE called_by IS NULL OR TRIM(LOWER(called_by)) = ANY($1)
      RETURNING id
    `, [corrupted]);
    totalFixed += r3.rowCount;

    // Fix lead notes
    const r4 = await pool.query(`
      UPDATE lead_notes 
      SET added_by = 'Unknown' 
      WHERE added_by IS NULL OR TRIM(LOWER(added_by)) = ANY($1)
      RETURNING id
    `, [corrupted]);
    totalFixed += r4.rowCount;

    res.json({ success: true, fixed_count: totalFixed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fix corrupted phone data ─────────────────────────────
app.get('/api/fix-phones', async (req, res) => {
  try {
    const result = await pool.query(`UPDATE leads SET phone='' WHERE phone ~* '^#(ERROR|N\/A|VALUE|REF|NAME|DIV/0|NULL)' RETURNING id, school_name`);
    res.json({ success: true, fixed: result.rowCount, leads: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Scrape trigger ────────────────────────────────────────────
app.post('/api/trigger-scrape', async (req, res) => {
  const query = req.body?.query || process.env.N8N_QUERY || 'preschools in Bengaluru';
  try {
    const domain = req.body?.domain || 'school';
    console.log(`\n⚡ Scrape triggered for: "${query}" (domain: ${domain})`);
    const results = await scrapeAndSave(query, domain);
    res.json({ success: true, query, domain, saved: results.saved.length, skipped: results.skipped.length, errors: results.errors.length, leads: results.saved });
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
    const domain = req.body?.domain || 'school';
    console.log(`\n🚀 FULL PIPELINE triggered for: "${query}" (domain: ${domain})`);
    const scrapeResults = await scrapeAndSave(query, domain);
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
    const [total, byStatus, byPriority, avgScore, byDomain] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM leads'),
      pool.query('SELECT status, COUNT(*) FROM leads GROUP BY status'),
      pool.query('SELECT priority, COUNT(*) FROM leads WHERE priority IS NOT NULL GROUP BY priority'),
      pool.query('SELECT AVG(score)::numeric(5,1) as avg_score FROM leads WHERE score > 0'),
      pool.query("SELECT COALESCE(domain, 'school') as domain, COUNT(*) FROM leads GROUP BY domain"),
    ]);
    res.json({ 
      total: parseInt(total.rows[0].count), 
      by_status: byStatus.rows, 
      by_priority: byPriority.rows, 
      avg_score: avgScore.rows[0]?.avg_score || 0,
      by_domain: byDomain.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Trigger n8n (proxy) ──────────────────────────────────────
app.post('/api/trigger-n8n', requireAuth(['admin', 'salesperson']), async (req, res) => {
  const { generated_by_name, custom_query, domain } = req.body;
  if (generated_by_name) global.lastN8nTrigger = generated_by_name;
  if (domain) global.lastN8nDomain = domain;

  try {
    let target_term = 'customers';
    let type_term = 'business';
    
    if (domain) {
      const { rows } = await pool.query('SELECT target_term, type_term FROM domains WHERE name = $1', [domain]);
      if (rows.length > 0) {
        target_term = rows[0].target_term || 'customers';
        type_term = rows[0].type_term || 'business';
      }
    }

    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query: custom_query || process.env.N8N_QUERY,
        domain: domain,
        target_term: target_term,
        type_term: type_term,
        generated_by: generated_by_name || 'Admin'
      })
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

