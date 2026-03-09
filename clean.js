const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

// Find the start of rPipe()
const rPipeIndex = content.indexOf('function rPipe() {');

// The clean replacement code starting from rPipe()
const replacement = `function rPipe() {
  const stages = [{ k: 'new', l: 'New', c: '#5b6af7' }, { k: 'contacted', l: 'Contacted', c: '#f5a623' }, { k: 'qualified', l: 'Qualified', c: '#1de9a0' }, { k: 'closed', l: 'Closed', c: '#f25b7e' }];
  const tot = leads.length || 1;
  const pw = document.getElementById('pipe-wrap');
  if(!pw) return;
  pw.innerHTML = stages.map(s => {
    const cnt = leads.filter(l => l.status === s.k).length;
    const pct = Math.round(cnt / tot * 100);
    return \`<div class="ps"><div class="ps-top"><div class="ps-name"><div class="ps-dot" style="background:\${s.c}"></div>\${s.l}</div><span class="ps-cnt">\${cnt}</span></div><div class="pb"><div class="pbf" style="width:\${pct}%;background:\${s.c}"></div></div><div class="pv">\${pct}% of total</div></div>\`;
  }).join('');
}

function rTeam() {
  const g = document.getElementById('team-grid');
  if (!g) return;
  g.innerHTML = team.map(m => {
    const cnt = leads.filter(l => l.assigned_id === m.id).length;
    const init = m.name.split(' ').map(n => n[0]).join('').slice(0, 2);
    return \`<div class="tcard" onclick="openTD(\${m.id})">
  <div class="av \${m.status === 'online' ? 'avo' : 'avf'}" style="background:\${m.color}18;color:\${m.color};border:2px solid \${m.color}30;">\${init}</div>
  <div class="tc-name">\${m.name}</div><div class="tc-role">\${m.role}</div>
  <div class="tc-num" style="color:\${m.color}">\${cnt}</div>
  <div class="tc-lbl">schools assigned</div>
</div>\`;
  }).join('') + \`<div class="tcard tc-add" onclick="openAddTeam()"><div style="font-size:26px;opacity:0.2">+</div><div style="font-size:12px;color:var(--tx3)">Add Member</div></div>\`;
}

function popAssign() {
  const s = document.getElementById('f-assign');
  if (!s) return;
  s.innerHTML = \`<option value="">Unassigned</option>\` + team.map(m => \`<option value="\${m.id}">\${m.name}</option>\`).join('');
}

// ── LEAD CRUD ──
function openAddLead() {
  editId = null;
  document.getElementById('lm-title').textContent = 'Add School Lead';
  document.getElementById('lm-save').textContent = 'Save Lead';
  ['f-sname', 'f-phone', 'f-addr', 'f-web', 'f-notes'].forEach(id => document.getElementById(id).value = '');
  ['f-rating', 'f-reviews'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-source').value = 'n8n';
  document.getElementById('f-status').value = 'new';
  popAssign(); openM('lead-modal');
}

function editLead(id) {
  const l = leads.find(l => l.id === id); if (!l) return;
  editId = id;
  document.getElementById('lm-title').textContent = 'Edit School Lead';
  document.getElementById('lm-save').textContent = 'Update Lead';
  document.getElementById('f-sname').value = l.school_name || '';
  document.getElementById('f-phone').value = l.phone || '';
  document.getElementById('f-addr').value = l.address || '';
  document.getElementById('f-web').value = l.website || '';
  document.getElementById('f-rating').value = l.rating || '';
  document.getElementById('f-reviews').value = l.reviews || '';
  document.getElementById('f-source').value = l.source || 'n8n';
  document.getElementById('f-status').value = l.status || 'new';
  document.getElementById('f-notes').value = l.notes || '';
  popAssign(); document.getElementById('f-assign').value = l.assigned_id || '';
  openM('lead-modal');
}

async function saveLead() {
  const sn = document.getElementById('f-sname').value.trim();
  if (!sn) { toast('School name is required', 'error'); return; }
  const data = { school_name: sn, phone: document.getElementById('f-phone').value.trim(), address: document.getElementById('f-addr').value.trim(), website: document.getElementById('f-web').value.trim(), rating: parseFloat(document.getElementById('f-rating').value) || null, reviews: parseInt(document.getElementById('f-reviews').value) || null, source: document.getElementById('f-source').value, status: document.getElementById('f-status').value, assigned_id: parseInt(document.getElementById('f-assign').value) || null, notes: document.getElementById('f-notes').value.trim() };
  const btn = document.getElementById('lm-save'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    if (editId) { await patch(\`/leads/\${editId}\`, data); const i = leads.findIndex(l => l.id === editId); if (i >= 0) leads[i] = { ...leads[i], ...data }; toast('✅ Lead updated!', 'success'); }
    else { const c = await post('/leads', data); leads.unshift(c); toast('✅ School lead added!', 'success'); }
    renderAll(); closeM('lead-modal');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = editId ? 'Update Lead' : 'Save Lead';
}

async function delLead(id) {
  if (!confirm('Delete this school lead?')) return;
  try { await del(\`/leads/\${id}\`); leads = leads.filter(l => l.id !== id); renderAll(); toast('Lead deleted', ''); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function updStatus(id, status, sel) {
  const bc = { new: 'bn', contacted: 'bc', qualified: 'bq', closed: 'bx' };
  sel.className = \`badge \${bc[status] || 'bn'}\`; sel.style.color = 'inherit';
  try { await patch(\`/leads/\${id}\`, { status }); const l = leads.find(l => l.id === id); if (l) l.status = status; rStats(); rPipe(); toast('Status updated', 'success'); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
}

// ── TEAM CRUD ──
function openAddTeam() { ['t-name', 't-role', 't-email', 't-phone'].forEach(id => document.getElementById(id).value = ''); openM('team-modal'); }
async function saveTeam() {
  const n = document.getElementById('t-name').value.trim(), r = document.getElementById('t-role').value.trim();
  if (!n || !r) { toast('Name and Role required', 'error'); return; }
  const data = { name: n, role: r, email: document.getElementById('t-email').value.trim(), phone: document.getElementById('t-phone').value.trim(), color: document.getElementById('t-color').value, status: document.getElementById('t-status').value };
  try { const c = await post('/team', data); team.push(c); renderAll(); closeM('team-modal'); toast('✅ Team member added!', 'success'); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
}

function openTD(id) {
  const m = team.find(t => t.id === id); if (!m) return;
  const ml = leads.filter(l => l.assigned_id === id);
  const init = m.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const av = document.getElementById('tda');
  av.textContent = init; av.style.background = m.color + '18'; av.style.color = m.color; av.style.border = \`2px solid \${m.color}30\`;
  document.getElementById('tdn').textContent = m.name; document.getElementById('tdr').textContent = m.role;
  document.getElementById('tdc').textContent = [m.email, m.phone].filter(Boolean).join(' · ');
  document.getElementById('tds1').textContent = ml.length;
  document.getElementById('tds2').textContent = ml.filter(l => l.status?.toLowerCase() === 'new').length;
  document.getElementById('tds3').textContent = ml.filter(l => l.status?.toLowerCase() === 'qualified').length;
  document.getElementById('tds4').textContent = ml.filter(l => l.status?.toLowerCase() === 'closed').length;
  document.getElementById('td-leads').innerHTML = ml.length
    ? ml.map(l => \`<div class="ml"><div><div style="font-weight:700">\${l.school_name}</div><div style="font-size:11.5px;color:var(--tx3)">\${l.address || l.phone || ''}</div></div><span class="badge b\${l.status[0]}">\${l.status}</span></div>\`).join('')
    : '<div style="color:var(--tx3);font-size:13px;padding:10px 0;">No schools assigned yet.</div>';
  openM('td-modal');
}

// ── REAL N8N WORKFLOW TRIGGER (via backend proxy) ──
async function runN8nWorkflow() {
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Running...';
  toast('⚡ Triggering n8n workflow...', 'success');
  try {
    const res = await post('/trigger-n8n', {});
    toast('✅ Workflow triggered! Loading new leads in 10s...', 'success');
    setTimeout(async () => {
      leads = await get('/leads');
      renderAll();
      toast('🎉 New leads loaded from n8n!', 'success');
      btn.disabled = false;
      btn.innerHTML = '⚡ Run n8n Workflow';
    }, 10000);
  } catch (e) {
    toast('⚠️ Error: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '⚡ Run n8n Workflow';
  }
}

init();
</script>
</body>
</html>`;

const newContent = content.substring(0, rPipeIndex) + replacement;
fs.writeFileSync('index.html', newContent);
console.log('Cleaned index.html');
