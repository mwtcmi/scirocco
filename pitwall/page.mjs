// The Pitwall page: one self-contained screen with four tabs. Served only after the Access sign-in check.
export const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pitwall | 799 Motorsport</title>
<style>
:root{--black:#050505;--panel:#121212;--line:#363636;--copy:#cfcfcf;--green:#20C933;--red:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--black);color:#fff;font-family:Arial,Helvetica,sans-serif}
.wrap{width:min(1180px,calc(100% - 32px));margin:auto}
header{border-bottom:1px solid #292929;padding:20px 0}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.brand{font-size:17px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.brand span{color:var(--green)}
.who{color:#888;font-size:12px}.badge{display:inline-block;margin-left:10px;padding:4px 8px;border:1px solid var(--green);color:var(--green);font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}
.badge.test{border-color:#f2d600;color:#f2d600}
nav{display:flex;gap:8px;margin:22px 0 26px;flex-wrap:wrap}
nav button{min-height:44px;padding:0 18px;border:1px solid var(--line);background:none;color:#fff;font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;cursor:pointer}
nav button[aria-selected=true]{border-color:var(--green);color:var(--green)}
h1{margin:0 0 6px;font-size:40px;line-height:.95;letter-spacing:-.03em;text-transform:uppercase}
.kicker{color:var(--green);font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;margin-bottom:10px}
p.help{color:#999;font-size:14px;line-height:1.5;margin:6px 0 22px;max-width:760px}
.card{border:1px solid var(--line);background:var(--panel);padding:18px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 10px 10px 0;border-top:1px solid var(--line);vertical-align:middle}
th{color:#999;font-size:10px;letter-spacing:.14em;text-transform:uppercase;border-top:0}
.scroll{overflow-x:auto}
input,textarea,select{width:100%;min-height:44px;padding:10px 12px;border:1px solid #444;background:#0b0b0b;color:#fff;font:inherit;font-size:15px}
textarea{min-height:90px}input[type=checkbox]{width:22px;min-height:22px;accent-color:var(--green)}
label.f{display:block;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#aaa;margin-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.grid .wide{grid-column:span 2}.grid .full{grid-column:1/-1}
button.go,button.alt{min-height:44px;padding:0 18px;border:0;background:var(--green);color:#050505;font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;cursor:pointer}
button.alt{background:none;border:1px solid #555;color:#fff}button:disabled{opacity:.4;cursor:not-allowed}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.right{margin-left:auto}
.muted{color:#888;font-size:12px}.ok{color:var(--green)}.bad{color:var(--red)}
.msg{min-height:22px;margin:10px 0;font-size:14px}
.pill{display:inline-block;padding:3px 8px;border:1px solid #555;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#ccc}
.pill.on{border-color:var(--green);color:var(--green)}.pill.done{border-color:#555;color:#777}
td input.num{width:110px}
.policy{color:#aaa;font-size:13px;line-height:1.5;white-space:pre-wrap}
@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.grid .wide{grid-column:1/-1}h1{font-size:32px}}
</style>
</head>
<body>
<header><div class="wrap top"><div class="brand">799 <span>Pitwall</span><span class="badge" id="store">{{STORE}}</span></div><div class="who" id="who"></div></div></header>
<main class="wrap">
<nav role="tablist">
<button role="tab" data-tab="orders" aria-selected="true">Orders</button>
<button role="tab" data-tab="events" aria-selected="false">Events</button>
<button role="tab" data-tab="stock" aria-selected="false">Stock</button>
<button role="tab" data-tab="prices" aria-selected="false">Prices</button>
</nav>
<p class="msg" id="msg" role="status"></p>

<section data-panel="orders">
<div class="kicker">Paddock Store</div><h1>Orders</h1>
<p class="help">Newest first. Mark an order done once it's handed over or shipped. Full payment details are in Stripe.</p>
<div class="row" style="margin-bottom:14px"><label class="row muted"><input type="checkbox" id="show-done"> Show done orders</label></div>
<div id="orders"></div>
</section>

<section data-panel="events" hidden>
<div class="kicker">Paddock pickup</div><h1>Events</h1>
<p class="help">Events that are on and not over yet show "Order ahead, pick up in the 799 paddock" on the store, and buyers can choose paddock pickup until the order-by date. "Where to find 799" goes only in the buyer's order email.</p>
<form class="card" id="event-form">
<div class="grid">
<div class="wide"><label class="f" for="e-name">Event name</label><input id="e-name" required maxlength="80" placeholder="Empire Hill Climb"></div>
<div class="wide"><label class="f" for="e-place">Place</label><input id="e-place" maxlength="80" placeholder="Empire, MI"></div>
<div><label class="f" for="e-starts">First day</label><input id="e-starts" type="date" required></div>
<div><label class="f" for="e-ends">Last day</label><input id="e-ends" type="date" required></div>
<div><label class="f" for="e-orderby">Order by</label><input id="e-orderby" type="date" required></div>
<div><label class="f" for="e-active">On</label><label class="row" style="min-height:44px"><input type="checkbox" id="e-active" checked> Show on store</label></div>
<div class="full"><label class="f" for="e-where">Where to find 799</label><input id="e-where" maxlength="200" placeholder="Paddock row B, look for the green Scirocco"></div>
</div>
<div class="row" style="margin-top:14px"><button class="go" type="submit" id="e-save">Add event</button><button class="alt" type="button" id="e-cancel" hidden>Cancel edit</button></div>
</form>
<div class="scroll"><table><thead><tr><th>Event</th><th>Dates</th><th>Order by</th><th>Orders</th><th>Status</th><th></th></tr></thead><tbody id="events"></tbody></table></div>
</section>

<section data-panel="stock" hidden>
<div class="kicker">Paddock Store</div><h1>Stock</h1>
<p class="help">What's on hand. Online orders take stock off by themselves. Set a count after a restock, or after a cash or Tap to Pay sale.</p>
<div class="scroll"><table><thead><tr><th>Item</th><th>On hand</th><th></th><th>Last changed</th></tr></thead><tbody id="stock"></tbody></table></div>
</section>

<section data-panel="prices" hidden>
<div class="kicker">Paddock Store</div><h1>Prices</h1>
<p class="help">Saving updates the store pages, Google's product info and checkout together, about 2 minutes later. Each change is recorded in GitHub with your email.</p>
<div id="prices"></div>
</section>
</main>
<script>
(function(){
var $=function(id){return document.getElementById(id)},esc=function(v){var d=document.createElement('div');d.textContent=v==null?'':String(v);return d.innerHTML};
var money=function(c){return '$'+(Number(c||0)/100).toFixed(2)},dollars=function(n){return '$'+Number(n||0).toFixed(2)};
var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function day(d){if(!d)return '';var p=d.split('-');return M[+p[1]-1]+' '+(+p[2])+', '+p[0]}
function when(ms){if(!ms)return '';var d=new Date(ms);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
function msg(t,bad){var m=$('msg');m.textContent=t||'';m.className='msg '+(bad?'bad':'ok')}
function api(path,opt){opt=opt||{};return fetch('/api'+path,{method:opt.method||'GET',headers:opt.body?{'Content-Type':'application/json'}:{},body:opt.body?JSON.stringify(opt.body):undefined,credentials:'same-origin'})
 .then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})})}
function fail(e){msg(e.message||'Something went wrong.',true)}
// Tabs
var loaders={orders:loadOrders,events:loadEvents,stock:loadStock,prices:loadPrices};
document.querySelectorAll('nav button').forEach(function(b){b.onclick=function(){show(b.dataset.tab)}});
function show(tab){document.querySelectorAll('nav button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===tab)});
 document.querySelectorAll('[data-panel]').forEach(function(p){p.hidden=p.dataset.panel!==tab});msg('');try{history.replaceState(null,'','#'+tab)}catch(e){}loaders[tab]()}
api('/me').then(function(me){$('who').textContent=me.email;if(/test/i.test(me.store))$('store').className='badge test'}).catch(function(){});

// Orders
var orders=[];
function loadOrders(){api('/orders').then(function(j){orders=j.orders;drawOrders()}).catch(fail)}
$('show-done').onchange=drawOrders;
function drawOrders(){var all=$('show-done').checked,list=orders.filter(function(o){return all||o.status!=='done'});
 if(!list.length){$('orders').innerHTML='<p class="muted">No '+(all?'':'open ')+'orders.</p>';return}
 $('orders').innerHTML=list.map(function(o){var how=o.how==='event'?'Paddock pickup: '+esc(o.event||'event'):o.how==='ship'?'Ship':o.how==='table'?'Paid at the table':o.how==='pickup'?'Traverse City pickup':esc(o.how);
  var a=o.shipTo&&o.shipTo.address,addr=a?[o.shipTo.name,a.line1,a.line2,[a.city,a.state].filter(Boolean).join(', ')+' '+(a.postal_code||'')].filter(Boolean).map(esc).join('<br>'):'';
  return '<div class="card"><div class="row"><strong>'+o.number+'</strong><span class="pill '+(o.status==='done'?'done':'on')+'">'+(o.status==='done'?'Done':'Open')+'</span>'+(o.live?'':'<span class="pill">Test</span>')+
  '<span class="muted">'+when(o.created)+'</span><span class="right"><strong>'+money(o.total)+'</strong></span></div>'+
  '<p style="margin:10px 0 4px">'+o.lines.map(esc).join('<br>')+'</p><p class="muted" style="margin:8px 0">'+how+'</p>'+
  '<p style="margin:0 0 10px;font-size:14px">'+[esc(o.name),o.email?'<a style="color:#20C933" href="mailto:'+esc(o.email)+'">'+esc(o.email)+'</a>':'',o.phone?'<a style="color:#20C933" href="tel:'+esc(o.phone)+'">'+esc(o.phone)+'</a>':''].filter(Boolean).join(' · ')+'</p>'+
  (addr?'<p class="muted" style="margin:0 0 10px">'+addr+'</p>':'')+
  '<div class="row"><button class="'+(o.status==='done'?'alt':'go')+'" data-order="'+esc(o.id)+'" data-status="'+(o.status==='done'?'new':'done')+'">'+(o.status==='done'?'Reopen':'Mark done')+'</button></div></div>'}).join('');
 document.querySelectorAll('[data-order]').forEach(function(b){b.onclick=function(){b.disabled=true;api('/orders/'+encodeURIComponent(b.dataset.order),{method:'PUT',body:{status:b.dataset.status}})
  .then(function(){var o=orders.find(function(x){return x.id===b.dataset.order});o.status=b.dataset.status;drawOrders();msg(o.number+(o.status==='done'?' marked done.':' reopened.'))}).catch(function(e){b.disabled=false;fail(e)})}})}

// Events
var events=[],editing=null;
function loadEvents(){api('/events').then(function(j){events=j.events;drawEvents()}).catch(fail)}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function drawEvents(){var t=today();
 $('events').innerHTML=events.length?events.map(function(e){var over=e.ends<t,open=e.active&&!over&&t<=e.order_by;
  return '<tr><td><strong>'+esc(e.name)+'</strong><br><span class="muted">'+esc(e.place)+'</span>'+(e.where_to_find?'<br><span class="muted">Find us: '+esc(e.where_to_find)+'</span>':'')+'</td><td>'+day(e.starts)+(e.ends!==e.starts?' – '+day(e.ends):'')+'</td><td>'+day(e.order_by)+'</td><td>'+e.orders+'</td>'+
  '<td><span class="pill '+(open?'on':'')+'">'+(!e.active?'Off':over?'Over':open?'Taking orders':'Orders closed')+'</span></td>'+
  '<td class="row"><button class="alt" data-edit="'+esc(e.id)+'">Edit</button>'+(e.orders?'':'<button class="alt" data-del="'+esc(e.id)+'">Delete</button>')+'</td></tr>'}).join(''):'<tr><td colspan="6" class="muted">No events yet. Add one above.</td></tr>';
 document.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){var e=events.find(function(x){return x.id===b.dataset.edit});editing=e.id;
  $('e-name').value=e.name;$('e-place').value=e.place;$('e-starts').value=e.starts;$('e-ends').value=e.ends;$('e-orderby').value=e.order_by;$('e-where').value=e.where_to_find;$('e-active').checked=!!e.active;
  $('e-save').textContent='Save changes';$('e-cancel').hidden=false;$('e-name').focus()}});
 document.querySelectorAll('[data-del]').forEach(function(b){b.onclick=function(){if(!confirm('Delete this event?'))return;api('/events/'+encodeURIComponent(b.dataset.del),{method:'DELETE'}).then(function(){msg('Event deleted.');loadEvents()}).catch(fail)}})}
function resetEvent(){editing=null;$('event-form').reset();$('e-active').checked=true;$('e-save').textContent='Add event';$('e-cancel').hidden=true}
$('e-cancel').onclick=resetEvent;
$('e-starts').onchange=function(){if(!$('e-ends').value||$('e-ends').value<$('e-starts').value)$('e-ends').value=$('e-starts').value;if(!$('e-orderby').value){var d=new Date($('e-starts').value+'T12:00:00');d.setDate(d.getDate()-3);$('e-orderby').value=d.toISOString().slice(0,10)}};
$('event-form').onsubmit=function(ev){ev.preventDefault();var b={name:$('e-name').value,place:$('e-place').value,starts:$('e-starts').value,ends:$('e-ends').value,orderBy:$('e-orderby').value,whereToFind:$('e-where').value,active:$('e-active').checked};
 $('e-save').disabled=true;api(editing?'/events/'+encodeURIComponent(editing):'/events',{method:editing?'PUT':'POST',body:b}).then(function(){msg(editing?'Event saved.':'Event added.');resetEvent();loadEvents()}).catch(fail).then(function(){$('e-save').disabled=false})};

// Stock
function loadStock(){api('/stock').then(function(j){$('stock').innerHTML=j.stock.map(function(s){return '<tr><td>'+esc(s.label)+'</td><td><input class="num" type="number" min="0" max="9999" step="1" value="'+s.qty+'" data-key="'+esc(s.key)+'" aria-label="'+esc(s.label)+' on hand"></td><td><button class="go" data-save="'+esc(s.key)+'">Save</button></td><td class="muted">'+when(s.updated_at)+'</td></tr>'}).join('');
 document.querySelectorAll('[data-save]').forEach(function(b){b.onclick=function(){var i=document.querySelector('input[data-key="'+CSS.escape(b.dataset.save)+'"]');b.disabled=true;
  api('/stock',{method:'PUT',body:{key:b.dataset.save,qty:Number(i.value)}}).then(function(){msg('Stock saved.');loadStock()}).catch(fail).then(function(){b.disabled=false})}})}).catch(fail)}

// Prices
function loadPrices(){$('prices').innerHTML='<p class="muted">Loading…</p>';api('/products').then(function(j){
 var brands={};j.products.forEach(function(p){(brands[p.brand]=brands[p.brand]||[]).push(p)});
 $('prices').innerHTML=Object.keys(brands).map(function(name){var pol=(j.brands.find(function(b){return b.name===name})||{}).policy||'';
  return '<div class="card"><h2 style="margin:0 0 12px;font-size:20px;text-transform:uppercase">'+esc(name)+'</h2><div class="scroll"><table><thead><tr><th>Product</th><th>Price</th><th>MAP price</th><th></th></tr></thead><tbody>'+
  brands[name].map(function(p){return '<tr><td>'+esc(p.name)+'</td><td><input class="num" type="number" min="0.01" step="0.01" value="'+Number(p.price).toFixed(2)+'" data-price="'+esc(p.cart)+'" aria-label="'+esc(p.name)+' price"></td>'+
   '<td><input class="num" type="number" min="0.01" step="0.01" value="'+(p.map==null?'':Number(p.map).toFixed(2))+'" data-map="'+esc(p.cart)+'" aria-label="'+esc(p.name)+' MAP price"></td><td><button class="go" data-psave="'+esc(p.cart)+'">Save</button></td></tr>'}).join('')+
  '</tbody></table></div><label class="f" style="margin-top:18px">MAP policy</label><textarea data-policy="'+esc(name)+'" maxlength="1000">'+esc(pol)+'</textarea><div class="row" style="margin-top:10px"><button class="alt" data-polsave="'+esc(name)+'">Save policy</button></div></div>'}).join('');
 document.querySelectorAll('[data-psave]').forEach(function(b){b.onclick=function(){var k=b.dataset.psave,pr=document.querySelector('[data-price="'+CSS.escape(k)+'"]').value,mp=document.querySelector('[data-map="'+CSS.escape(k)+'"]').value;
  b.disabled=true;b.textContent='Saving…';api('/products/'+encodeURIComponent(k),{method:'PUT',body:{price:pr,map:mp}}).then(function(r){msg(r.unchanged?'No change.':'Saved. The store updates in about 2 minutes.')}).catch(fail).then(function(){b.disabled=false;b.textContent='Save'})}});
 document.querySelectorAll('[data-polsave]').forEach(function(b){b.onclick=function(){var t=document.querySelector('[data-policy="'+CSS.escape(b.dataset.polsave)+'"]').value;b.disabled=true;
  api('/brands/'+encodeURIComponent(b.dataset.polsave),{method:'PUT',body:{policy:t}}).then(function(r){msg(r.unchanged?'No change.':'Policy saved.')}).catch(fail).then(function(){b.disabled=false})}})
}).catch(function(e){$('prices').innerHTML='';fail(e)})}

var start=(location.hash||'').slice(1);show(loaders[start]?start:'orders');
})();
</script>
</body>
</html>`;
