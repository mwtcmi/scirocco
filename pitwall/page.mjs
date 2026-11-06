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
.sub{margin-top:56px;padding-top:40px;border-top:1px solid #292929}.h2{margin:0 0 6px;font-size:30px;line-height:.95;letter-spacing:-.02em;text-transform:uppercase}
.savebar{position:sticky;top:0;z-index:5;background:var(--black);padding:12px 0;margin-bottom:6px}
.stock th.n,.stock td.n{text-align:right}.stock td.n{width:120px}.stock input.num{width:112px;text-align:right;font-weight:400;letter-spacing:0}input.num{-moz-appearance:textfield;appearance:textfield}input.num::-webkit-inner-spin-button,input.num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.pf{display:flex;flex-direction:column;gap:6px}.pf label.f{margin:0}.money{position:relative;display:block}.money:before{content:'$';position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#888;font-size:15px;pointer-events:none}.stock .money input.num{padding-left:26px}.prices{gap:14px;align-items:flex-end}.stock input.changed{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
.stock .sku{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:#bbb}.flag{display:inline-block;min-width:44px;padding:3px 8px;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;text-align:center}
.flag.out{border:1px solid var(--red);color:var(--red)}.flag.low{border:1px solid #f2d600;color:#f2d600}.flag.ok{border:1px solid #444;color:#777}.wait{color:var(--green);font-weight:700}
.stock table{table-layout:fixed;min-width:640px}.stock col.c1{width:26%}.stock col.c2{width:20%}.stock col.c3{width:16%}.stock col.c4{width:10%}.stock col.c5{width:10%}.stock col.c6{width:18%}.stock th.n,.stock td.n{padding-right:24px}
.stock h3{margin:0 0 10px;font-size:16px;text-transform:uppercase;letter-spacing:.02em}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}.tile{border:1px solid var(--line);background:var(--panel);padding:18px}
.tile .big{display:block;margin:8px 0 4px;font-size:34px;font-weight:900;letter-spacing:-.02em}.tile .sub2{color:#999;font-size:13px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.two .card{margin:0 0 12px;min-height:170px}
.stat{display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--line);font-size:14px}.stat:first-of-type{border-top:0}.stat b{font-size:16px}
.clist tbody tr{cursor:pointer}.clist tbody tr:hover td{background:#161616}.clist td.n,.clist th.n{text-align:right;padding-right:18px}
a.btnlink{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border:1px solid #555;color:#fff;font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;text-decoration:none}
.detail h2{margin:0 0 4px;font-size:24px}.dl{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0}.dl div{font-size:14px;line-height:1.5}.dl b{display:block;color:#999;font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px}
button.danger{min-height:44px;padding:0 18px;border:1px solid var(--red);background:none;color:var(--red);font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;cursor:pointer}
@media(max-width:800px){.tiles{grid-template-columns:1fr 1fr}.two,.dl{grid-template-columns:1fr}}
.linkish{background:none;border:0;padding:0;margin-bottom:10px;color:var(--green);font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.policy{color:#aaa;font-size:13px;line-height:1.5;white-space:pre-wrap}
@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.grid .wide{grid-column:1/-1}h1{font-size:32px}}
</style>
</head>
<body>
<header><div class="wrap top"><div class="brand">799 <span>Pitwall</span><span class="badge" id="store">{{STORE}}</span></div><div class="who" id="who"></div></div></header>
<main class="wrap">
<nav role="tablist">
<button role="tab" data-tab="dash" aria-selected="true">Dashboard</button>
<button role="tab" data-tab="orders" aria-selected="false">Orders</button>
<button role="tab" data-tab="products" aria-selected="false">Products</button>
<button role="tab" data-tab="customers" aria-selected="false">Customers</button>
</nav>
<p class="msg" id="msg" role="status"></p>

<section data-panel="dash">
<div class="kicker">Paddock Store</div><h1>Dashboard</h1>
<p class="help" id="dash-when"></p>
<div class="tiles" id="dash-sales"></div>
<div class="two">
<div class="card"><div class="kicker">Next event</div><div id="dash-event"></div></div>
<div class="card"><div class="row"><div class="kicker">Customers</div><button class="linkish right" type="button" data-go="customers">Open customers →</button></div><div id="dash-cust"></div></div>
</div>
<div class="two">
<div class="card"><div class="row"><div class="kicker">Stock to watch</div><button class="linkish right" type="button" data-go="products">Open products →</button></div><div id="dash-stock"></div></div>
<div class="card"><div class="kicker">Top sellers · last 30 days</div><div id="dash-top"></div></div>
</div>
</section>

<section data-panel="customers" hidden>
<div class="kicker">Paddock Store</div><h1>Customers</h1>
<p class="help">Everyone who has ordered, asked to be notified, signed up for 799 News or been added here, one record per email. "799 News" shows who gets news emails; it stays in step with Resend, including unsubscribes.</p>
<div class="row" style="margin-bottom:16px"><input id="cust-q" type="search" placeholder="Search name, email or phone" aria-label="Search customers" style="max-width:420px"><button class="go" type="button" id="cust-new">+ Add customer</button><a class="alt btnlink" href="/api/customers.csv" download>Export CSV</a></div>
<form class="card" id="cust-form" hidden>
<div class="grid">
<div class="wide"><label class="f" for="n-email">Email</label><input id="n-email" type="email" required maxlength="254"></div>
<div class="wide"><label class="f" for="n-name">Name</label><input id="n-name" maxlength="120"></div>
<div class="wide"><label class="f" for="n-phone">Phone</label><input id="n-phone" type="tel" maxlength="40"></div>
<div class="wide"><label class="f" for="n-news">799 News</label><label class="row" style="min-height:44px"><input type="checkbox" id="n-news"> They asked to get 799 News</label></div>
<div class="full"><label class="f" for="n-notes">Notes</label><input id="n-notes" maxlength="2000" placeholder="Met at Empire, interested in the pump"></div>
</div>
<div class="row" style="margin-top:14px"><button class="go" type="submit">Add customer</button><button class="alt" type="button" id="cust-cancel">Cancel</button></div>
</form>
<div id="cust-detail"></div>
<div class="scroll"><table class="clist"><colgroup><col style="width:22%"><col style="width:26%"><col style="width:14%"><col style="width:8%"><col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>
<thead><tr><th>Name</th><th>Email</th><th>Phone</th><th class="n">Orders</th><th class="n">Spent</th><th>799 News</th><th>Last order</th></tr></thead><tbody id="customers"></tbody></table></div>
</section>

<section data-panel="orders" hidden>
<div class="kicker">Paddock Store</div><h1>Orders</h1>
<p class="help">Newest first. Mark an order done once it's handed over or shipped. Full payment details are in Stripe.</p>
<div class="row" style="margin-bottom:14px"><label class="row muted"><input type="checkbox" id="show-done"> Show done orders</label></div>
<div id="orders"></div>
</section>

<section data-panel="orders" class="sub">
<div class="kicker">Order emails</div><h2 class="h2">Copies</h2>
<p class="help">Everyone listed gets a blind copy of every order confirmation (customers never see these addresses). Leave the list empty for no copies.</p>
<div class="card"><div id="copies"></div>
<div class="row" style="margin-top:12px"><button class="alt" type="button" id="copy-add">+ Add address</button><button class="go" type="button" id="copy-save">Save</button><span class="muted" id="copy-note"></span></div></div>
</section>

<section data-panel="orders" class="sub">
<div class="kicker">Paddock pickup</div><h2 class="h2">Events</h2>
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

<section data-panel="products" hidden>
<div class="kicker">Paddock Store</div><h1>Products</h1>
<p class="help">Price, MAP and stock for everything in the store. Stock saves right away; anyone waiting for an item gets one "It's back" email when you bring it above 0. Price changes update the store pages, Google's product info and checkout together about 2 minutes later, and are recorded in GitHub with your email.</p>
<div class="row savebar"><button class="go" id="p-save" disabled>Save changes</button><button class="alt" id="p-reset" disabled>Undo</button><span class="muted" id="p-note"></span></div>
<div id="products"></div>
</section>
</main>
<script>
(function(){
var $=function(id){return document.getElementById(id)},esc=function(v){var d=document.createElement('div');d.textContent=v==null?'':String(v);return d.innerHTML};
var money=function(c){return '$'+(Number(c||0)/100).toFixed(2)},dollars=function(n){return '$'+Number(n||0).toFixed(2)};
var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function day(d){if(!d)return '';var p=d.split('-');return M[+p[1]-1]+' '+(+p[2])+', '+p[0]}
function when(ms){if(!ms)return '—';var d=new Date(ms);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
function msg(t,bad){var m=$('msg');m.textContent=t||'';m.className='msg '+(bad?'bad':'ok')}
function api(path,opt){opt=opt||{};return fetch('/api'+path,{method:opt.method||'GET',headers:opt.body?{'Content-Type':'application/json'}:{},body:opt.body?JSON.stringify(opt.body):undefined,credentials:'same-origin'})
 .then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})})}
function fail(e){msg(e.message||'Something went wrong.',true)}
// Tabs
var loaders={dash:loadDash,orders:function(){loadOrders();loadCopies();loadEvents()},products:loadProducts,customers:loadCustomers};
document.querySelectorAll('nav button').forEach(function(b){b.onclick=function(){show(b.dataset.tab)}});
document.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){show(b.dataset.go);scrollTo(0,0)}});
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

// Dashboard
var HOW={ship:'Ship',pickup:'Traverse City pickup',event:'Paddock pickup',table:'Table sale'};
var HOWN={ship:['to ship','to ship'],pickup:['Traverse City pickup','Traverse City pickups'],event:['paddock pickup','paddock pickups'],table:['table sale','table sales']};
function howCount(k,n){var w=HOWN[k];return n+' '+(w?w[n===1?0:1]:k)}
function loadDash(){$('dash-when').textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+'. Sales include tax and shipping.';
 api('/dashboard').then(function(d){var tile=function(k,big,sub){return '<div class="tile"><div class="kicker">'+k+'</div><span class="big">'+big+'</span><span class="sub2">'+sub+'</span></div>'};
  var o=function(n){return n+(n===1?' order':' orders')};
  $('dash-sales').innerHTML=tile('Today',money(d.sales.today.cents),o(d.sales.today.orders))+tile('This week',money(d.sales.week.cents),o(d.sales.week.orders))+tile('This month',money(d.sales.month.cents),o(d.sales.month.orders))+
   tile('To hand over or ship',String(d.open.total),Object.keys(d.open.by).map(function(k){return howCount(k,d.open.by[k])}).join(' · ')||'All caught up');
  var e=d.nextEvent;$('dash-event').innerHTML=e?'<h2 style="margin:6px 0 4px;font-size:22px">'+esc(e.name)+'</h2><p class="muted" style="margin:0 0 12px">'+day(e.starts)+(e.ends!==e.starts?' – '+day(e.ends):'')+(e.place?' · '+esc(e.place):'')+'</p>'+
   '<div class="stat"><span>Paddock pickup orders</span><b>'+e.orders+'</b></div><div class="stat"><span>Order-ahead cutoff</span><b>'+(e.open?(e.daysToCutoff===0?'Today':e.daysToCutoff+(e.daysToCutoff===1?' day':' days')):'Closed')+'</b></div>':'<p class="muted">No upcoming events. Add one under Orders → Events.</p>';
  var c=d.customers;$('dash-cust').innerHTML='<div class="stat"><span>Customers</span><b>'+c.total+'</b></div><div class="stat"><span>New this month</span><b>'+c.month+'</b></div><div class="stat"><span>Have ordered</span><b>'+c.buyers+'</b></div><div class="stat"><span>On 799 News</span><b>'+c.optIn+'</b></div><div class="stat"><span>Site sign-ups this month</span><b>'+c.signups+'</b></div>';
  $('dash-stock').innerHTML=d.stock.length?d.stock.map(function(i){return '<div class="stat"><span>'+esc(i.label)+(i.waiting?' <span class="wait">· '+i.waiting+' waiting</span>':'')+'</span>'+flag(i.qty).replace('>Out<','>Out<').replace('<span class="flag','<span style="margin-left:10px" class="flag')+'</div>'}).join(''):'<p class="muted">Everything is stocked.</p>';
  $('dash-top').innerHTML=d.top.length?d.top.map(function(t){return '<div class="stat"><span>'+esc(t.name)+'</span><b>'+t.units+'</b></div>'}).join(''):'<p class="muted">No sales in the last 30 days yet.</p>'}).catch(fail)}

// Customers
var custTimer=null,custOpen=null;
$('cust-q').oninput=function(){clearTimeout(custTimer);custTimer=setTimeout(loadCustomers,250)};
$('cust-new').onclick=function(){$('cust-form').hidden=false;$('n-email').focus()};
$('cust-cancel').onclick=function(){$('cust-form').reset();$('cust-form').hidden=true};
$('cust-form').onsubmit=function(e){e.preventDefault();var news=$('n-news').checked;api('/customers',{method:'POST',body:{email:$('n-email').value,name:$('n-name').value,phone:$('n-phone').value,notes:$('n-notes').value,news:news}})
 .then(function(r){msg('Customer added.'+(news?(r.synced?' Added to 799 News in Resend.':' They will be added to 799 News in Resend within the hour.'):''));$('cust-form').reset();$('cust-form').hidden=true;loadCustomers();openCustomer(r.id)})
 .catch(fail)};
var MK={opt_in:'<span class="pill on">Yes</span>',opt_out:'<span class="pill">No</span>',unknown:'<span class="muted">Not asked</span>'};
function loadCustomers(){api('/customers?q='+encodeURIComponent($('cust-q').value.trim())).then(function(j){
 $('customers').innerHTML=j.customers.length?j.customers.map(function(c){return '<tr data-cust="'+c.id+'"><td>'+(esc(c.name)||'<span class="muted">—</span>')+'</td><td>'+esc(c.email)+'</td><td>'+(esc(c.phone)||'<span class="muted">—</span>')+'</td><td class="n">'+c.orders_count+'</td><td class="n">'+money(c.total_spent)+'</td><td>'+MK[c.marketing]+'</td><td class="muted">'+(c.last_order_at?when(c.last_order_at):(c.source==='notify'?'Asked to be notified':'—'))+'</td></tr>'}).join(''):'<tr><td colspan="7" class="muted">No customers yet.</td></tr>';
 document.querySelectorAll('[data-cust]').forEach(function(r){r.onclick=function(){openCustomer(Number(r.dataset.cust))}})}).catch(fail)}
function addr(a){if(!a||!a.address)return '<span class="muted">—</span>';var x=a.address;return [a.name,x.line1,x.line2,[x.city,x.state].filter(Boolean).join(', ')+' '+(x.postal_code||'')].filter(function(v){return v&&String(v).trim()}).map(esc).join('<br>')}
function openCustomer(id){custOpen=id;api('/customers/'+id).then(function(j){var c=j.customer;
 $('cust-detail').innerHTML='<div class="card detail"><div class="row"><h2>'+(esc(c.name)||esc(c.email))+'</h2><button class="alt right" type="button" id="cust-close">Close</button></div>'+
  '<p class="muted" style="margin:0">Customer since '+when(c.created_at)+' · first came via '+esc({online:'an online order',event:'paddock pickup',table:'the 799 table',notify:'a back-in-stock request'}[c.source]||c.source)+'</p>'+
  '<div class="dl"><div><b>Contact</b><a style="color:#20C933" href="mailto:'+esc(c.email)+'">'+esc(c.email)+'</a>'+(c.phone?'<br><a style="color:#20C933" href="tel:'+esc(c.phone)+'">'+esc(c.phone)+'</a>':'')+'</div><div><b>Shipping</b>'+addr(c.shipping)+'</div><div><b>Billing</b>'+addr(c.billing)+'</div></div>'+
  '<div class="dl"><div><b>Orders</b>'+c.orders_count+' · '+money(c.total_spent)+'</div><div><b>Waiting for</b>'+(j.waiting.length?j.waiting.map(esc).join('<br>'):'<span class="muted">—</span>')+'</div>'+
  '<div><b>799 News</b><select id="cust-mk" style="max-width:220px"><option value="opt_in">Yes, gets 799 News</option><option value="opt_out">No, opted out</option><option value="unknown">Not asked</option></select>'+(c.marketing_source?'<br><span class="muted">'+esc(c.marketing_source)+' · '+when(c.marketing_at)+'</span>':'')+'</div></div>'+
  '<label class="f" for="cust-notes">Notes</label><textarea id="cust-notes" maxlength="2000"></textarea>'+
  '<div class="row" style="margin-top:10px"><button class="go" type="button" id="cust-save">Save</button><button class="danger right" type="button" id="cust-del">Delete customer data</button></div>'+
  (j.orders.length?'<div class="scroll" style="margin-top:18px"><table><thead><tr><th>Order</th><th>Date</th><th>Items</th><th>How</th><th class="n">Total</th><th>Status</th></tr></thead><tbody>'+j.orders.map(function(o){return '<tr><td>'+o.number+'</td><td class="muted">'+when(o.created)+'</td><td>'+o.lines.map(esc).join('<br>')+'</td><td>'+(o.how==='event'?'Paddock: '+esc(o.event||''):esc(HOW[o.how]||o.how))+'</td><td class="n">'+money(o.total)+'</td><td>'+(o.status==='done'?'Done':'Open')+'</td></tr>'}).join('')+'</tbody></table></div>':'')+'</div>';
 $('cust-mk').value=c.marketing;$('cust-notes').value=c.notes||'';
 $('cust-close').onclick=function(){$('cust-detail').innerHTML='';custOpen=null};
 $('cust-save').onclick=function(){api('/customers/'+id,{method:'PUT',body:{notes:$('cust-notes').value,marketing:$('cust-mk').value}}).then(function(){msg('Customer saved.');openCustomer(id);loadCustomers()}).catch(fail)};
 $('cust-del').onclick=function(){if(!confirm('Delete this customer\u2019s personal details? Orders stay for your records, without name, email, phone or address. This cannot be undone.'))return;
  api('/customers/'+id,{method:'DELETE'}).then(function(){msg('Customer data deleted.');$('cust-detail').innerHTML='';loadCustomers()}).catch(fail)};
 $('cust-detail').scrollIntoView({block:'start'})}).catch(fail)}

// Order email copies
function copyRow(v){var d=document.createElement('div');d.className='row';d.style.marginBottom='8px';d.innerHTML='<input type="email" maxlength="254" placeholder="name@example.com" aria-label="Copy to" style="flex:1;max-width:460px"><button class="alt" type="button" aria-label="Remove">Remove</button>';
 d.querySelector('input').value=v||'';d.querySelector('button').onclick=function(){d.remove()};return d}
function loadCopies(){api('/settings').then(function(j){var box=$('copies');box.innerHTML='';j.orderCopies.forEach(function(e){box.appendChild(copyRow(e))});
 if(!j.orderCopies.length)box.innerHTML='<p class="muted" id="copy-none">No copies are sent.</p>';$('copy-note').textContent=j.by?'Last changed '+when(j.updated)+' by '+j.by:''}).catch(fail)}
$('copy-add').onclick=function(){var n=$('copy-none');if(n)n.remove();var r=copyRow('');$('copies').appendChild(r);r.querySelector('input').focus()};
$('copy-save').onclick=function(){var list=[].slice.call(document.querySelectorAll('#copies input')).map(function(i){return i.value.trim()}).filter(Boolean),b=this;b.disabled=true;
 api('/settings',{method:'PUT',body:{orderCopies:list}}).then(function(j){msg(j.orderCopies.length?'Order copies go to '+j.orderCopies.join(', ')+'.':'Order copies are off.');loadCopies()}).catch(fail).then(function(){b.disabled=false})};

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

// Products: one card per product with price, MAP and a row per SKU for stock. One save for everything.
var P0={stock:{},price:{},map:{}},pPolicy={};
function flag(q){return q<1?'<span class="flag out">Out</span>':q<2?'<span class="flag low">Low</span>':'<span class="flag ok">OK</span>'}
function cents2(v){return v==null||v===''?'':Number(v).toFixed(2)}
function loadProducts(){$('products').innerHTML='<p class="muted">Loading…</p>';$('p-note').textContent='';
 Promise.all([api('/stock'),api('/products').catch(function(e){return {error:e.message}})]).then(function(r){var st=r[0],pr=r[1],byCart={},brands={};
  (pr.products||[]).forEach(function(p){byCart[p.cart]=p});(pr.brands||[]).forEach(function(b){brands[b.name]=b.policy});pPolicy=brands;
  if(pr.error)$('p-note').textContent='Prices are read-only right now: '+pr.error;
  if(!st.email&&st.groups.some(function(g){return g.items.some(function(i){return i.waiting})}))$('p-note').textContent+=(pr.error?' ':'')+'Back-in-stock email is not connected yet, so requests will wait.';
  P0={stock:{},price:{},map:{}};var order=[],groups={};
  st.groups.forEach(function(g){var p=byCart[g.product]||{},brand=p.brand||'Products';if(!groups[brand]){groups[brand]=[];order.push(brand)}groups[brand].push({g:g,p:p})});
  $('products').innerHTML=order.map(function(brand){return '<h2 class="h2" style="margin:26px 0 12px">'+esc(brand)+'</h2>'+groups[brand].map(function(x){var g=x.g,p=x.p,live=g.status==='live';
   P0.price[g.product]=cents2(p.price);P0.map[g.product]=cents2(p.map);
   return '<div class="card stock"><div class="row" style="align-items:flex-end;margin-bottom:12px"><h3 style="margin:0">'+esc(g.name)+(live?'':' <span class="pill">'+(g.status==='retired'?'Retired':'Coming soon')+'</span>')+'</h3>'+
    '<div class="row right prices"><div class="pf"><label class="f" for="pr-'+esc(g.product)+'">Price</label><span class="money"><input class="num" id="pr-'+esc(g.product)+'" type="number" min="0.01" step="0.01" inputmode="decimal" data-price="'+esc(g.product)+'" value="'+cents2(p.price)+'"'+(pr.error?' disabled':'')+'></span></div>'+
    '<div class="pf"><label class="f" for="map-'+esc(g.product)+'">MAP price</label><span class="money"><input class="num" id="map-'+esc(g.product)+'" type="number" min="0.01" step="0.01" inputmode="decimal" data-map="'+esc(g.product)+'" value="'+cents2(p.map)+'"'+(pr.error?' disabled':'')+'></span></div></div></div>'+
    '<div class="scroll"><table><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"></colgroup><thead><tr><th>'+(g.items.length>1?'Color':'Option')+'</th><th>SKU</th><th class="n">On hand</th><th></th><th class="n">Waiting</th><th>Last changed</th></tr></thead><tbody>'+
    g.items.map(function(i){P0.stock[i.sku]=i.qty;return '<tr><td>'+esc(i.variant||'—')+'</td><td class="sku">'+esc(i.sku)+'</td><td class="n"><input class="num" type="number" min="0" max="9999" step="1" inputmode="numeric" value="'+i.qty+'" data-sku="'+esc(i.sku)+'" aria-label="'+esc(i.label)+' on hand"></td><td data-flag="'+esc(i.sku)+'">'+flag(i.qty)+'</td>'+
     '<td class="n">'+(i.waiting?'<span class="wait">'+i.waiting+'</span>':'<span class="muted">0</span>')+'</td><td class="muted">'+when(i.updated_at)+'</td></tr>'}).join('')+'</tbody></table></div></div>'}).join('')+
   (brand!=='Products'&&!pr.error?'<div class="card"><label class="f" for="pol-'+esc(brand)+'">'+esc(brand)+' MAP policy</label><textarea data-policy="'+esc(brand)+'" id="pol-'+esc(brand)+'" maxlength="1000">'+esc(brands[brand]||'')+'</textarea></div>':'')}).join('');
  document.querySelectorAll('#products input,#products textarea').forEach(function(i){i.oninput=pDirty});pDirty()}).catch(fail)}
function pChanges(){var c={stock:[],prices:{},policy:[]};
 document.querySelectorAll('#products input[data-sku]').forEach(function(i){var v=i.value===''?NaN:Number(i.value);if(v!==P0.stock[i.dataset.sku])c.stock.push({sku:i.dataset.sku,qty:v,el:i})});
 document.querySelectorAll('#products input[data-price],#products input[data-map]').forEach(function(i){var k=i.dataset.price?'price':'map',id=i.dataset.price||i.dataset.map,v=i.value.trim()===''?'':cents2(i.value);
  if(v!==P0[k][id]){(c.prices[id]=c.prices[id]||{})[k]=v;c.prices[id].els=(c.prices[id].els||[]).concat(i)}});
 document.querySelectorAll('#products textarea[data-policy]').forEach(function(t){if(t.value!==(pPolicy[t.dataset.policy]||''))c.policy.push({brand:t.dataset.policy,policy:t.value,el:t})});return c}
function pCount(c){return c.stock.length+Object.keys(c.prices).length+c.policy.length}
function pDirty(){var c=pChanges(),n=pCount(c);document.querySelectorAll('#products .changed').forEach(function(e){e.classList.remove('changed')});
 c.stock.forEach(function(x){x.el.classList.add('changed');var f=document.querySelector('[data-flag="'+CSS.escape(x.sku)+'"]');if(f&&Number.isInteger(x.qty))f.innerHTML=flag(x.qty)});
 Object.keys(c.prices).forEach(function(k){c.prices[k].els.forEach(function(e){e.classList.add('changed')})});c.policy.forEach(function(x){x.el.classList.add('changed')});
 $('p-save').disabled=!n;$('p-reset').disabled=!n;$('p-save').textContent=n?'Save '+n+(n===1?' change':' changes'):'Save changes'}
$('p-reset').onclick=loadProducts;
$('p-save').onclick=function(){var c=pChanges(),b=this,bad=c.stock.filter(function(x){return !Number.isInteger(x.qty)||x.qty<0||x.qty>9999});
 if(bad.length){msg('Stock counts must be whole numbers from 0 to 9999.',true);bad[0].el.focus();return}
 b.disabled=true;b.textContent='Saving…';var notes=[],errors=[];
 var steps=Promise.resolve();
 if(c.stock.length)steps=steps.then(function(){return api('/stock',{method:'PUT',body:{changes:c.stock.map(function(x){return{sku:x.sku,qty:x.qty}})}}).then(function(r){notes.push('Stock saved.'+(r.notified?' Sent '+r.notified+' back-in-stock email'+(r.notified===1?'':'s')+'.':'')+(r.held?' '+r.held+' waiting (email not connected yet).':''))}).catch(function(e){errors.push(e.message)})});
 Object.keys(c.prices).forEach(function(id){steps=steps.then(function(){var x=c.prices[id],body={};if(x.price!==undefined)body.price=x.price;if(x.map!==undefined)body.map=x.map;
  return api('/products/'+encodeURIComponent(id),{method:'PUT',body:body}).then(function(r){if(!r.unchanged)notes.push('Price saved; the store updates in about 2 minutes.')}).catch(function(e){errors.push(e.message)})})});
 c.policy.forEach(function(x){steps=steps.then(function(){return api('/brands/'+encodeURIComponent(x.brand),{method:'PUT',body:{policy:x.policy}}).then(function(){notes.push(x.brand+' MAP policy saved.')}).catch(function(e){errors.push(e.message)})})});
 steps.then(function(){msg(errors.length?errors.join(' '):[...new Set(notes)].join(' '),!!errors.length);loadProducts()})};

var start=(location.hash||'').slice(1);show(loaders[start]?start:'dash');
})();
</script>
</body>
</html>`;
