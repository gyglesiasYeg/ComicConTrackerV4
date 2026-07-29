import {useState} from 'react';

const conventions = {
  edmonton: {
    id:'edmonton',
    name:'Edmonton Expo',
    dates:'Sept 18 - 20, 2026',
    start:'2026-09-18',
    website:'https://fanexpohq.com/edmontonexpo/',
    guestUrl:'https://fanexpohq.com/edmontonexpo/all-guests/'
  },
  nycc: {
    id:'nycc',
    name:'New York Comic Con',
    dates:'Oct 8 - 11, 2026',
    start:'2026-10-08',
    website:'https://www.newyorkcomiccon.com/',
    guestUrl:'https://www.newyorkcomiccon.com/en-us/guests.html'
  },
  calgary: {
    id:'calgary',
    name:'Calgary Expo',
    dates:'Apr 22 - 25, 2027',
    start:'2027-04-22',
    website:'https://fanexpohq.com/calgaryexpo/',
    guestUrl:'https://fanexpohq.com/calgaryexpo/celebrities/'
  }
};

export default function PricingTest(){
  const [conId,setConId]=useState('edmonton');
  const [guestName,setGuestName]=useState('Karl Urban');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);

  async function test(){
    setBusy(true);
    setResult(null);
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),25000);
      const r=await fetch('/api/price-debug',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({convention:conventions[conId],guestName}),
        signal:controller.signal
      });
      clearTimeout(timer);
      setResult(await r.json().catch(()=>({error:'Could not parse API response'})));
    }catch(e){
      setResult({error:e.message || String(e)});
    }finally{
      setBusy(false);
    }
  }

  return <div className="page">
    <main>
      <h1>Pricing Test Tool</h1>
      <p className="note">This page is isolated from the main tracker. It tests one guest and does not save or change app data.</p>

      <section className="card">
        <label>Convention</label>
        <select value={conId} onChange={e=>setConId(e.target.value)}>
          {Object.entries(conventions).map(([id,c])=><option value={id} key={id}>{c.name}</option>)}
        </select>

        <label>Guest name</label>
        <input value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder="Karl Urban" />

        <button onClick={test} disabled={busy}>{busy?'Testing...':'Test Pricing API'}</button>
      </section>

      {result&&<section className="card">
        <h2>Result</h2>
        <p><b>Guest:</b> {result.guestName || guestName}</p>
        <p><b>Autograph:</b> {result.auto ? `$${result.auto}` : 'TBD / not found'}</p>
        <p><b>Photo Op:</b> {result.photo ? `$${result.photo}` : 'TBD / not found'}</p>
        <p><b>Method:</b> {result.method || 'n/a'}</p>
        <p><b>Source:</b> {result.source || 'n/a'}</p>
        {result.note&&<p className="warn">{result.note}</p>}
        {result.error&&<p className="bad">{result.error}</p>}
        <details>
          <summary>Checked URLs / raw API details</summary>
          <pre>{JSON.stringify(result,null,2)}</pre>
        </details>
      </section>}
    </main>
    <style jsx>{`
      .page{max-width:760px;margin:0 auto;min-height:100vh;background:#07101d;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px}
      h1{font-size:32px;margin:0 0 10px}
      .note{color:#bfd3ee}
      .card{background:#111b2d;border:1px solid #26354d;border-radius:18px;padding:18px;margin:16px 0}
      label{display:block;font-weight:800;margin-top:12px;margin-bottom:6px;color:#dbeafe}
      input,select{width:100%;box-sizing:border-box;background:#08111f;color:white;border:1px solid #334766;border-radius:12px;padding:12px;font-size:16px}
      button{width:100%;border:0;border-radius:14px;padding:14px;margin-top:16px;background:linear-gradient(135deg,#1261cf,#06408f);color:white;font-weight:900;font-size:16px}
      button:disabled{opacity:.6}
      pre{white-space:pre-wrap;word-break:break-word;background:#050914;border:1px solid #27364f;border-radius:14px;padding:12px;max-height:420px;overflow:auto}
      .warn{color:#facc15}.bad{color:#ff9b9b}
    `}</style>
  </div>
}
