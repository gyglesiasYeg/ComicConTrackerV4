# Comic Con Tracker V15.9 Pricing Fix

This update adds a pricing collector for autograph and photo-op prices.

## What was wrong

Your existing refresh/parser creates every guest with:

```js
auto: 0,
photo: 0,
```

and the UI shows `TBD` when those values are `0`. So the display is working, but no backend price updater existed to populate those fields.

## Files to add

Add this new file:

```text
pages/api/prices.js
```

Use the included `pages/api/prices.js` from this zip.

## Required changes in `pages/index.js`

### 1. Add this function near your existing `updateOfficialDaysNow()` function

```js
async function updatePricingNow(){
  setBusy(true);
  try{
    let updated=0;
    let next=JSON.parse(JSON.stringify(cons));

    for(const c of next){
      for(const g of c.guests||[]){
        try{
          const r=await fetch('/api/prices',{
            method:'POST',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({convention:c,guest:g})
          });
          const d=await r.json();
          let changed=false;
          if(d.auto && Number(d.auto)>0 && Number(g.auto||0)!==Number(d.auto)){
            g.auto=Number(d.auto);
            changed=true;
          }
          if(d.photo && Number(d.photo)>0 && Number(g.photo||0)!==Number(d.photo)){
            g.photo=Number(d.photo);
            changed=true;
          }
          if(d.source) g.priceSource=d.source;
          if(changed) updated++;
        }catch{}
      }
    }

    setCons(cleanAll(next));
    setLog(p=>[{time:new Date().toLocaleString(),name:'Pricing',parsed:updated,mode:'safe-price-update',changes:[{type:'pricesUpdated',name:String(updated)}]},...p].slice(0,20));
  }finally{
    setBusy(false);
  }
}
```

### 2. Add this button beside your other Details buttons

Find this part in the Details section:

```jsx
<button className="secondary" onClick={updateOfficialDaysNow}>Update Appearance Days</button>
```

Add this right after it:

```jsx
<button className="secondary" onClick={updatePricingNow}>Update Pricing</button>
```

### 3. Optional but recommended: make the version visible

Change:

```jsx
<span>TRACKER V15.8</span>
```

to:

```jsx
<span>TRACKER V15.9</span>
```

Change the home notice to include pricing, for example:

```text
V15.9 Safer Source Days + Pricing:
```

## How to use after deploy

1. Commit this to GitHub.
2. Let Vercel redeploy.
3. Open the app in a fresh/private browser.
4. Open a convention > Details.
5. Select **Update Pricing**.
6. Go to Guests and confirm the price line changes from `Auto TBD · Photo TBD` where prices are available.

## What this does and does not do

- It updates only `guest.auto` and `guest.photo`.
- It tries official/source pages and likely Epic/Leap guest URLs.
- It works for current conventions and new conventions when the event follows a clear Epic/Leap URL pattern or exposes links/prices on the official/source pages.
- It does not invent prices. If the source page does not expose a price, it keeps `TBD`.
- It avoids using add-on prices like JPEG copy, extra print, frame, quote, sticker, or combo prices as the main autograph/photo-op price when it can detect them.
