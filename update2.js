const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Rename "Status" to "Prospects" in Sidebar and make it a dropdown
html = html.replace(`<div class="ni" onclick="setPage('Status',this)"><span class="ni-ic">🚦</span>Status</div>`,
  `<div class="ni dropdown-btn" onclick="toggleDropdown(this)"><div style="display:flex;align-items:center;gap:9px;"><span class="ni-ic">🚦</span>Prospects</div><span class="arrow">▶</span></div>
  <div class="dropdown-content" id="prospects-filter-list"></div>`);

// 2. Remove the Pipeline and Conversion cards from the Dashboard grid
// By doing this we keep: Total Leads, New Leads, Avg Rating.
// We also need to change the stats grid columns from 4 to 3 so it stretches nicely.
html = html.replace('.stats {\\n      display: grid;\\n      grid-template-columns: repeat(4, 1fr);', '.stats {\\n      display: grid;\\n      grid-template-columns: repeat(3, 1fr);');
html = html.replace(`<div class="sc c4"><div class="sc-ic">💰</div><div class="sc-lbl">Conversion</div><div class="sc-val" id="s4">—</div><div class="sc-sub">closed / total</div></div>`, ``);

// 3. Remove Leads table and Pipeline from Dashboard view, replace with Team view ONLY
// We'll also rename the ID 'view-Status' to 'view-Prospects'
html = html.replace(/<div id="view-Status" class="view-section">[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>/,
  `<div id="view-Prospects" class="view-section">
    <div class="card" style="margin-bottom:20px;">
      <div class="ch">
        <div class="ct" id="prospect-table-title">Prospects</div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th>Lead Name</th><th>Phone</th><th>Rating</th><th>Website</th><th>Status</th><th>Assigned</th><th>Added On</th><th>Actions</th></tr></thead>
          <tbody id="status-leads-body"></tbody>
        </table>
      </div>
    </div>
  </div>`);

// 4. Update the Javascript logic
html = html.replace(/function renderStatusFilters\(\) \{[\s\S]*?\}/,
  `function renderStatusFilters() {
  const container = document.getElementById('prospects-filter-list');
  if(!container) return;
  let html = \`<div class="ni" onclick="setPage('Prospects', this, 'all')"><span class="ni-ic">📋</span>All</div>\`;
  statuses.forEach(s => {
    const icon = s==='new'?'🔵':s==='contacted'?'🟠':s==='qualified'?'🟢':'🔴';
    html += \`<div class="ni" onclick="setPage('Prospects', this, '\${s}')"><span class="ni-ic">\${icon}</span>\${s.charAt(0).toUpperCase() + s.slice(1)}</div>\`;
  });
  container.innerHTML = html;
}`);

html = html.replace(/function setPage\(viewName, el, domainId = null\) \{[\s\S]*?\}/,
  `function setPage(viewName, el, param = null) {
  if(viewName === 'Leads') currentDomain = param;
  if(viewName === 'Prospects' && param) filt = param;
  
  let ptitle = viewName;
  if(viewName === 'Leads' && param) ptitle = domains.find(d=>d.id===param).label;
  if(viewName === 'Prospects' && param) ptitle = param === 'all' ? 'All Prospects' : (param.charAt(0).toUpperCase() + param.slice(1) + ' Prospects');
  
  document.getElementById('ptitle').textContent = ptitle;
  
  document.querySelectorAll('.ni:not(.dropdown-btn)').forEach(n => n.classList.remove('active'));
  if(el) el.classList.add('active');
  
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewName).classList.add('active');
  
  if(viewName === 'Leads' && param) document.getElementById('domain-table-title').textContent = domains.find(d=>d.id===param).label + ' Leads';
  if(viewName === 'Prospects' && param) document.getElementById('prospect-table-title').textContent = ptitle;
  
  if(viewName === 'Leads' || viewName === 'Prospects') rLeads();
}`);

// 5. Fix the stats logic so ALL leads without a valid status are correctly categorized as 'new' 
html = html.replace(`const nw = leads.filter(l => !l.status || l.status?.toLowerCase() === 'new').length;`,
  `const nw = leads.filter(l => {
    const st = (l.status || '').toLowerCase().trim();
    return !st || st === 'new' || !['contacted', 'qualified', 'closed'].includes(st);
  }).length;`);

html = html.replace(`document.getElementById('s4').textContent = tot ? Math.round(closed / tot * 100) + '%' : '0%';`, '');

fs.writeFileSync('index.html', html);
console.log('Update Complete.');
