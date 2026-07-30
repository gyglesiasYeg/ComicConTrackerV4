import { useEffect, useMemo, useState } from 'react';

const starter = [
  { id:'edmonton', name:'Edmonton Expo', city:'Edmonton, Alberta, Canada', dates:'Sept 18 - 20, 2026', start:'2026-09-18', startDate:'2026-09-18', endDate:'2026-09-20', venue:'Edmonton EXPO Centre', website:'https://fanexpohq.com/edmontonexpo/', guestUrl:'https://fanexpohq.com/edmontonexpo/all-guests/', hero:'linear-gradient(135deg,#12335f,#0b1220 45%,#203a5e)', guests:[] },
  { id:'calgary', name:'Calgary Expo', city:'Calgary, Alberta, Canada', dates:'Apr 22 - 25, 2027', start:'2027-04-22', startDate:'2027-04-22', endDate:'2027-04-25', venue:'Stampede Park', website:'https://fanexpohq.com/calgaryexpo/', guestUrl:'https://fanexpohq.com/calgaryexpo/celebrities/', hero:'linear-gradient(135deg,#5f1222,#180b14 45%,#3a1020)', guests:[] },
  { id:'nycc', name:'New York Comic Con', city:'New York, New York, USA', dates:'Oct 8 - 11, 2026', start:'2026-10-08', startDate:'2026-10-08', endDate:'2026-10-11', venue:'Javits Center', website:'https://www.newyorkcomiccon.com/', guestUrl:'https://www.newyorkcomiccon.com/en-us/guests.html', hero:'linear-gradient(135deg,#0f3a66,#0b1220 45%,#142c55)', guests:[] }
];

const budgetCategories = ['Hotel','Airline tickets','Convention tickets','Car rental','Parking / transit','Food','Autographs','Photo ops','Merchandise / memorabilia','Shipping','Accessibility needs','Emergency / buffer','Other extras'];
const accessTopics = ['Wheelchair / mobility access','Accessible entrances','Accessible washrooms','Accessible seating','Companion / caregiver policy','Service animals','Sensory / quiet room','ASL / interpretation','Captioning','Accessible parking','Medical assistance','Scooter / wheelchair rentals','Accessibility contact','Venue accessibility','Public transit accessibility'];
const known = {
  'christopher judge':'/api/img?u=https%3A%2F%2Fimagedelivery.net%2FVTBDqFF18S3r8M9B-TFWuA%2Fc6be3e1c-a4ad-4d3f-ecdf-6557a359ac00%2Fpublic',
  'karl urban':'/api/img?u=https%3A%2F%2Fknect365.imgix.net%2Fuploads%2FKARL-URBAN-BOYS-400x400-5c27173a10f70749384ecabf2b9e7b40.png%3Fauto%3Dformat%26fit%3Dmax%26w%3D462%26h%3D462%26dpr%3D1',
  'ron perlman':'/api/img?u=https%3A%2F%2Fimagedelivery.net%2FVTBDqFF18S3r8M9B-TFWuA%2Fe04eda41-97d8-496d-0f19-e1dc1d0afa00%2Fpublic',
  'nicolas cage':'/api/img?u=https%3A%2F%2Fcommons.wikimedia.org%2Fwiki%2FSpecial%3AFilePath%2FNicolas%2520Cage%2520Deauville%25202013%25202.jpg%3Fwidth%3D500',
  'john cena':'/api/img?u=https%3A%2F%2Fcommons.wikimedia.org%2Fwiki%2FSpecial%3AFilePath%2FJohn%2520Cena%2520by%2520Gage%2520Skidmore.jpg%3Fwidth%3D500',
  'dean norris':'/api/img?u=https%3A%2F%2Fcommons.wikimedia.org%2Fwiki%2FSpecial%3AFilePath%2FDean%2520Norris%2520by%2520Gage%2520Skidmore%25202.jpg%3Fwidth%3D500'
};

const junkWords = /\b(policy|privacy|cookie|contact|customer service|subscribe|newsletter|learn more|read on|hotel|travel|floor plan|visit|exhibit|exhibitor|media inquiries|rewards|discounts|coupons|mobile app|about us|terms|back to top|social|tickets|ticket|buy|shop|merch|sponsor|parking|faq|menu|navigation|volunteer|application|apply|login|account|service|show info|see all|sign up|join us)\b/i;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().replace(/^nicholas cage$/,'nicolas cage');
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || '?';
const num = v => { const n = Number(String(v || '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? n : 0; };
const sum = (items,key) => (items || []).reduce((a,x)=>a + num(x[key]),0);
const fmt = (n,c='CAD') => new Intl.NumberFormat('en-CA',{ style:'currency', currency:c }).format(Number(n || 0));
const defaultBudget = () => ({ currency:'CAD', budget:'', items:budgetCategories.map(name=>({ name, planned:'', actual:'', notes:'' })) });
const blankAccess = () => ({ status:'Not checked yet', lastChecked:'', source:'', items:accessTopics.map(name=>({ name, value:'Not checked yet' })), notes:'' });

function badUrl(u='') {
  u = String(u).toLowerCase();
  return !!u && ['logo','favicon','icon','badge','banner','header','wordmark','poster','cover','character','placeholder','share-image','og-image'].some(x=>u.includes(x));
}
function isJunkGuestName(name='') {
  const n = norm(name);
  if (!n) return true;
  if (junkWords.test(name)) return true;
  if (/^(guest|guests|celebrity|celebrities|comic creators?|animation voices?|voice actors?|sci fi|fantasy)$/i.test(String(name).trim())) return true;
  return false;
}
function looksPerson(name='') {
  const s = String(name || '').replace(/\s+/g,' ').trim();
  if (/^J\.?\s*R\.?\s*Ward$/i.test(s) || /^JR\s*Ward$/i.test(s)) return true;
  if (isJunkGuestName(s)) return false;
  if (s.length < 4 || s.length > 70) return false;
  if (/[,#$]|\$|https?:|@|:|\/|\\|\||\d{3,}/i.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (s === s.toUpperCase() && words.length >= 3) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'.\- ]+$/.test(s);
}
function cleanCon(c) {
  const counts = {};
  for (const g of c.guests || []) if (g.photoUrl) counts[g.photoUrl] = (counts[g.photoUrl] || 0) + 1;
  return {
    ...c,
    startDate: c.startDate || c.start || '',
    start: c.startDate || c.start || '',
    guests:(c.guests || []).filter(g=>looksPerson(g.name)).map(g=>{
      let photoUrl = g.photoUrl || '';
      const k = known[norm(g.name)] || '';
      if (k) photoUrl = k;
      else if (photoUrl && (badUrl(photoUrl) || counts[photoUrl] > 1)) photoUrl = '';
      return { ...g, hidden:g.hidden === true, must:g.must === true, photoUrl };
    })
  };
}
const cleanAll = cs => (cs || []).map(cleanCon);
function daysTo(c) {
  const s = c?.startDate || c?.start || '';
  if (!s) return 'TBD';
  const d = new Date(s + 'T00:00:00');
  const n = new Date();
  n.setHours(0,0,0,0);
  if (Number.isNaN(d.getTime())) return 'TBD';
  const diff = Math.ceil((d - n) / 86400000);
  if (diff < 0) return 'Completed';
  if (diff === 0) return 'Today';
  return diff;
}
function eventYear(c) {
  const raw = String(c?.startDate || c?.start || c?.dates || '');
  const m = raw.match(/20\d{2}/);
  return m ? m[0] : 'Unknown';
}
function budgetKey(c) { return `${c?.id || 'convention'}-${eventYear(c)}`; }
function displayDays(guest) {
  const d = guest?.days;
  if (Array.isArray(d) && d.filter(Boolean).length) return d.filter(Boolean).join(', ');
  if (typeof d === 'string' && d.trim()) return d.trim();
  return 'TBD';
}
function money(x) { return x ? `$${x}` : 'TBD'; }

function Photo({ g }) {
  const [bad,setBad] = useState(false);
  useEffect(()=>setBad(false),[g.photoUrl]);
  const box = { width:108,height:150,minWidth:108,borderRadius:16,background:'linear-gradient(135deg,#8b6b44,#20150f)',display:'grid',placeItems:'center',fontWeight:900,fontSize:30,overflow:'hidden' };
  if (g.photoUrl && !bad && !badUrl(g.photoUrl)) return <div style={box}><img style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }} src={g.photoUrl} alt={g.name} onError={()=>setBad(true)} /></div>;
  return <div style={box}><span style={{ background:'rgba(0,0,0,.25)',border:'1px solid rgba(255,255,255,.22)',borderRadius:'50%',width:58,height:58,display:'grid',placeItems:'center' }}>{initials(g.name)}</span></div>;
}

export default function App() {
  const [cons,setCons] = useState([]);
  const [active,setActive] = useState('edmonton');
  const [tab,setTab] = useState('home');
  const [busy,setBusy] = useState(false);
  const [photoBusy,setPhotoBusy] = useState({});
  const [accessBusy,setAccessBusy] = useState(false);
  const [log,setLog] = useState([]);
  const [q,setQ] = useState('');
  const [showHidden,setShowHidden] = useState(false);
  const [cache,setCache] = useState({});
  const [budgets,setBudgets] = useState({});
  const [access,setAccess] = useState({});

  useEffect(()=>{
    setCons(cleanAll(JSON.parse(localStorage.getItem('cc-v4-data') || 'null') || starter));
    setCache(JSON.parse(localStorage.getItem('cc-photo-cache') || '{}'));
    setBudgets(JSON.parse(localStorage.getItem('cc-budgets-v2') || '{}'));
    setAccess(JSON.parse(localStorage.getItem('cc-access-v1') || '{}'));
  },[]);
  useEffect(()=>{ if (cons.length) localStorage.setItem('cc-v4-data', JSON.stringify(cons)); },[cons]);
  useEffect(()=>localStorage.setItem('cc-photo-cache', JSON.stringify(cache)),[cache]);
  useEffect(()=>localStorage.setItem('cc-budgets-v2', JSON.stringify(budgets)),[budgets]);
  useEffect(()=>localStorage.setItem('cc-access-v1', JSON.stringify(access)),[access]);

  const con = cons.find(c=>c.id===active) || cons[0] || starter[0];
  const bkey = budgetKey(con);
  const budget = budgets[bkey] || defaultBudget();
  const visibleGuests = useMemo(()=>{
    const all = con.guests || [];
    const filtered = showHidden ? all.filter(g=>g.hidden) : all.filter(g=>!g.hidden);
    return filtered.filter(g=>!q || `${g.name} ${g.fandom || ''}`.toLowerCase().includes(q.toLowerCase()));
  },[con,showHidden,q]);
  const hiddenCount = (con.guests || []).filter(g=>g.hidden).length;
  const activeCount = (con.guests || []).filter(g=>!g.hidden).length;
  const photoCount = (con.guests || []).filter(g=>g.photoUrl && !badUrl(g.photoUrl)).length;

  function save(next) { setCons(p=>cleanAll(p.map(c=>c.id===next.id ? next : c))); }
  function update(id,patch) { setCons(p=>cleanAll(p.map(c=>c.id!==con.id ? c : { ...c, guests:c.guests.map(g=>g.id===id ? { ...g, ...patch } : g) }))); }
  function logItem(item) { setLog(p=>[{ time:new Date().toLocaleString(), ...item }, ...p].slice(0,20)); }

  async function refreshOne(c=con) {
    setBusy(true);
    try {
      const r = await fetch('/api/refresh',{ method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ convention:cleanCon(c) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Refresh failed');
      save(d.convention);
      logItem({ name:c.name, parsed:d.parsedGuestCount, mode:d.mode, methods:d.methods, changes:d.changes, warnings:d.warnings });
    } catch(e) { logItem({ name:c.name, error:e.message }); }
    finally { setBusy(false); }
  }
  async function refreshAll() {
    setBusy(true);
    for (const c of cons) await refreshOne(c);
    setBusy(false);
  }
  async function findPhoto(g) {
    setPhotoBusy(p=>({ ...p, [g.id]:true }));
    try {
      const k = norm(g.name), u = known[k] || cache[k];
      if (u && !badUrl(u)) { if (!cache[k]) setCache(p=>({ ...p, [k]:u })); update(g.id,{ photoUrl:u }); return; }
      const r = await fetch('/api/photo',{ method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ guest:g, cache }) });
      const d = await r.json();
      if (d.photoUrl && !badUrl(d.photoUrl)) { setCache(p=>({ ...p, [k]:d.photoUrl })); update(g.id,{ photoUrl:d.photoUrl }); }
    } finally { setPhotoBusy(p=>({ ...p, [g.id]:false })); }
  }
  async function findMissing() { for (const g of visibleGuests.filter(x=>!x.photoUrl).slice(0,25)) await findPhoto(g); }
  function cleanNow() { setCons(p=>cleanAll(p)); }
  function clearPhotos() { setCons(p=>p.map(c=>c.id===con.id ? { ...c, guests:c.guests.map(g=>({ ...g, photoUrl:'' })) } : c)); }
  function editPhoto(id) { const g=con.guests.find(x=>x.id===id), url=prompt(`Paste photo URL for ${g?.name}`, g?.photoUrl || ''); if (url !== null) { if (url.trim()) setCache(p=>({ ...p, [norm(g.name)]:url.trim() })); update(id,{ photoUrl:url.trim() }); } }
  function editDays(id) { const g=con.guests.find(x=>x.id===id); const val=prompt(`Enter appearing days for ${g?.name} (example: Thursday, Friday or Oct 10-11)`, displayDays(g)==='TBD' ? '' : displayDays(g)); if (val !== null) update(id,{ days:val.trim() ? val.split(',').map(x=>x.trim()).filter(Boolean) : ['TBD'] }); }
  async function updateOfficialDaysNow() {
    setBusy(true);
    try {
      let updated = 0;
      const next = JSON.parse(JSON.stringify(cons));
      for (const c of next) for (const g of c.guests || []) {
        if (Array.isArray(g.days) && g.days.length && !g.days.every(x=>String(x).toUpperCase()==='TBD')) continue;
        try {
          const r = await fetch('/api/days',{ method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ convention:c, guest:g }) });
          const d = await r.json();
          if (Array.isArray(d.days) && d.days.length && !d.days.every(x=>String(x).toUpperCase()==='TBD')) { g.days = d.days; updated++; }
        } catch {}
      }
      setCons(cleanAll(next));
      logItem({ name:'Appearance Days', parsed:updated, mode:'safe-days-only-update', changes:[{ type:'daysUpdated', name:String(updated) }] });
    } finally { setBusy(false); }
  }
  function setCurrentBudget(next) { setBudgets(m=>({ ...m, [bkey]: typeof next === 'function' ? next(m[bkey] || defaultBudget()) : next })); }
  function updateBudgetItem(i,patch) { setCurrentBudget(b=>({ ...b, items:b.items.map((x,n)=>n===i ? { ...x, ...patch } : x) })); }
  function addBudgetItem() { setCurrentBudget(b=>({ ...b, items:[...b.items, { name:'New expense', planned:'', actual:'', notes:'' }] })); }
  function resetBudget() { if (confirm('Clear this convention/year budget?')) setCurrentBudget(defaultBudget()); }
  async function updateAccessibility() {
    setAccessBusy(true);
    try {
      const r = await fetch('/api/accessibility',{ method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ convention:con }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Accessibility lookup failed');
      setAccess(a=>({ ...a, [con.id]:d }));
      logItem({ name:'Accessibility', parsed:d.items?.filter(x=>x.value && x.value !== 'Not found on official convention website').length || 0, mode:d.method || 'lookup', methods:{ guestPage:d.source }, changes:[] });
    } catch(e) {
      setAccess(a=>({ ...a, [con.id]:{ ...blankAccess(), status:'Error', notes:e.message, lastChecked:new Date().toISOString() } }));
      logItem({ name:'Accessibility', error:e.message });
    } finally { setAccessBusy(false); }
  }
  function removeCon() {
    if (cons.length <= 1) { alert('You need at least one convention in the app.'); return; }
    if (!confirm(`Remove ${con.name}? This removes it from this browser/app data.`)) return;
    setCons(p=>{ const next=p.filter(c=>c.id!==con.id); setActive(next[0]?.id || ''); setTab('home'); return next; });
  }
  function addCon() {
    const name = prompt('Convention name?');
    if (!name) return;
    const url = prompt('Official guest page or website URL?') || '';
    const id = 'custom-' + Date.now();
    setCons(p=>[{ id, name, city:'TBD', dates:'TBD', start:'', startDate:'', endDate:'', venue:'TBD', website:url, guestUrl:url, hero:'linear-gradient(135deg,#243244,#0b1220 45%,#2b3852)', guests:[], guestStatus:'No guests announced yet' }, ...p]);
    setActive(id);
    setTab('details');
  }

  if (!cons.length) return <div className="app"><main>Loading...</main></div>;

  return <div className="app">
    <header><button>☰</button><b>COMIC CON<br/><span>TRACKER V17.0</span></b><button onClick={()=>refreshOne()} disabled={busy}>🔄</button></header>
    <main>
      {tab === 'home' && <>
        <div className="notice"><b>V17.0 Generic Refresh:</b> shared parser, no locked guest lists, dynamic dates, hidden guest recovery, and “No guests announced yet” when a site has no valid guest names.</div>
        {cons.map(c=><button key={c.id} className="con" style={{ background:c.hero }} onClick={()=>{ setActive(c.id); setTab('details'); }}>
          <h2>{c.name}</h2><p>{c.city}</p><strong>{daysTo(c)}</strong><small>DAYS REMAINING</small>
          <div><span>👥 {(c.guests || []).filter(g=>!g.hidden).length} Guests</span><span>🙈 {(c.guests || []).filter(g=>g.hidden).length} Hidden</span><span>🖼️ {(c.guests || []).filter(g=>g.photoUrl && !badUrl(g.photoUrl)).length} Photos</span></div>
        </button>)}
        <button className="primary" onClick={refreshAll} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh All Conventions'}</button>
        <button className="secondary" onClick={addCon}>Add Convention</button>
      </>}

      {tab === 'details' && <>
        <section className="hero" style={{ background:con.hero }}><h1>{con.name}</h1><p>{con.city}</p><b>{con.dates}</b><div className="count"><strong>{daysTo(con)}</strong><span>DAYS</span></div></section>
        <section className="card"><h2>Convention Info</h2><p><b>Venue:</b> {con.venue}</p><p><b>Guest URL:</b> {con.guestUrl}</p><p><b>Guests:</b> {activeCount} active / {hiddenCount} hidden</p><p><b>Photos:</b> {photoCount} known photos</p><p><b>Status:</b> {con.guestStatus || (activeCount ? 'Guests found' : 'No guests announced yet')}</p><button className="primary" onClick={()=>refreshOne()} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh This Convention'}</button><button className="secondary" onClick={findMissing}>Find Known Photos</button><button className="secondary" onClick={cleanNow}>Clean Up Junk Guest Entries</button><button className="secondary" onClick={updateOfficialDaysNow}>Update Appearance Days</button><button className="secondary" onClick={clearPhotos}>Clear Photos For This Convention</button><button className="secondary danger" onClick={removeCon}>Remove This Convention</button></section>
        <h2>Recent Log</h2>{log.map((l,i)=><section className="card" key={i}><b>{l.name}</b><p>{l.time}</p>{l.error ? <p className="bad">{l.error}</p> : <><p>Parsed guests: {l.parsed}</p><p>Mode: {l.mode}</p><p>Backend: {l.methods?.guestPage}</p><p>Changes: {l.changes?.length || 0}</p>{l.warnings?.length ? <p className="bad">Warnings: {l.warnings.join(' | ')}</p> : null}</>}</section>)}
      </>}

      {tab === 'guests' && <>
        <h1>{con.name} Guests</h1>
        <section className="card"><div className="twocol"><button className={!showHidden ? 'primary small' : 'secondary small'} onClick={()=>setShowHidden(false)}>Active Guests ({activeCount})</button><button className={showHidden ? 'primary small' : 'secondary small'} onClick={()=>setShowHidden(true)}>Hidden Guests ({hiddenCount})</button></div><p>{showHidden ? 'Hidden guests are not deleted. Use Unhide if you change your mind.' : 'Only active guests are shown. Hidden guests can be reviewed anytime.'}</p></section>
        <div className="search"><span>🔎</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder={showHidden ? 'Search hidden guests' : 'Search guests'} /><button onClick={()=>setQ('')}>Clear</button></div>
        {!visibleGuests.length && <section className="card"><h2>{showHidden ? 'No hidden guests' : 'No guests announced yet'}</h2><p>{showHidden ? 'Guests you hide will appear here.' : 'When real guests are posted on the official site, Refresh This Convention will add them here.'}</p></section>}
        {visibleGuests.map(g=><section className="guest" key={g.id}><Photo g={g}/><div><h3>{g.name}</h3><p className="role">{g.fandom || 'Guest'}</p><p>Auto {money(g.auto)} · Photo {money(g.photo)}</p><p className="daysline"><b>Appearing:</b> {displayDays(g)}</p><p className="status">{g.photoUrl ? 'Known photo set' : 'No known photo'}</p><button onClick={()=>update(g.id,{ must:!g.must })}>{g.must ? '⭐ Must See' : '☆ Mark Must See'}</button>{showHidden ? <button onClick={()=>update(g.id,{ hidden:false })}>Unhide</button> : <button onClick={()=>update(g.id,{ hidden:true })}>Hide</button>}<button onClick={()=>findPhoto(g)}>{photoBusy[g.id] ? 'Finding...' : 'Find Known Photo'}</button><button onClick={()=>editPhoto(g.id)}>Add/Edit Photo</button><button onClick={()=>editDays(g.id)}>Add/Edit Days</button>{g.photoUrl && <button onClick={()=>update(g.id,{ photoUrl:'' })}>Clear Photo</button>}</div></section>)}
      </>}

      {tab === 'budget' && <>
        <h1>{con.name} ({eventYear(con)}) Budget</h1><section className="card"><h2>{con.name} · {eventYear(con)}</h2><label>Currency </label><select value={budget.currency} onChange={e=>setCurrentBudget(b=>({ ...b, currency:e.target.value }))}><option>CAD</option><option>USD</option></select><label> Total budget</label><input className="field" value={budget.budget} onChange={e=>setCurrentBudget(b=>({ ...b, budget:e.target.value }))} placeholder="0.00"/><p><b>Planned:</b> {fmt(sum(budget.items,'planned'),budget.currency)} · <b>Actual:</b> {fmt(sum(budget.items,'actual'),budget.currency)}</p><p><b>Remaining:</b> {fmt(num(budget.budget)-sum(budget.items,'actual'),budget.currency)}</p>{num(budget.budget)>0 && sum(budget.items,'actual')>num(budget.budget) && <p className="bad">Over budget by {fmt(sum(budget.items,'actual')-num(budget.budget),budget.currency)}</p>}</section>
        {budget.items.map((it,i)=><section className="card" key={i}><input className="field" value={it.name} onChange={e=>updateBudgetItem(i,{ name:e.target.value })}/><div className="twocol"><label>Budgeted<input className="field" value={it.planned} onChange={e=>updateBudgetItem(i,{ planned:e.target.value })} placeholder="0.00"/></label><label>Actual<input className="field" value={it.actual} onChange={e=>updateBudgetItem(i,{ actual:e.target.value })} placeholder="0.00"/></label></div><input className="field" value={it.notes} onChange={e=>updateBudgetItem(i,{ notes:e.target.value })} placeholder="Notes / confirmation number / link"/></section>)}
        <button className="secondary" onClick={addBudgetItem}>Add Extra Cost</button><button className="secondary" onClick={resetBudget}>Clear This Convention Budget</button>
      </>}

      {tab === 'accessibility' && <>
        <h1>Accessibility</h1><section className="card"><h2>{con.name}</h2><p>Checks convention and venue pages for accessibility details. It does not touch guests, pricing, photos, or days.</p><button className="primary" onClick={updateAccessibility} disabled={accessBusy}>{accessBusy ? 'Checking...' : 'Update Accessibility Info'}</button></section>
        {(()=>{ const a = access[con.id] || blankAccess(); return <><section className="card"><p><b>Status:</b> {a.status}</p><p><b>Last checked:</b> {a.lastChecked ? new Date(a.lastChecked).toLocaleString() : 'Never'}</p>{a.source && <p><b>Best source:</b> {a.source}</p>}{a.notes && <p>{a.notes}</p>}</section>{(a.items || []).map((x,i)=><section className="card" key={i}><b>{x.name}</b><p>{x.value}</p></section>)}</>; })()}
      </>}

      {tab === 'settings' && <section className="card"><h2>V17.0 Notes</h2><p>This version removes locked guest lists from refresh, validates all guest names globally, stores startDate/endDate for dynamic Days To, and adds an Active/Hidden guest view.</p></section>}
    </main>
    <nav>{['home','details','guests','budget','accessibility','settings'].map(t=><button key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t==='home'?'🏠':t==='details'?'☰':t==='guests'?'👥':t==='budget'?'💳':t==='accessibility'?'♿':'⚙️'}<span>{t}</span></button>)}</nav>
    <style jsx>{`.app{max-width:430px;margin:0 auto;min-height:100vh;background:radial-gradient(circle at 50% -20%,#18345d 0,#08111f 38%,#050914 100%);color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding-bottom:90px}header{position:sticky;top:0;z-index:9;display:flex;justify-content:space-between;align-items:center;padding:18px;background:rgba(5,9,20,.86);backdrop-filter:blur(18px)}header button{background:#0e1728;color:white;border:0;border-radius:14px;padding:10px}header b{text-align:center;line-height:.9;color:#d9ecff}header span{font-size:11px;letter-spacing:4px}main{padding:14px 16px}.notice,.card{background:linear-gradient(180deg,rgba(19,29,47,.96),rgba(10,16,28,.96));border:1px solid #1f2d43;border-radius:20px;padding:16px;margin-bottom:16px}.notice{border-color:#2e6dd0;color:#dcecff}.con{display:block;width:100%;border:1px solid #2d4f7a;color:white;text-align:left;border-radius:20px;margin-bottom:16px;padding:95px 16px 18px;box-shadow:0 16px 35px rgba(0,0,0,.35)}.con h2{font-size:26px;margin:0 0 5px}.con p{color:#d5d8de}.con strong{display:block;font-size:42px;color:#65a7ff}.con small{font-size:11px}.con div{display:flex;gap:12px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.18);margin-top:16px;padding-top:12px}.primary,.secondary{width:100%;border:0;border-radius:14px;padding:15px;color:white;font-weight:900;margin-bottom:10px}.primary{background:linear-gradient(135deg,#1261cf,#06408f)}.secondary{background:#182236;border:1px solid #2b3c57}.small{padding:10px;margin-bottom:0}.hero{position:relative;border-radius:0 0 28px 28px;padding:115px 18px 22px;margin:-14px -16px 18px}.hero h1{font-size:30px;margin:0}.hero p{color:#d1d5db}.count{position:absolute;right:18px;bottom:22px;background:rgba(0,0,0,.36);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px;text-align:center}.count strong{font-size:36px;display:block}.search{display:flex;gap:8px;align-items:center;background:#101827;border:1px solid #26354d;border-radius:16px;padding:10px;margin-bottom:12px}.search input{flex:1;background:transparent;border:0;color:white;outline:0}.search button{border:1px solid #32425e;background:#0d1424;color:#dbeafe;border-radius:10px;padding:7px 8px}.guest{display:grid;grid-template-columns:108px 1fr;gap:12px;background:#101827;border:1px solid #26354d;border-radius:20px;padding:12px;margin-bottom:12px;align-items:start}.guest h3{margin:0}.guest p{color:#cbd5e1;margin:5px 0}.guest .role{color:#dbeafe;font-weight:800;margin:4px 0}.guest .daysline{font-size:12px;color:#c7d2fe;margin:5px 0}.guest .status{font-size:12px;color:#9fb4d1}.guest button{border:1px solid #32425e;background:#0d1424;color:#dbeafe;border-radius:10px;padding:7px 8px;margin:4px 4px 0 0}.bad{color:#ff9b9b}.field{width:100%;box-sizing:border-box;background:#0d1424;color:white;border:1px solid #32425e;border-radius:12px;padding:10px;margin:6px 0}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:10px}select{background:#0d1424;color:white;border:1px solid #32425e;border-radius:10px;padding:8px;margin:6px 0}.danger{border-color:#7f1d1d!important;background:#3b1118!important}nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);max-width:430px;width:100%;display:grid;grid-template-columns:repeat(6,1fr);background:rgba(8,13,25,.94);border-top:1px solid #1f2d43;backdrop-filter:blur(18px);padding:9px 8px 22px}nav button{border:0;background:transparent;color:#a8b3c5;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px}nav button.on{color:#4da3ff}`}</style>
    <style jsx global>{`body{margin:0;background:#050914}`}</style>
  </div>;
}
