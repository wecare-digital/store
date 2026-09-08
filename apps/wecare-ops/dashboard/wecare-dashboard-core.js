export const WECARE_SITE_ID = 'c17b0e20-d96d-4fa1-b05c-bc97c04b4ac5';
export const WECARE_INSTANCE_ID = '774311e1-05a1-4cc8-9ece-3093c30c6543';

export const WECARE_MODULES = Object.freeze([
  'Overview', 'Orders', 'Order IDs', 'SKU Manager', 'Invoices', 'Payment Links',
  'Forms', 'SEO', 'Automations', 'WhatsApp', 'System Tools'
]);

export function isAuthorizedTokenInfo(info) {
  return Boolean(info && info.active === true &&
    String(info.site_id || info.siteId || '') === WECARE_SITE_ID &&
    String(info.instance_id || info.instanceId || '') === WECARE_INSTANCE_ID);
}

export function buildDashboardHtml() {
  const site = WECARE_SITE_ID;
  const links = {
    orders: `https://manage.wix.com/dashboard/${site}/ecom-platform/orders-list`,
    invoices: `https://manage.wix.com/dashboard/${site}/wix-invoices`,
    payLinks: `https://manage.wix.com/dashboard/${site}/pay-links`,
    forms: `https://manage.wix.com/dashboard/${site}/wix-forms`,
    products: `https://manage.wix.com/dashboard/${site}/wix-stores/products`,
  };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WECARE</title><style>
:root{font-family:Inter,Arial,sans-serif;color:#111;background:#f7f8fa}*{box-sizing:border-box}body{margin:0}.top{padding:22px 28px;background:#fff;border-bottom:1px solid #e6e8ec}.top h1{margin:0;font-size:24px}.top p{margin:5px 0 0;color:#667085}.nav{display:flex;gap:8px;flex-wrap:wrap;padding:14px 24px;background:#fff;border-bottom:1px solid #e6e8ec;position:sticky;top:0}.nav button,.btn{border:1px solid #cfd4dc;background:#fff;border-radius:8px;padding:9px 12px;cursor:pointer}.nav button.active,.btn.primary{background:#111;color:#fff;border-color:#111}.main{padding:24px}.panel{display:none}.panel.active{display:block}.card{background:#fff;border:1px solid #e6e8ec;border-radius:12px;padding:18px;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.muted{color:#667085}.status{font-weight:600}.ok{color:#08783e}.warn{color:#9a6700}.bad{color:#b42318}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #eee;padding:9px;font-size:13px}input{padding:9px;border:1px solid #cfd4dc;border-radius:8px}pre{white-space:pre-wrap;background:#f6f7f9;padding:12px;border-radius:8px;max-height:420px;overflow:auto}a.btn{text-decoration:none;color:#111;display:inline-block}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}</style></head><body>
<header class="top"><h1>WECARE</h1><p>Private operations dashboard for WECARE.DIGITAL · Catalog V3</p></header>
<nav class="nav" id="nav">${WECARE_MODULES.map((x,i)=>`<button data-tab="t${i}"${i===0?' class="active"':''}>${x}</button>`).join('')}</nav>
<main class="main">
<section id="t0" class="panel active"><div class="grid"><div class="card"><h3>System</h3><div id="overviewStatus" class="muted">Loading…</div></div><div class="card"><h3>Catalog</h3><p>Wix Stores Catalog V3 only.</p><a class="btn" target="_blank" href="${links.products}">Open Products</a></div><div class="card"><h3>WhatsApp</h3><div id="overviewWhatsApp" class="muted">Checking connection…</div></div></div></section>
<section id="t1" class="panel"><div class="card"><div class="row"><h2>Orders</h2><button class="btn primary" onclick="loadOrders()">Refresh</button><a class="btn" target="_blank" href="${links.orders}">Open Wix Orders</a></div><div id="ordersOut" class="muted">Load orders to begin.</div></div></section>
<section id="t2" class="panel"><div class="card"><div class="row"><h2>Order IDs</h2><button class="btn primary" onclick="loadOrderIds()">Refresh</button></div><div id="orderIdsOut" class="muted">Load custom order IDs to begin.</div></div></section>
<section id="t3" class="panel"><div class="card"><h2>SKU Manager</h2><p class="muted">Collision-safe Catalog V3 generator. Preview is always available; Apply requires confirmation.</p><div class="row"><input id="skuPrefix" value="WD" maxlength="12" aria-label="SKU prefix"><button class="btn" onclick="skuPreview()">Preview Missing SKUs</button><button class="btn primary" onclick="skuApply()">Apply Missing SKUs</button></div><h3>Change Prefix</h3><div class="row"><input id="oldSkuPrefix" placeholder="Old prefix" maxlength="12" aria-label="Old SKU prefix"><input id="newSkuPrefix" value="WD" maxlength="12" aria-label="New SKU prefix"><button class="btn" onclick="skuReprefix(true)">Preview Prefix Change</button><button class="btn primary" onclick="skuReprefix(false)">Apply Prefix Change</button></div><pre id="skuOut">No scan run yet.</pre></div></section>
<section id="t4" class="panel"><div class="card"><h2>Invoices</h2><p>WECARE has Wix Invoices management permission.</p><a class="btn primary" target="_blank" href="${links.invoices}">Open Invoices</a></div></section>
<section id="t5" class="panel"><div class="card"><h2>Payment Links</h2><p>WECARE has Pay Links management permission.</p><a class="btn primary" target="_blank" href="${links.payLinks}">Open Payment Links</a></div></section>
<section id="t6" class="panel"><div class="card"><h2>Forms</h2><p>WECARE has Wix Forms read/edit/submissions permissions.</p><a class="btn primary" target="_blank" href="${links.forms}">Open Forms</a></div></section>
<section id="t7" class="panel"><div class="card"><div class="row"><h2>SEO</h2><button class="btn primary" onclick="loadSeo()">Refresh SEO Health</button></div><pre id="seoOut">Load SEO health to begin.</pre></div></section>
<section id="t8" class="panel"><div class="card"><div class="row"><h2>Automations</h2><button class="btn primary" onclick="loadAutomations()">Refresh</button></div><pre id="automationsOut">Load automation status to begin.</pre></div></section>
<section id="t9" class="panel"><div class="card"><h2>WhatsApp</h2><div id="whatsappOut" class="muted">Checking connection…</div><h3>Order activity mapping</h3><ul><li>Order approved → confirmation + custom WECARE Order ID</li><li>Payment status updated → payment update</li><li>Order fulfilled → fulfillment/delivery update</li><li>Refund completed → refund update</li></ul><p class="muted">Outbound messaging stays disabled until Meta WABA, Phone Number ID, and access-token secrets are present.</p></div></section>
<section id="t10" class="panel"><div class="card"><div class="row"><h2>System Tools</h2><button class="btn primary" onclick="loadStatus()">Run Health Check</button></div><pre id="systemOut">No health check run yet.</pre></div></section>
</main><script>
const instance=new URLSearchParams(location.search).get('instance')||'';
const api='/_functions/wecareApi?instance='+encodeURIComponent(instance);
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function call(action,payload={}){const r=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw new Error(text||('HTTP '+r.status))}if(!r.ok||data.ok===false)throw new Error(data.error||('HTTP '+r.status));return data;}
document.getElementById('nav').onclick=e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));};
function table(rows,cols){if(!rows.length)return '<p class="muted">No records.</p>';return '<table><thead><tr>'+cols.map(c=>'<th>'+esc(c[0])+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+esc(r[c[1]])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
async function loadStatus(){try{const d=await call('status');document.getElementById('systemOut').textContent=JSON.stringify(d,null,2);document.getElementById('overviewStatus').innerHTML='<span class="status ok">Secure gateway active</span><br>'+esc(d.catalogVersion)+' · '+esc(d.siteId);document.getElementById('overviewWhatsApp').innerHTML=d.whatsapp.connected?'<span class="ok">Connected</span>':'<span class="warn">Not connected</span>';document.getElementById('whatsappOut').textContent=d.whatsapp.connected?'Meta credentials detected.':'Meta credentials are not stored yet.';}catch(e){document.getElementById('systemOut').textContent=e.message;document.getElementById('overviewStatus').innerHTML='<span class="bad">'+esc(e.message)+'</span>';}}
async function loadOrders(){const el=document.getElementById('ordersOut');el.textContent='Loading…';try{const d=await call('orders');el.innerHTML=table(d.orders,[['Order','number'],['Created','createdDate'],['Payment','paymentStatus'],['Fulfillment','fulfillmentStatus'],['Total','total']]);}catch(e){el.textContent=e.message;}}
async function loadOrderIds(){const el=document.getElementById('orderIdsOut');el.textContent='Loading…';try{const d=await call('orderIds');el.innerHTML=table(d.items,[['Custom ID','customOrderId'],['Wix Order','wixOrderNumber'],['Created','orderCreatedDate'],['Products','productsSummary'],['Total','totalAmount']]);}catch(e){el.textContent=e.message;}}
async function skuPreview(){const el=document.getElementById('skuOut');el.textContent='Scanning Catalog V3…';try{el.textContent=JSON.stringify(await call('skuMissing',{prefix:document.getElementById('skuPrefix').value,dryRun:true}),null,2)}catch(e){el.textContent=e.message;}}
async function skuApply(){if(!confirm('Apply generated SKUs to every variant currently missing a SKU? Existing SKUs are preserved.'))return;const el=document.getElementById('skuOut');el.textContent='Applying…';try{el.textContent=JSON.stringify(await call('skuMissing',{prefix:document.getElementById('skuPrefix').value,dryRun:false}),null,2)}catch(e){el.textContent=e.message;}}
async function skuReprefix(dryRun){if(!dryRun&&!confirm('Apply this SKU prefix change to matching variants?'))return;const el=document.getElementById('skuOut');el.textContent=dryRun?'Previewing prefix change…':'Applying prefix change…';try{el.textContent=JSON.stringify(await call('skuReprefix',{oldPrefix:document.getElementById('oldSkuPrefix').value,newPrefix:document.getElementById('newSkuPrefix').value,dryRun}),null,2)}catch(e){el.textContent=e.message;}}
async function loadSeo(){const el=document.getElementById('seoOut');el.textContent='Loading…';try{el.textContent=JSON.stringify(await call('seoStatus'),null,2)}catch(e){el.textContent=e.message;}}
async function loadAutomations(){const el=document.getElementById('automationsOut');el.textContent='Loading…';try{el.textContent=JSON.stringify(await call('automations'),null,2)}catch(e){el.textContent=e.message;}}
loadStatus();
</script></body></html>`;
}
