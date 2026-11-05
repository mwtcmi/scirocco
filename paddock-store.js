// 799 Paddock store: the cart shared by /paddock and every category and product page.
// Product facts come from window.PADDOCK (written by scripts/build-store.mjs from store/catalog.json);
// prices and stock come live from the store Worker, which is also what checkout charges.
(function(){
// Live site uses the live store; preview links (*.pages.dev) and local copies use the test store (Stripe test mode).
var API=/(^|\.)(799motorsport|scirocco799)\.com$/.test(location.hostname)?'https://scirocco799-store.mr-mikewhite.workers.dev':'https://scirocco799-store-test.mr-mikewhite.workers.dev';
var P=window.PADDOCK||{jug:null,names:{},addons:[]};
var J=P.jug,HEX={},IDS={},IMG={};
if(J)J.colors.forEach(function(c){HEX[c.name]=c.hex;IDS[c.name]=[c.sku,c.upc];IMG[c.name]=c.img});
var ADDONS=P.addons,SHORT=P.names;
// Used only until the store service answers, so the page never shows empty cards.
var FALLBACK={catalog:P.fallback||{},shipping:{ship:{cents:2500},pickup:{cents:0},table:{cents:0},event:{cents:0}},stock:{},events:[]};
var data=FALLBACK,online=false,KEY='scirocco799-cart-v2',TRACK='scirocco799-track';
var q=new URLSearchParams(location.search),via=q.get('via');
var sel={color:J&&J.colors.some(function(c){return c.name===q.get('color')})?q.get('color'):(J&&J.defaultColor)},cart=[];
try{cart=JSON.parse(localStorage.getItem(KEY)||'[]')||[]}catch(e){cart=[]}
function save(){try{localStorage.setItem(KEY,JSON.stringify(cart))}catch(e){}}
function $(id){return document.getElementById(id)}
function all(s){return [].slice.call(document.querySelectorAll(s))}
function money(c){return '$'+(c/100).toFixed(2)}
function price(p){var c=data.catalog[p];return c&&c.cents}
function have(k){return online?(data.stock[k]||0):0}
function used(f){return cart.reduce(function(s,l){return s+(f(l)?l.qty:0)},0)}
function leftColor(c){return have('jug/color/'+c)-used(function(l){return l.product==='jug'&&l.color===c})}
function left(p){return have(p)-used(function(l){return l.product===p})}
function sellable(p){return online&&!!data.catalog[p]}
// The chosen way to get the order: 'ship', 'pickup', 'table', or 'event:<id>' (paddock pickup at an event).
function getChoice(){var v=(document.querySelector('input[name=get]:checked')||{}).value||'pickup',m=/^event:(.+)$/.exec(v);return m?{fulfillment:'event',eventId:m[1]}:{fulfillment:v}}
function openEvents(){return (data.events||[]).filter(function(e){return e.open})}
function shortDate(d){var p=d.split('-'),M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return M[+p[1]-1]+' '+(+p[2])}
// Paddock pickup choices in the cart, one per event still taking orders.
function drawEvents(){var box=$('get-events');if(!box)return;var was=getChoice(),evs=openEvents();box.innerHTML='';
 evs.forEach(function(e){var l=document.createElement('label');l.innerHTML='<input type="radio" name="get"> <span><strong></strong><small></small></span>';var i=l.querySelector('input');i.value='event:'+e.id;i.onchange=draw;
  l.querySelector('strong').textContent='Pick up in the paddock, free';l.querySelector('small').textContent=e.name+', '+e.dates+(e.place?' · '+e.place:'')+'. Order by '+shortDate(e.orderBy)+'.';
  if(was.fulfillment==='event'&&was.eventId===e.id)i.checked=true;box.appendChild(l)});
 if(was.fulfillment==='event'&&!document.querySelector('input[name=get]:checked'))document.querySelector('input[name=get][value=pickup]').checked=true;
 // "Order ahead" line above the store, for the next event taking orders.
 var line=$('event-line'),n=$('store-note');if(!line&&n&&evs.length){line=document.createElement('p');line.id='event-line';line.className='store-note event-line';n.parentNode.insertBefore(line,n)}
 if(line){line.hidden=!evs.length;if(evs.length)line.textContent='Order ahead, pick up in the 799 paddock: '+evs[0].name+', '+evs[0].dates+(evs[0].place?' ('+evs[0].place+')':'')+'.'}}
function label(l){return l.product==='jug'?(J?J.short:'Jug'):(SHORT[l.product]||l.product)}
function drawJug(){
 if(!J)return;
 all('[data-colors]').forEach(function(cw){cw.innerHTML='';J.colors.forEach(function(c){var b=document.createElement('button');b.type='button';b.className='sw';b.style.background=c.hex;b.title=c.name;b.setAttribute('aria-label',c.name+(online&&leftColor(c.name)<1?' (sold out)':''));b.setAttribute('aria-pressed',sel.color===c.name);b.disabled=online&&leftColor(c.name)<1;b.onclick=function(){sel.color=c.name;draw()};cw.appendChild(b)})});
 all('[data-color-name]').forEach(function(e){e.textContent=sel.color});
 all('[data-price=jug]').forEach(function(e){if(price('jug'))e.textContent=money(price('jug'))});
 var id=IDS[sel.color];all('[data-jug-ids]').forEach(function(e){e.textContent=id?'SKU '+id[0]+' · UPC '+id[1]:''});
 var k=(IMG[sel.color]||'kawi')+'-spout';all('[data-jug-img]').forEach(function(img){if(img.dataset.k!==k){img.dataset.k=k;img.src='/images/optimized/tuffjug-5gal-'+k+'-900.webp';img.srcset='/images/optimized/tuffjug-5gal-'+k+'-480.webp 480w,/images/optimized/tuffjug-5gal-'+k+'-900.webp 900w';img.alt=J.name+' in '+sel.color+' with Auto-Stop Spout'}});
 all('[data-jug-link]').forEach(function(a){a.href=a.dataset.jugLink+'?color='+encodeURIComponent(sel.color)});
 var ok=online&&leftColor(sel.color)>0;all('.add[data-add=jug]').forEach(function(b){b.disabled=!ok;b.textContent=!online?'Store offline':ok?'Add to cart':'Sold out'});
}
function draw(){
 drawJug();
 ADDONS.forEach(function(p){var av=sellable(p);
  all('.add[data-add='+p+']').forEach(function(b){b.disabled=!av||left(p)<1;b.textContent=!online?'Store offline':!av?'Coming soon':left(p)<1?'Sold out':'Add to cart'});
  all('[data-price='+p+']').forEach(function(e){if(price(p))e.textContent=money(price(p))});
  all('[data-stock='+p+']').forEach(function(e){e.textContent=av?Math.max(left(p),0)+' in stock':''})});
 var n=used(function(){return true}),sub=cart.reduce(function(s,l){return s+l.qty*(price(l.product)||0)},0),get=getChoice().fulfillment,shipC=(data.shipping[get]||{cents:0}).cents;
 $('ship-label').textContent='Ship to me, '+money((data.shipping.ship||{cents:2500}).cents)+' flat';
 $('cart-count').textContent=n;$('cart-total').textContent=money(sub);$('cart-sub').textContent=money(sub+(n?shipC:0));$('sum-label').textContent=get==='ship'&&n?'Total with shipping':'Total';
 var ul=$('cart-lines');ul.innerHTML='';if(!cart.length)ul.innerHTML='<li class="empty-cart">Your cart is empty.</li>';
 cart.forEach(function(l,i){var li=document.createElement('li');li.innerHTML='<strong></strong><span class="q"><button type="button" aria-label="Remove one">&minus;</button><span>'+l.qty+'</span><button type="button" aria-label="Add one">+</button></span><small></small>';li.querySelector('strong').textContent=label(l);li.querySelector('small').textContent=(l.product==='jug'?l.color+', Auto-Stop Spout · ':'')+money((price(l.product)||0)*l.qty);var bs=li.querySelectorAll('button');bs[0].onclick=function(){l.qty--;if(!l.qty)cart.splice(i,1);save();draw()};bs[1].disabled=l.product==='jug'?leftColor(l.color)<1:left(l.product)<1;bs[1].onclick=function(){l.qty++;save();draw()};ul.appendChild(li)});
 var ub=$('upsell-btns');ub.innerHTML='';var offers=ADDONS.filter(function(p){return sellable(p)&&left(p)>0&&!used(function(l){return l.product===p})});
 offers.forEach(function(p){var b=document.createElement('button');b.type='button';b.setAttribute('data-add',p);b.textContent='+ '+SHORT[p]+' '+money(price(p));ub.appendChild(b)});
 $('upsell').hidden=!(used(function(l){return l.product==='jug'})&&offers.length);
 $('checkout').disabled=!cart.length||!online;
 align();
}
// Lines up titles, part numbers, descriptions and fact lists across each row of cards.
function align(){var parts=['h3','.idline','.desc','.facts'],items=all('.store-grid .item');
 items.forEach(function(it){parts.forEach(function(s){var e=it.querySelector(s);if(e)e.style.minHeight=''})});
 var rows={};items.forEach(function(it){var k=Math.round(it.getBoundingClientRect().top+scrollY);(rows[k]=rows[k]||[]).push(it)});
 Object.keys(rows).forEach(function(k){var row=rows[k];if(row.length<2)return;parts.forEach(function(s){var els=row.map(function(it){return it.querySelector(s)}).filter(Boolean),h=Math.max.apply(null,els.map(function(e){return e.getBoundingClientRect().height}));els.forEach(function(e){e.style.minHeight=h+'px'})})})}
window.addEventListener('resize',align);
function add(p){var l=cart.filter(function(x){return x.product===p&&(p!=='jug'||x.color===sel.color)})[0];if(l)l.qty++;else cart.push(p==='jug'?{product:p,color:sel.color,qty:1}:{product:p,qty:1});save();draw();open()}
function open(){$('cart').hidden=false;$('cart-shade').hidden=false;$('cart-close').focus()}
function close(){$('cart').hidden=true;$('cart-shade').hidden=true;$('cart-btn').focus()}
function note(t){var n=$('store-note');if(!n)return;n.textContent=t;n.hidden=!t}
document.addEventListener('click',function(e){var a=e.target.closest('[data-add]');if(a&&!a.disabled)add(a.getAttribute('data-add'))});
all('input[name=get]').forEach(function(r){r.onchange=draw});
$('cart-btn').onclick=open;$('cart-close').onclick=close;$('cart-shade').onclick=close;document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('cart').hidden)close()});
$('checkout').onclick=function(){var b=this;b.disabled=true;b.textContent='Opening secure checkout…';$('cart-error').hidden=true;
 fetch(API+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign(getChoice(),{items:cart,returnPath:location.pathname}))})
 .then(function(r){return r.json().then(function(j){return{r:r,j:j}})}).then(function(x){if(x.j.url){location.href=x.j.url;return}if(x.j.stock)data.stock=x.j.stock;throw new Error(x.j.error||'Checkout is unavailable.')})
 .catch(function(e){$('cart-error').textContent=e.message||'Checkout is unavailable. Please try again.';$('cart-error').hidden=false;b.textContent='Checkout';draw()})};
// Track mode (QR code at the 799 table): offer "take it now" and preselect it, on every store page this visit.
var track=q.get('at')==='track'||via==='table';try{if(track)sessionStorage.setItem(TRACK,'1');else track=sessionStorage.getItem(TRACK)==='1'}catch(e){}
if(track){$('get-table').style.display='';document.querySelector('input[name=get][value=table]').checked=true}
if(q.get('order')==='success'){cart=[];save();var ref=q.get('ref')||'',num=/^cs_[A-Za-z0-9_]{8,}$/.test(ref)?' Order 799-'+ref.slice(-8).toUpperCase()+'.':'';
 note(via==='table'?'Paid! Show this screen at the 799 table to collect your gear.'+num:via==='event'?"Thanks! Your order is in. Stripe has emailed your receipt. Your gear will be waiting in the 799 paddock at the event, and we'll email you where to find us."+num:(via==='pickup'?"Thanks! Your order is in. Stripe has emailed your receipt, and we'll email you to set a pickup time.":"Thanks! Your order is in. Stripe has emailed your receipt, and we'll email tracking when it ships.")+num);
 setTimeout(function(){var n=$('store-note');if(n)n.scrollIntoView({block:'center'})},50)}
else if(q.get('order')==='cancelled')note('Checkout was cancelled. Your cart is saved.');
draw();
fetch(API+'/api/catalog').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){if(!j.catalog||!j.catalog.jug||typeof j.catalog.jug.cents!=='number')throw 0;data=j;online=true;
 cart=cart.filter(function(l){return l.product==='jug'?data.catalog.jug.colors.indexOf(l.color)>-1:!!data.catalog[l.product]});save();drawEvents();draw()})
 .catch(function(){note('The store is offline right now. Please check back soon.');draw()});
// Product page photo thumbnails.
all('[data-thumb]').forEach(function(t){t.onclick=function(){var m=$('main-photo');if(!m)return;m.src=t.dataset.thumb;m.removeAttribute('srcset');m.alt=t.dataset.alt||m.alt;all('[data-thumb]').forEach(function(x){x.setAttribute('aria-pressed',x===t)})}});
})();
