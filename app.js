// ═══════════════════════════════════════════════════════
// CONFIG — paste your Supabase project URL and anon key here
// ═══════════════════════════════════════════════════════
const SUPABASE_URL = '%%SUPABASE_URL%%';
const SUPABASE_ANON_KEY = '%%SUPABASE_ANON_KEY%%';

// ═══════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
let currentUser = null;
let authMode = 'signin'; // 'signin' | 'signup'

function toggleAuthMode(){
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = authMode === 'signup';
  document.getElementById('authDesc').textContent = isSignup
    ? 'Create an account to start tracking.'
    : 'Sign in to access your tracker.';
  document.getElementById('authBtn').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('authToggleLink').textContent = isSignup ? 'Sign in instead' : 'Create an account';
  document.getElementById('authPassword').autocomplete = isSignup ? 'new-password' : 'current-password';
  document.getElementById('authErr').style.display = 'none';
}

async function handleAuth(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const err = document.getElementById('authErr');
  const btn = document.getElementById('authBtn');
  err.style.display = 'none';

  if(!email || !email.includes('@')){
    err.textContent = 'Please enter a valid email address.';
    err.style.display = 'block';
    return;
  }
  if(!password || password.length < 6){
    err.textContent = 'Password must be at least 6 characters.';
    err.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${authMode === 'signup' ? 'Creating account…' : 'Signing in…'}`;

  const { error } = authMode === 'signup'
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  if(error){
    err.textContent = error.message;
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
  }
  // On success, onAuthStateChange handles showing the app
}

// Allow pressing Enter in either field to submit
document.getElementById('authEmail').addEventListener('keydown', e => {
  if(e.key === 'Enter') document.getElementById('authPassword').focus();
});
document.getElementById('authPassword').addEventListener('keydown', e => {
  if(e.key === 'Enter') handleAuth();
});

async function signOut(){
  await sb.auth.signOut();
  currentUser = null;
  players = []; matches = [];
  document.getElementById('syncBar').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('authBtn').disabled = false;
  document.getElementById('authBtn').textContent = 'Sign In';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  authMode = 'signin';
}

// Listen for auth state changes
sb.auth.onAuthStateChange(async (event, session) => {
  if(session?.user){
    currentUser = session.user;
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('syncBar').classList.remove('hidden');
    document.getElementById('userEmail').textContent = currentUser.email;
    renderQuilt();
    await loadAll();
    renderDashboard();
  } else {
    currentUser = null;
  }
});

// ═══════════════════════════════════════════════════════
// DATA LAYER — all queries scoped to current user via RLS
// ═══════════════════════════════════════════════════════
let players = [];
let matches = [];

function setSyncStatus(state, msg){
  document.getElementById('syncDot').className = 'sync-dot ' + state;
  document.getElementById('syncMsg').textContent = msg;
}

async function loadAll(){
  setSyncStatus('syncing', 'Loading…');
  try{
    const [{ data: p, error: pe }, { data: m, error: me }] = await Promise.all([
      sb.from('pw_players').select('*').order('created_at', { ascending: true }),
      sb.from('pw_matches').select('*').order('created_at', { ascending: true })
    ]);
    if(pe) throw pe;
    if(me) throw me;
    players = p || [];
    matches = m || [];
    setSyncStatus('ok', 'Synced');
  } catch(e){
    setSyncStatus('err', 'Error loading data');
    toast('❌ Could not load data: ' + e.message);
  }
}

async function insertPlayer(p){
  const { error } = await sb.from('pw_players').insert({ ...p, user_id: currentUser.id });
  if(error) throw error;
}

async function deletePlayerFromDB(id){
  // Delete matches where this player is the only participant
  const soloMatches = matches.filter(m => m.players.every(p => p.id === id));
  for(const m of soloMatches){
    await sb.from('pw_matches').delete().eq('id', m.id);
  }
  const { error } = await sb.from('pw_players').delete().eq('id', id);
  if(error) throw error;
}

async function insertMatch(m){
  const { error } = await sb.from('pw_matches').insert({ ...m, user_id: currentUser.id });
  if(error) throw error;
}

async function deleteMatchFromDB(id){
  const { error } = await sb.from('pw_matches').delete().eq('id', id);
  if(error) throw error;
}

// ═══════════════════════════════════════════════════════
// APP CONSTANTS & STATE
// ═══════════════════════════════════════════════════════
const COLORS = ['#C4622D','#D4A017','#6B7F5E','#5B7FA6','#C9748A','#4A8B8B','#8B5E3C','#7B5EA7','#2C7873','#BF6035'];
let selectedColor = '#C4622D';
let matchPlayers = [];
let pendingDeleteType = null, pendingDeleteId = null;
let chartInstances = {};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function getPlayer(id){ return players.find(p => p.id === id) }
function ini(name){ return (name||'?').charAt(0).toUpperCase() }
function calcScore(mp){ return (mp.buttons??0) - (2*(mp.emptySpaces??0)) + (mp.bonusTile ? 7 : 0) }
function hexToRgba(hex, a){
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function playerStats(pid){
  const pm = matches.filter(m => m.players.some(p => p.id === pid));
  const wins = pm.filter(m => [...m.players].sort((a,b) => b.score-a.score)[0]?.id === pid).length;
  const scores = pm.map(m => m.players.find(p => p.id === pid)?.score ?? 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const highScore = scores.length ? Math.max(...scores) : 0;
  const empties = pm.map(m => m.players.find(p=>p.id===pid)?.emptySpaces??null).filter(v=>v!==null);
  return {
    played: pm.length, wins, losses: pm.length-wins, avgScore, highScore,
    winRate: pm.length ? Math.round(wins/pm.length*100) : 0,
    minEmpty: empties.length ? Math.min(...empties) : null
  };
}

function renderQuilt(){
  const el = document.getElementById('headerQuilt');
  const c = [...COLORS,'#F5EFE0','#FAF7F0','#5C3A1E'];
  el.innerHTML = Array.from({length:18},(_,i) =>
    `<div class="quilt-cell" style="background:${c[i%c.length]};animation-delay:${(i*.18).toFixed(1)}s"></div>`
  ).join('');
}

function renderAuthQuilt(){
  const el = document.getElementById('authQuilt');
  const c = [...COLORS,'#F5EFE0','#EDE0C8'];
  el.innerHTML = Array.from({length:15},(_,i) =>
    `<div class="auth-quilt-cell" style="background:${c[i%c.length]};height:20px"></div>`
  ).join('');
}
renderAuthQuilt();

Chart.defaults.font.family = "'DM Mono', monospace";
Chart.defaults.color = '#8B5E3C';
function destroyChart(id){ if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id] } }

// ═══════════════════════════════════════════════════════
// PANEL NAV
// ═══════════════════════════════════════════════════════
function showPanel(id){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  document.querySelector(`.nav-tab[data-panel="${id}"]`)?.classList.add('active');
  if(id==='dashboard') renderDashboard();
  if(id==='history') renderHistory();
  if(id==='players') renderPlayers();
  if(id==='records') renderRecords();
  if(id==='log-match') renderMatchForm();
  if(id==='charts') renderCharts();
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
function renderDashboard(){
  const el = document.getElementById('dashboardContent');
  if(!el) return;
  if(players.length === 0){
    el.innerHTML = `<div class="empty"><div class="empty-icon">🧵</div><p>No players yet. <a href="#" onclick="showPanel('players')" style="color:var(--terracotta)">Add your first player</a> to get started!</p></div>`;
    return;
  }
  let topScore={val:-Infinity,pid:null}, bigGap={val:-1};
  matches.forEach(m => {
    m.players.forEach(mp => { if(mp.score > topScore.val) topScore={val:mp.score,pid:mp.id} });
    if(m.players.length>=2){ const s=m.players.map(p=>p.score); const g=Math.max(...s)-Math.min(...s); if(g>bigGap.val) bigGap.val=g }
  });
  let bestWR={val:-1,p:null};
  players.forEach(p => { const s=playerStats(p.id); if(s.played>0&&s.winRate>bestWR.val) bestWR={val:s.winRate,p} });

  const statsHtml = `<div class="grid-auto" style="margin-bottom:32px">
    <div class="stat-card"><div class="stat-icon">🎲</div><div class="stat-value">${matches.length}</div><div class="stat-label">Matches Played</div></div>
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${players.length}</div><div class="stat-label">Players</div></div>
    <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-value">${topScore.val>-Infinity?topScore.val:'–'}</div><div class="stat-label">Highest Score</div><div class="stat-holder">${topScore.pid?getPlayer(topScore.pid)?.name||'':''}</div></div>
    <div class="stat-card"><div class="stat-icon">📐</div><div class="stat-value">${bigGap.val>-1?bigGap.val:'–'}</div><div class="stat-label">Biggest Gap</div></div>
    ${bestWR.p?`<div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${bestWR.val}%</div><div class="stat-label">Best Win Rate</div><div class="stat-holder">${bestWR.p.name}</div></div>`:''}
  </div>`;

  const lb = players.map(p=>({...p,...playerStats(p.id)})).filter(p=>p.played>0).sort((a,b)=>b.wins-a.wins||b.winRate-a.winRate);
  let lbHtml = '';
  if(lb.length > 0){
    lbHtml = `<div class="section-title" style="margin-top:0">Leaderboard</div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:32px"><div style="overflow-x:auto"><table>
    <thead><tr><th>#</th><th>Player</th><th>Played</th><th>Wins</th><th>Win Rate</th><th>Avg Score</th><th>Best Score</th></tr></thead>
    <tbody>${lb.map((p,i) => {
      const rc = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-other';
      return `<tr><td><span class="rank-badge ${rc}">${i+1}</span></td>
        <td><div style="display:flex;align-items:center;gap:10px">
          <div class="player-avatar" style="background:${p.color};width:32px;height:32px;font-size:.85rem">${ini(p.name)}</div>
          <span style="font-family:'Lora',serif;font-weight:600">${p.name}</span>
        </div></td>
        <td>${p.played}</td><td><strong>${p.wins}</strong></td>
        <td><div>${p.winRate}%</div><div class="win-rate-bar"><div class="win-rate-fill" style="width:${p.winRate}%"></div></div></td>
        <td>${p.avgScore}</td><td style="color:var(--terracotta);font-weight:600">${p.highScore}</td>
      </tr>`;
    }).join('')}</tbody></table></div></div>`;
  }

  const sortedM = [...matches].sort((a,b) => new Date(a.date)-new Date(b.date));
  let miniChartHtml = '';
  if(sortedM.length >= 2 && players.length >= 1){
    miniChartHtml = `<div class="section-title">Score Trend</div>
    <div class="chart-card"><p>Score over time for all players</p><div class="chart-wrap"><canvas id="dashScoreChart"></canvas></div></div>`;
  }

  const recent = [...matches].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,3);
  let recentHtml = '';
  if(recent.length > 0){
    recentHtml = `<div class="section-title">Recent Matches</div>${recent.map(m=>matchCard(m)).join('')}`;
    if(matches.length > 3) recentHtml += `<div style="text-align:center;margin-top:12px"><button class="btn btn-secondary btn-sm" onclick="showPanel('history')">View All ${matches.length} Matches →</button></div>`;
  }

  el.innerHTML = statsHtml + lbHtml + miniChartHtml + recentHtml;
  if(sortedM.length >= 2) setTimeout(() => renderScoreTimeChart('dashScoreChart'), 50);
}

// ═══════════════════════════════════════════════════════
// MATCH CARD
// ═══════════════════════════════════════════════════════
function matchCard(m, showDel=false){
  const sorted = [...m.players].sort((a,b) => b.score-a.score);
  const d = new Date(m.date+'T12:00:00');
  const dateStr = d.toLocaleDateString('en-GB', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const gap = sorted.length>=2 ? sorted[0].score - sorted[sorted.length-1].score : null;
  const playersHtml = sorted.map((mp,i) => {
    const p=getPlayer(mp.id); const pn=p?p.name:'Unknown', pc=p?p.color:'#999';
    return `<div class="match-player-score ${i===0?'winner':''}">
      ${i===0?'<div class="winner-crown">👑</div>':''}
      <div class="score-name"><div class="player-avatar" style="background:${pc};width:22px;height:22px;font-size:.65rem;border-radius:4px">${ini(pn)}</div>${pn}</div>
      <div class="score-big">${mp.score}</div>
      <div class="score-detail">${mp.buttons!==undefined?`${mp.buttons} buttons · `:''}${mp.emptySpaces!==undefined?`${mp.emptySpaces} empty`:''}${mp.bonusTile?' · 🎯 7×7':''}</div>
    </div>`;
  }).join('');
  return `<div class="match-entry">
    <div class="match-date">${dateStr}${gap!==null?`<span style="margin-left:12px;color:var(--brown-mid)">Gap: <strong>${gap}</strong> pts</span>`:''}
    ${showDel?`<span style="float:right"><button class="btn btn-danger btn-sm" onclick="confirmDeleteMatch('${m.id}')">Delete</button></span>`:''}
    </div><div class="match-players">${playersHtml}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════
// MATCH FORM
// ═══════════════════════════════════════════════════════
function renderMatchForm(){
  document.getElementById('matchDate').value = new Date().toISOString().split('T')[0];
  if(matchPlayers.length===0 && players.length>=2) matchPlayers = players.slice(0,2).map(p=>({id:p.id}));
  else if(matchPlayers.length===0 && players.length===1) matchPlayers = [{id:players[0].id}];
  renderMPS();
}
function renderMPS(){
  const el = document.getElementById('matchPlayersSection');
  if(!el) return;
  if(players.length===0){ el.innerHTML=`<div class="notice">⚠️ <a href="#" onclick="showPanel('players')">Add players</a> first!</div>`; return }
  el.innerHTML = matchPlayers.map((_,idx) => buildMpRow(matchPlayers[idx],idx)).join('');
  matchPlayers.forEach((_,idx) => updatePreview(idx));
}
function buildMpRow(mp, idx){
  const p=getPlayer(mp.id), pc=p?p.color:'#999';
  return `<div class="match-player-row">
    <div class="match-player-header">
      <div class="player-avatar" style="background:${pc};width:32px;height:32px;font-size:.9rem">${p?ini(p.name):'?'}</div>
      <select onchange="mpChanged(${idx},this.value)" style="flex:1">
        ${players.map(pl=>`<option value="${pl.id}"${pl.id===mp.id?' selected':''}>${pl.name}</option>`).join('')}
      </select>
      ${matchPlayers.length>1?`<button class="btn btn-secondary btn-sm" onclick="removeMp(${idx})">✕</button>`:''}
    </div>
    <div class="form-row">
      <div class="form-group"><label>Buttons Earned</label><input type="number" min="0" max="999" placeholder="0" value="${mp.buttons??''}" oninput="mpField(${idx},'buttons',this.value)"></div>
      <div class="form-group"><label>Empty Spaces</label><input type="number" min="0" max="81" placeholder="0" value="${mp.emptySpaces??''}" oninput="mpField(${idx},'emptySpaces',this.value)"></div>
      <div class="form-group"><label>7×7 Bonus?</label>
        <select onchange="mpField(${idx},'bonusTile',this.value)">
          <option value="0"${!mp.bonusTile?' selected':''}>No</option>
          <option value="1"${mp.bonusTile?' selected':''}>Yes (+7 pts)</option>
        </select>
      </div>
    </div>
    <div class="score-preview" id="score-preview-${idx}"></div>
  </div>`;
}
function updatePreview(idx){
  const mp=matchPlayers[idx];
  const b=mp.buttons??0, e=mp.emptySpaces??0, bonus=mp.bonusTile?7:0, score=calcScore(mp);
  const el=document.getElementById('score-preview-'+idx);
  if(el) el.innerHTML=`<span class="preview-val">${score}</span><span class="preview-formula">= ${b} buttons − ${2*e} (${e}×2 empty)${bonus?' + 7 bonus':''}</span>`;
}
function mpChanged(idx,v){ matchPlayers[idx].id=v; renderMPS() }
function mpField(idx,f,v){
  if(f==='bonusTile') matchPlayers[idx].bonusTile=v==='1';
  else matchPlayers[idx][f]=v===''?undefined:Number(v);
  updatePreview(idx);
}
function addMatchPlayer(){
  if(matchPlayers.length>=players.length) return;
  const used=matchPlayers.map(p=>p.id);
  const next=players.find(p=>!used.includes(p.id));
  if(next) matchPlayers.push({id:next.id});
  renderMPS();
}
function removeMp(idx){ matchPlayers.splice(idx,1); renderMPS() }

async function saveMatch(){
  const date=document.getElementById('matchDate').value;
  if(!date){ toast('Please enter a date.'); return }
  if(matchPlayers.length<1){ toast('Add at least one player.'); return }
  const btn=document.getElementById('saveMatchBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span>Saving…';
  try{
    const mp=matchPlayers.map(mp=>({id:mp.id,buttons:mp.buttons??0,score:calcScore(mp),emptySpaces:mp.emptySpaces??0,bonusTile:mp.bonusTile??false}));
    const m={id:Date.now().toString(),date,players:mp};
    await insertMatch(m);
    matches.push(m);
    matchPlayers=[];
    toast('✅ Match saved!');
    setSyncStatus('ok','Synced');
    showPanel('dashboard');
  }catch(e){
    toast('❌ Error saving: '+e.message);
    setSyncStatus('err','Sync error');
  }finally{
    btn.disabled=false; btn.innerHTML='💾 Save Match';
  }
}

// ═══════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════
function renderHistory(){
  const el=document.getElementById('historyContent');
  if(!el) return;
  if(matches.length===0){ el.innerHTML=`<div class="empty"><div class="empty-icon">📋</div><p>No matches yet. <a href="#" onclick="showPanel('log-match')" style="color:var(--terracotta)">Log your first match!</a></p></div>`; return }
  el.innerHTML=[...matches].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(m=>matchCard(m,true)).join('');
}

// ═══════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════
function renderScoreTimeChart(canvasId){
  destroyChart(canvasId);
  const sortedM=[...matches].sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(sortedM.length<2) return;
  const datasets=players.map(p=>{
    const data=sortedM.map(m=>{const e=m.players.find(pl=>pl.id===p.id);return e?{x:m.date,y:e.score}:null}).filter(Boolean);
    if(!data.length) return null;
    return{label:p.name,data,borderColor:p.color,backgroundColor:hexToRgba(p.color,.1),pointBackgroundColor:p.color,pointRadius:5,pointHoverRadius:7,tension:.35,fill:false,borderWidth:2.5};
  }).filter(Boolean);
  const canvas=document.getElementById(canvasId);
  if(!canvas) return;
  chartInstances[canvasId]=new Chart(canvas,{
    type:'line',data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',labels:{usePointStyle:true,pointStyle:'circle',padding:16,font:{size:11}}},
        tooltip:{callbacks:{title:items=>new Date(items[0].label+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}}},
      scales:{x:{type:'category',ticks:{maxTicksLimit:8,maxRotation:30,font:{size:10}},grid:{color:'rgba(92,58,30,.06)'}},
        y:{ticks:{font:{size:10}},grid:{color:'rgba(92,58,30,.06)'},title:{display:true,text:'Score',font:{size:11}}}}}
  });
}

function renderH2HChart(canvasId,pidA,pidB){
  destroyChart(canvasId);
  const pA=getPlayer(pidA),pB=getPlayer(pidB);
  if(!pA||!pB) return;
  const shared=matches.filter(m=>m.players.some(p=>p.id===pidA)&&m.players.some(p=>p.id===pidB)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(!shared.length){ const el=document.getElementById(canvasId); if(el) el.parentElement.innerHTML=`<div class="empty" style="padding:32px"><p>No shared matches yet.</p></div>`; return }
  const labels=shared.map(m=>new Date(m.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
  const sA=shared.map(m=>m.players.find(p=>p.id===pidA)?.score??0);
  const sB=shared.map(m=>m.players.find(p=>p.id===pidB)?.score??0);
  const canvas=document.getElementById(canvasId);
  if(!canvas) return;
  chartInstances[canvasId]=new Chart(canvas,{
    type:'bar',
    data:{labels,datasets:[
      {label:pA.name,data:sA,backgroundColor:hexToRgba(pA.color,.75),borderColor:pA.color,borderWidth:2,borderRadius:4},
      {label:pB.name,data:sB,backgroundColor:hexToRgba(pB.color,.75),borderColor:pB.color,borderWidth:2,borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',labels:{usePointStyle:true,pointStyle:'circle',padding:16,font:{size:11}}}},
      scales:{x:{grid:{color:'rgba(92,58,30,.06)'},ticks:{font:{size:10}}},
        y:{grid:{color:'rgba(92,58,30,.06)'},ticks:{font:{size:10}},title:{display:true,text:'Score',font:{size:11}}}}}
  });
}

function renderH2HWinRecord(pidA,pidB){
  const pA=getPlayer(pidA),pB=getPlayer(pidB);
  if(!pA||!pB) return '';
  const shared=matches.filter(m=>m.players.some(p=>p.id===pidA)&&m.players.some(p=>p.id===pidB));
  if(!shared.length) return '';
  let wA=0,wB=0,draws=0;
  shared.forEach(m=>{ const sA=m.players.find(p=>p.id===pidA)?.score??0,sB=m.players.find(p=>p.id===pidB)?.score??0; if(sA>sB)wA++;else if(sB>sA)wB++;else draws++; });
  const pctA=Math.round(wA/shared.length*100), pctB=Math.round(wB/shared.length*100);
  return `<div class="h2h-row">
    <div class="h2h-name" style="color:${pA.color}">${pA.name}</div>
    <div style="flex:1"><div class="h2h-bar-wrap">
      <div class="h2h-bar-a" style="background:${pA.color};width:${pctA}%"></div>
      <div class="h2h-bar-b" style="background:${pB.color};width:${pctB}%"></div>
    </div><div style="display:flex;justify-content:space-between;margin-top:4px;font-size:.65rem;color:var(--brown-light)">${shared.length} matches${draws?` · ${draws} draw${draws>1?'s':''}`:''}</div></div>
    <div class="h2h-score"><span style="color:${pA.color}">${wA}</span> – <span style="color:${pB.color}">${wB}</span></div>
    <div class="h2h-name" style="text-align:right;color:${pB.color}">${pB.name}</div>
  </div>`;
}

function renderCharts(){
  const el=document.getElementById('chartsContent');
  if(!el) return;
  if(matches.length<2){ el.innerHTML=`<div class="empty"><div class="empty-icon">📈</div><p>Log at least 2 matches to see charts.</p></div>`; return }
  const p0=players[0]?.id||'', p1=players[1]?.id||players[0]?.id||'';
  el.innerHTML=`
    <div class="chart-card">
      <h3>Score Over Time</h3>
      <p>Each player's score across all matches, in chronological order</p>
      <div class="chart-wrap-tall"><canvas id="scoreTimeChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Head-to-Head</h3>
      <p>Compare scores and win record between any two players</p>
      <div class="h2h-select-row">
        <div class="form-group" style="flex:0 0 160px"><label>Player A</label>
          <select id="h2hA" onchange="refreshH2H()">
            ${players.map(p=>`<option value="${p.id}"${p.id===p0?' selected':''}>${p.name}</option>`).join('')}
          </select>
        </div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:var(--brown-light);padding-bottom:10px">vs</div>
        <div class="form-group" style="flex:0 0 160px"><label>Player B</label>
          <select id="h2hB" onchange="refreshH2H()">
            ${players.map(p=>`<option value="${p.id}"${p.id===p1?' selected':''}>${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="h2hWinRecord"></div>
      <div class="chart-wrap"><canvas id="h2hChart"></canvas></div>
    </div>`;
  setTimeout(()=>{ renderScoreTimeChart('scoreTimeChart'); refreshH2H(); },50);
}
function refreshH2H(){
  const pidA=document.getElementById('h2hA')?.value, pidB=document.getElementById('h2hB')?.value;
  if(!pidA||!pidB) return;
  document.getElementById('h2hWinRecord').innerHTML=renderH2HWinRecord(pidA,pidB);
  renderH2HChart('h2hChart',pidA,pidB);
}

// ═══════════════════════════════════════════════════════
// PLAYERS
// ═══════════════════════════════════════════════════════
function renderColorPicker(){
  const el=document.getElementById('colorPicker'); if(!el) return;
  el.innerHTML=COLORS.map(c=>`<div class="color-swatch${c===selectedColor?' selected':''}" style="background:${c}" onclick="selectColor('${c}')"></div>`).join('');
}
function selectColor(c){ selectedColor=c; renderColorPicker() }

async function addPlayer(){
  const name=document.getElementById('newPlayerName').value.trim();
  if(!name){ toast('Please enter a name.'); return }
  if(players.some(p=>p.name.toLowerCase()===name.toLowerCase())){ toast('Name already taken!'); return }
  const btn=document.getElementById('addPlayerBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span>Saving…';
  try{
    const p={id:Date.now().toString(),name,color:selectedColor};
    await insertPlayer(p);
    players.push(p);
    document.getElementById('newPlayerName').value='';
    toast(`👤 ${name} added!`);
    setSyncStatus('ok','Synced');
    renderPlayers();
  }catch(e){ toast('❌ Error: '+e.message); setSyncStatus('err','Sync error'); }
  finally{ btn.disabled=false; btn.innerHTML='Add Player'; }
}

function renderPlayers(){
  renderColorPicker();
  const el=document.getElementById('playersList'); if(!el) return;
  if(players.length===0){ el.innerHTML=`<div class="empty"><div class="empty-icon">👤</div><p>No players yet.</p></div>`; return }
  el.innerHTML=players.map(p=>{
    const s=playerStats(p.id);
    return `<div class="player-card">
      <div class="player-avatar" style="background:${p.color}">${ini(p.name)}</div>
      <div class="player-info">
        <div class="player-name-big">${p.name}</div>
        <div class="player-stats-mini">${s.played} matches · ${s.wins}W ${s.losses}L · Avg ${s.avgScore} pts</div>
        <div class="win-rate-bar" style="width:120px;margin-top:6px"><div class="win-rate-fill" style="width:${s.winRate}%"></div></div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="confirmDeletePlayer('${p.id}')">✕</button>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
// RECORDS
// ═══════════════════════════════════════════════════════
function renderRecords(){
  const el=document.getElementById('recordsContent'); if(!el) return;
  if(matches.length===0){ el.innerHTML=`<div class="empty"><div class="empty-icon">🏅</div><p>Play some matches to see records!</p></div>`; return }
  const recs=[];
  let hs={val:-Infinity,pid:null,date:''};
  matches.forEach(m=>m.players.forEach(mp=>{if(mp.score>hs.val)hs={val:mp.score,pid:mp.id,date:m.date}}));
  if(hs.pid) recs.push({icon:'🏆',title:'Highest Score',val:hs.val,pid:hs.pid,detail:`single game · ${hs.date}`});
  let ls={val:Infinity,pid:null,date:''};
  matches.forEach(m=>m.players.forEach(mp=>{if(mp.score<ls.val)ls={val:mp.score,pid:mp.id,date:m.date}}));
  if(ls.pid&&ls.val<Infinity) recs.push({icon:'😬',title:'Lowest Score',val:ls.val,pid:ls.pid,detail:`most painful · ${ls.date}`});
  let fe={val:Infinity,pid:null,date:''};
  matches.forEach(m=>m.players.forEach(mp=>{if(mp.emptySpaces!==undefined&&mp.emptySpaces<fe.val)fe={val:mp.emptySpaces,pid:mp.id,date:m.date}}));
  if(fe.pid&&fe.val<Infinity) recs.push({icon:'🧩',title:'Least Empty Spaces',val:fe.val,pid:fe.pid,detail:`empty squares · ${fe.date}`});
  let me={val:-1,pid:null,date:''};
  matches.forEach(m=>m.players.forEach(mp=>{if((mp.emptySpaces??-1)>me.val)me={val:mp.emptySpaces,pid:mp.id,date:m.date}}));
  if(me.pid&&me.val>-1) recs.push({icon:'🕳️',title:'Most Empty Spaces',val:me.val,pid:me.pid,detail:`empty squares · ${me.date}`});
  let bg={val:-1,pid:null,date:''};
  matches.forEach(m=>{if(m.players.length>=2){const s=m.players.map(p=>p.score);const g=Math.max(...s)-Math.min(...s);if(g>bg.val){const w=[...m.players].sort((a,b)=>b.score-a.score)[0];bg={val:g,pid:w.id,date:m.date}}}});
  if(bg.pid) recs.push({icon:'📐',title:'Biggest Point Gap',val:bg.val,pid:bg.pid,detail:`point difference · ${bg.date}`});
  const bt={};matches.forEach(m=>m.players.forEach(mp=>{if(mp.bonusTile)bt[mp.id]=(bt[mp.id]||0)+1}));
  const topBt=Object.entries(bt).sort((a,b)=>b[1]-a[1])[0];
  if(topBt) recs.push({icon:'🎯',title:'Most 7×7 Bonuses',val:topBt[1],pid:topBt[0],detail:`times completed the special tile`});
  const streaks={};
  players.forEach(p=>{
    let max=0,cur=0;
    matches.filter(m=>m.players.some(pl=>pl.id===p.id)).sort((a,b)=>new Date(a.date)-new Date(b.date))
      .forEach(m=>{[...m.players].sort((a,b)=>b.score-a.score)[0]?.id===p.id?++cur>max&&(max=cur):cur=0});
    if(max>0)streaks[p.id]=max;
  });
  const topStr=Object.entries(streaks).sort((a,b)=>b[1]-a[1])[0];
  if(topStr) recs.push({icon:'🔥',title:'Longest Win Streak',val:topStr[1],pid:topStr[0],detail:`consecutive wins`});
  let bwr={val:-1,pid:null};
  players.forEach(p=>{const s=playerStats(p.id);if(s.played>=3&&s.winRate>bwr.val)bwr={val:s.winRate,pid:p.id}});
  if(bwr.pid) recs.push({icon:'⭐',title:'Best Win Rate',val:`${bwr.val}%`,pid:bwr.pid,detail:`min 3 games played`});
  let comeback={val:-1,pid:null,date:''};
  matches.forEach(m=>{if(m.players.length>=2){const w=[...m.players].sort((a,b)=>b.score-a.score)[0];if(w.emptySpaces!==undefined&&w.emptySpaces>comeback.val)comeback={val:w.emptySpaces,pid:w.id,date:m.date}}});
  if(comeback.pid&&comeback.val>0) recs.push({icon:'💪',title:'Biggest Comeback',val:comeback.val,pid:comeback.pid,detail:`empty spaces & still won · ${comeback.date}`});

  const cardsHtml=recs.map(r=>{
    const p=getPlayer(r.pid); if(!p) return '';
    return `<div class="stat-card" style="text-align:left;position:relative;overflow:hidden">
      <div style="position:absolute;right:-8px;top:-8px;font-size:3rem;opacity:.07">${r.icon}</div>
      <div style="font-size:1.5rem;margin-bottom:8px">${r.icon}</div>
      <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:2px;color:var(--brown-light);margin-bottom:4px">${r.title}</div>
      <div class="stat-value" style="font-size:2.2rem;margin-bottom:8px">${r.val}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div class="player-avatar" style="background:${p.color};width:24px;height:24px;font-size:.7rem;border-radius:4px">${ini(p.name)}</div>
        <span style="font-family:'Lora',serif;font-weight:600;font-size:.9rem">${p.name}</span>
      </div>
      <div style="font-size:.7rem;color:var(--brown-light)">${r.detail}</div>
    </div>`;
  }).join('');

  const tableHtml=`<div class="section-title" style="margin-top:32px">Full Stats Comparison</div>
  <div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table>
    <thead><tr><th>Player</th><th>Matches</th><th>Wins</th><th>Win %</th><th>Avg Score</th><th>Best Score</th><th>Fewest Empty</th></tr></thead>
    <tbody>${players.map(p=>{const s=playerStats(p.id);return`<tr>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="player-avatar" style="background:${p.color};width:28px;height:28px;font-size:.8rem">${ini(p.name)}</div>
        <span style="font-family:'Lora',serif;font-weight:600">${p.name}</span>
      </div></td>
      <td>${s.played}</td><td>${s.wins}</td><td>${s.winRate}%</td><td>${s.avgScore||'–'}</td>
      <td style="color:var(--terracotta);font-weight:600">${s.highScore||'–'}</td>
      <td>${s.minEmpty!==null?s.minEmpty:'–'}</td>
    </tr>`}).join('')}</tbody>
  </table></div></div>`;

  el.innerHTML=`<div class="grid-3">${cardsHtml}</div>${tableHtml}`;
}

// ═══════════════════════════════════════════════════════
// DELETE / MODAL
// ═══════════════════════════════════════════════════════
function confirmDeletePlayer(id){
  const p=getPlayer(id); pendingDeleteType='player'; pendingDeleteId=id;
  document.getElementById('modalTitle').textContent=`Delete ${p?.name}?`;
  document.getElementById('modalBody').textContent='This will remove the player and any matches they appear in alone. Cannot be undone.';
  document.getElementById('modalConfirmBtn').onclick=executeDelete;
  document.getElementById('modal').classList.add('open');
}
function confirmDeleteMatch(id){
  pendingDeleteType='match'; pendingDeleteId=id;
  document.getElementById('modalTitle').textContent='Delete this match?';
  document.getElementById('modalBody').textContent='This match record will be permanently removed.';
  document.getElementById('modalConfirmBtn').onclick=executeDelete;
  document.getElementById('modal').classList.add('open');
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); pendingDeleteType=null; pendingDeleteId=null }

async function executeDelete(){
  const type=pendingDeleteType, id=pendingDeleteId;
  closeModal();
  if(!type||!id) return;
  setSyncStatus('syncing','Deleting…');
  try{
    if(type==='player'){
      players=players.filter(p=>p.id!==id);
      matches=matches.map(m=>({...m,players:m.players.filter(p=>p.id!==id)})).filter(m=>m.players.length>0);
      await deletePlayerFromDB(id);
      renderPlayers(); toast('🗑 Player deleted'); setSyncStatus('ok','Synced');
    }else if(type==='match'){
      matches=matches.filter(m=>m.id!==id);
      await deleteMatchFromDB(id);
      renderHistory(); toast('🗑 Match deleted'); setSyncStatus('ok','Synced');
    }
  }catch(e){
    toast('❌ Delete failed: '+e.message); setSyncStatus('err','Sync error');
    await loadAll(); renderHistory();
  }
}
document.getElementById('modal').addEventListener('click', function(e){ if(e.target===this) closeModal() });

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
function toast(msg){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .4s'; setTimeout(()=>t.remove(),400) },2800);
}

// ═══════════════════════════════════════════════════════
// PWA MANIFEST
// ═══════════════════════════════════════════════════════
const manifest={name:'Patchwork Tracker',short_name:'Patchwork',description:'Track your Patchwork board game scores',start_url:'.',display:'standalone',background_color:'#F5EFE0',theme_color:'#2C1A0E',
  icons:[
    {src:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="#2C1A0E"/><text x="96" y="130" font-size="110" text-anchor="middle" fill="#D4A017" font-family="serif">🧵</text></svg>`),sizes:'192x192',type:'image/svg+xml'},
    {src:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="80" fill="#2C1A0E"/><text x="256" y="360" font-size="300" text-anchor="middle" fill="#D4A017" font-family="serif">🧵</text></svg>`),sizes:'512x512',type:'image/svg+xml'}
  ]};
const mBlob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
document.getElementById('manifestLink').href=URL.createObjectURL(mBlob);

// ═══════════════════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════════════════
if('serviceWorker' in navigator){
  const sw=`const CACHE='patchwork-v3';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll([self.location.href])));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.url.includes('supabase.co')||e.request.url.includes('fonts.google')||e.request.url.includes('cloudflare')||e.request.url.includes('jsdelivr')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));return res})));
});`;
  navigator.serviceWorker.register(URL.createObjectURL(new Blob([sw],{type:'application/javascript'}))).catch(()=>{});
}
