const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add CSS
html = html.replace('.ni:hover{background:var(--s2);color:var(--tx);}',
  `.ni:hover{background:var(--s2);color:var(--tx);}
.dropdown-btn { display: flex; align-items: center; justify-content: space-between; }
.dropdown-content { display: none; background: rgba(0,0,0,0.1); border-radius: 9px; margin: 4px 0 8px 8px; padding: 4px; }
.dropdown-content.open { display: block; }
.arrow { font-size: 10px; transition: transform 0.2s; }
.dropdown-btn.open .arrow { transform: rotate(90deg); }
.view-section { display: none; }
.view-section.active { display: block; }`);

// 2. Sidebar replacement
const newSidebar = `<aside class="sidebar">
  <div class="logo"><div class="logo-mark">⚡</div>Lead<span>Flow</span></div>
  <div class="nl">Main</div>
  <div class="ni active" onclick="setPage('Dashboard',this)"><span class="ni-ic">📊</span>Dashboard</div>
  <div class="ni dropdown-btn" onclick="toggleDropdown(this)"><div style="display:flex;align-items:center;gap:9px;"><span class="ni-ic">📁</span>Leads</div><span class="arrow">▶</span></div>
  <div class="dropdown-content" id="leads-domains-list"></div>
  <div class="ni" onclick="setPage('Status',this)"><span class="ni-ic">🚦</span>Status</div>
  <div class="nl">Workspace</div>
  <div class="ni" onclick="setPage('Team',this)"><span class="ni-ic">🧑‍💼</span>Team</div>
  <div class="ni" onclick="openM('wh-modal')"><span class="ni-ic">🔗</span>n8n Webhook</div>
  <div class="sb-foot">
    <div class="live-pill"><div class="dot"></div>PostgreSQL live</div>
  </div>
</aside>`;
html = html.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, newSidebar);

// 3. Main wrapper replacement
const newMainContent = `
  <!-- WEBHOOK BAR -->
  <div class="wbar">
    <div class="wbar-lbl">🔗 n8n Webhook Endpoint</div>
    <div class="wurl"><input type="text" value="http://localhost:3001/webhook/leads" readonly id="wh-url"><button class="cpbtn" onclick="cpEl('wh-url')">📋</button></div>
    <div style="font-size:11.5px;color:var(--tx3);">POST this URL from n8n HTTP Request node</div>
    <button class="btn bg bsm" onclick="openM('wh-modal')">⚙ Setup Guide</button>
  </div>

  <div id="view-Dashboard" class="view-section active">
    <!-- STATS -->
    <div class="stats">
      <div class="sc c1"><div class="sc-ic">🏫</div><div class="sc-lbl">Total Leads</div><div class="sc-val" id="s1">—</div><div class="sc-sub up">all leads</div></div>
      <div class="sc c2"><div class="sc-ic">🔥</div><div class="sc-lbl">New Leads</div><div class="sc-val" id="s2">—</div><div class="sc-sub">awaiting contact</div></div>
      <div class="sc c3"><div class="sc-ic">⭐</div><div class="sc-lbl">Avg Rating</div><div class="sc-val" id="s3">—</div><div class="sc-sub">across all leads</div></div>
      <div class="sc c4"><div class="sc-ic">💰</div><div class="sc-lbl">Conversion</div><div class="sc-val" id="s4">—</div><div class="sc-sub">closed / total</div></div>
    </div>
  </div>

  <div id="view-Leads" class="view-section">
    <div class="card" style="margin-bottom:20px;">
      <div class="ch">
        <div class="ct" id="domain-table-title">Leads</div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th>Lead Name</th><th>Phone</th><th>Rating</th><th>Website</th><th>Status</th><th>Assigned</th><th>Added On</th><th>Actions</th></tr></thead>
          <tbody id="leads-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="view-Status" class="view-section">
    <div class="card" style="margin-bottom:20px;">
      <div class="ch">
        <div class="ct">Filter by Status</div>
        <div class="ftabs" id="status-filters"></div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th>Lead Name</th><th>Phone</th><th>Rating</th><th>Website</th><th>Status</th><th>Assigned</th><th>Added On</th><th>Actions</th></tr></thead>
          <tbody id="status-leads-body"></tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Pipeline</div></div>
      <div id="pipe-wrap"></div>
    </div>
  </div>

  <div id="view-Team" class="view-section">
    <!-- TEAM -->
    <div class="tsec">
      <div class="shdr">
        <div class="stitle">Team</div>
        <button class="btn bg bsm" onclick="openAddTeam()">+ Add Member</button>
      </div>
      <div class="tgrid" id="team-grid"></div>
    </div>
  </div>
`;

// Replace from <!-- WEBHOOK BAR --> up to </main>
html = html.replace(/<!-- WEBHOOK BAR -->[\s\S]*?<\/main>/, newMainContent + '\\n</main>');

// 4. Update JS for dynamic loops and views
const newJsTop = `
const API = 'http://localhost:3001/api';
let leads=[], team=[], editId=null, filt='all', sq='';

const domains = [{ id: 'schools', label: 'Schools', icon: '🏫' }];
const statuses = ['new', 'contacted', 'qualified', 'closed'];
let currentDomain = 'schools';

function renderSidebarDomains() {
  const container = document.getElementById('leads-domains-list');
  container.innerHTML = domains.map(d => \\`< div class="ni" onclick = "setPage('Leads', this, '\${d.id}')" > <span class="ni-ic">\${d.icon}</span>\${ d.label }</div >\\`).join('');
}

function renderStatusFilters() {
  const container = document.getElementById('status-filters');
  if(!container) return;
  let html = \\`< div class="ft active" onclick = "setF('all',this)" > All</div >\\`;
  statuses.forEach(s => {
    html += \\`< div class="ft" onclick = "setF('\${s}',this)" >\${ s.charAt(0).toUpperCase() + s.slice(1) }</div >\\`;
  });
  container.innerHTML = html;
}

function toggleDropdown(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

function setPage(viewName, el, domainId = null) {
  if(domainId) currentDomain = domainId;
  document.getElementById('ptitle').textContent = domainId ? domains.find(d=>d.id===domainId).label : viewName;
  document.querySelectorAll('.ni:not(.dropdown-btn)').forEach(n => n.classList.remove('active'));
  if(el) el.classList.add('active');
  
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewName).classList.add('active');
  
  if(domainId) document.getElementById('domain-table-title').textContent = domains.find(d=>d.id===domainId).label + ' Leads';
  if((viewName === 'Leads' && domainId) || viewName === 'Status') rLeads();
}
`;
html = html.replace(/const API = 'http:\\/\\/localhost:3001\\/api';[\\s\\S]*?(?=\\/\/ ── API CALLS ──)/, newJsTop);

// 5. Update renderAll and rLeads
html = html.replace(/function renderAll\\(\\)\\{rStats\\(\\);rLeads\\(\\);rPipe\\(\\);rTeam\\(\\);popAssign\\(\\);\\}/,
  `function renderAll(){
  renderSidebarDomains();
  renderStatusFilters();
  rStats();
  rLeads();
  rPipe();
  rTeam();
  popAssign();
}`);

const newRLeads = `
function renderTable(tbodyId, leadsArray) {
  const tb = document.getElementById(tbodyId);
  if(!tb) return;
  if(!leadsArray.length) { tb.innerHTML = \\`< tr class="empty" > <td colspan="8">No leads found.</td></tr >\\`; return; }
  const bc = {new:'bn', contacted:'bc', qualified:'bq', closed:'bx'};
  tb.innerHTML = leadsArray.map(l => {
    const m = team.find(t=>t.id===l.assigned_id);
    const init = m ? m.name.split(' ').map(n=>n[0]).join('').slice(0,2) : '?';
    return \\`< tr >
      <td><div class="sn">\${l.school_name||'—'}</div><div class="sa">\${l.address||''}</div></td>
      <td><span class="ph">\${l.phone||'—'}</span></td>
      <td><div style="color:var(--a4);font-size:12px;">\${l.rating||'—'} ⭐</div><div style="font-size:11px;color:var(--tx3);">\${l.reviews?l.reviews+' reviews':''}</div></td>
      <td>\${l.website?\\`<a class="wb-link" href="\${l.website}" target="_blank">🌐 Visit</a>\\`:'—'}</td>
      <td>
        <select class="badge \${bc[l.status]||'bn'}" onchange="updStatus(\${l.id},this.value,this)" style="background:none;border:none;cursor:pointer;color:inherit;">
          \${statuses.map(s => \\`<option value="\${s}" \${l.status===s?'selected':''}>\${s==='new'?'🔵 New':s==='contacted'?'🟠 Contacted':s==='qualified'?'🟢 Qualified':'🔴 Closed'}</option>\\`).join('')}
        </select>
      </td >
      <td>
        <div style="display:flex;align-items:center;gap:7px;">
          <div style="width:24px;height:24px;border-radius:50%;background:\${m?.color||'#333'}22;color:\${m?.color||'#888'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;">\${init}</div>
          <span style="font-size:12px;">\${m?.name?.split(' ')[0]||'—'}</span>
        </div>
      </td>
      <td><div style="font-size:11px;color:var(--tx3);">\${l.created_at ? new Date(l.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div><div style="font-size:10.5px;color:var(--tx3);margin-top:2px;">\${l.created_at ? new Date(l.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : ''}</div></td>
      <td><div class="abts"><button class="ib" onclick="editLead(\${l.id})" title="Edit">✏️</button><button class="ib del" onclick="delLead(\${l.id})" title="Delete">🗑️</button></div></td>
    </tr >\\`;
  }).join('');
}

function rLeads(){
  const q = sq.toLowerCase();
  let domainLeads = leads.filter(l => {
    return (!q || (l.school_name||'').toLowerCase().includes(q) || (l.address||'').toLowerCase().includes(q) || (l.phone||'').toLowerCase().includes(q));
  });
  
  renderTable('leads-body', domainLeads);
  
  let statusLeads = domainLeads;
  if(filt !== 'all') {
    statusLeads = statusLeads.filter(l => l.status === filt);
  }
  renderTable('status-leads-body', statusLeads);
}
`;

html = html.replace(/function getFiltered\\(\\)[\\s\\S]*?(?=function rPipe\\(\\))/m, newRLeads);

// Remove setPage since we rely on our redefined one.
// Instead of complex parsing, just literally replace 'function setPage(p,el){document.getElementById('ptitle').textContent=p;document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));el.classList.add('active');}' 
// Oh wait we already redefined setPage at the top so if the old one exists, it will redefine or throw error (since it's a function declaration it will override our let/const or duplicate).
html = html.replace(/function setPage\\(p,el\\)\\{[^\\}]+\\}/, '');

fs.writeFileSync('index.html', html);
console.log('Update Complete.');
