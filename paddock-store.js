// 799 Paddock store: the cart shared by /paddock and every category and product page.
// Product facts come from window.PADDOCK (written by scripts/build-store.mjs from store/catalog.json).
// Every sellable thing is a variant with its own SKU; cart lines are {sku, qty}.
// Prices and stock come live from the store Worker, which is also what checkout charges.
(function(){
// Live site uses the live store; preview links (*.pages.dev) and local copies use the test store (Stripe test mode).
var API=/(^|\.)(799motorsport|scirocco799)\.com$/.test(location.hostname)?'https://scirocco799-store.mr-mikewhite.workers.dev':'https://scirocco799-store-test.mr-mikewhite.workers.dev';
var P=window.PADDOCK||{products:{},fallback:{}},PRODUCTS=P.products||{},IDS=Object.keys(PRODUCTS),BYSKU={};
IDS.forEach(function(id){PRODUCTS[id].variants.forEach(function(v){BYSKU[v.sku]={id:id,v:v}})});
var data={catalog:P.fallback||{},shipping:{ship:{cents:2500},pickup:{cents:0},table:{cents:0},event:{cents:0}},stock:{},events:[]},online=false;
var KEY='scirocco799-cart-v3',OLD='scirocco799-cart-v2',TRACK='scirocco799-track';
var q=new URLSearchParams(location.search),via=q.get('via'),want=q.get('color');
// The option picked for each product (?color= picks it on arrival).
var sel={};IDS.forEach(function(id){var p=PRODUCTS[id];sel[id]=want&&p.variants.some(function(v){return v.name===want})?want:(p.default||p.variants[0].name)});
var cart=null;try{cart=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
if(!Array.isArray(cart)){cart=[];try{(JSON.parse(localStorage.getItem(OLD)||'[]')||[]).forEach(function(l){var p=PRODUCTS[l.product];if(!p||!(l.qty>0))return;
 var v=p.variants.length>1?p.variants.filter(function(x){return x.name===l.color})[0]:p.variants[0];if(v)cart.push({sku:v.sku,qty:l.qty})});localStorage.removeItem(OLD)}catch(e){}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(cart))}catch(e){}}
function $(id){return document.getElementById(id)}
function all(s){return [].slice.call(document.querySelectorAll(s))}
function attr(name,id){return '['+name+'="'+id+'"]'}
function money(c){return '$'+(c/100).toFixed(2)}
function price(id){var c=data.catalog[id];return c&&c.cents}
function variant(id){var p=PRODUCTS[id];return p.variants.filter(function(v){return v.name===sel[id]})[0]||p.variants[0]}
function multi(id){return PRODUCTS[id].variants.length>1}
function have(sku){return online?(data.stock[sku]||0):0}
function inCart(sku){return cart.reduce(function(s,l){return s+(l.sku===sku?l.qty:0)},0)}
function left(sku){return have(sku)-inCart(sku)}
function sellable(id){return online&&!!data.catalog[id]}
function count(){return cart.reduce(function(s,l){return s+l.qty},0)}
function lineLabel(l){var h=BYSKU[l.sku];return h?PRODUCTS[h.id].short+(multi(h.id)?', '+h.v.name:''):l.sku}
// Stock wording: never "0 in stock" (when it's out, the button says so and the notify box shows).
function stockText(onHand,rest){return onHand<1?'':rest<1?'All in your cart':rest===1?'Only 1 left':rest+' in stock'}
// The chosen way to get the order: 'ship', 'pickup', 'table', or 'event:<id>' (paddock pickup at an event).
function getChoice(){var v=(document.querySelector('input[name=get]:checked')||{}).value||'pickup',m=/^event:(.+)$/.exec(v);return m?{fulfillment:'event',eventId:m[1]}:{fulfillment:v}}
function openEvents(){return (data.events||[]).filter(function(e){return e.open})}
function shortDate(d){var p=d.split('-'),M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return M[+p[1]-1]+' '+(+p[2])}
// Paddock pickup choices in the cart, one per event still taking orders, and the "Order ahead" line above the store.
function drawEvents(){var box=$('get-events');if(!box)return;var was=getChoice(),evs=openEvents();box.innerHTML='';
 evs.forEach(function(e){var l=document.createElement('label');l.innerHTML='<input type="radio" name="get"> <span><strong></strong><small></small></span>';var i=l.querySelector('input');i.value='event:'+e.id;i.onchange=draw;
  l.querySelector('strong').textContent='Pick up in the paddock, free';l.querySelector('small').textContent=e.name+', '+e.dates+(e.place?' · '+e.place:'')+'. Order by '+shortDate(e.orderBy)+'.';
  if(was.fulfillment==='event'&&was.eventId===e.id)i.checked=true;box.appendChild(l)});
 if(was.fulfillment==='event'&&!document.querySelector('input[name=get]:checked'))document.querySelector('input[name=get][value=pickup]').checked=true;
 var line=$('event-line'),n=$('store-note');if(!line&&n&&evs.length){line=document.createElement('p');line.id='event-line';line.className='store-note event-line';n.parentNode.insertBefore(line,n)}
 if(line){line.hidden=!evs.length;if(evs.length)line.textContent='Order ahead, pick up in the 799 paddock: '+evs[0].name+', '+evs[0].dates+(evs[0].place?' ('+evs[0].place+')':'')+'.'}}
// One product's options, photo, part numbers, price, stock line, button and "notify me" box.
function drawProduct(id){var p=PRODUCTS[id],v=variant(id),av=sellable(id),rest=left(v.sku);
 all(attr('data-options',id)).forEach(function(box){box.innerHTML='';p.variants.forEach(function(x){var b=document.createElement('button');b.type='button';b.className='sw'+(online&&have(x.sku)<1?' out':'');b.style.background=x.hex||'#777';b.title=x.name;
  b.setAttribute('aria-label',x.name+(online&&have(x.sku)<1?' (out of stock)':''));b.setAttribute('aria-pressed',sel[id]===x.name);b.onclick=function(){sel[id]=x.name;draw()};box.appendChild(b)})});
 all(attr('data-option-name',id)).forEach(function(e){e.textContent=v.name});
 all(attr('data-variant-ids',id)).forEach(function(e){e.textContent=v.sku?'SKU '+v.sku+(v.upc?' · UPC '+v.upc:''):''});
 if(v.img)all(attr('data-variant-img',id)).forEach(function(img){if(img.dataset.sku!==v.sku){img.dataset.sku=v.sku;img.src=v.img.src;if(v.img.srcset)img.srcset=v.img.srcset;img.alt=v.img.alt}});
 all(attr('data-variant-link',id)).forEach(function(a){if(!a.dataset.base)a.dataset.base=a.getAttribute('href');a.href=a.dataset.base+(multi(id)?'?color='+encodeURIComponent(v.name):'')});
 all(attr('data-price',id)).forEach(function(e){if(price(id))e.textContent=money(price(id))});
 all(attr('data-stock',id)).forEach(function(e){e.textContent=av?stockText(have(v.sku),rest):''});
 all('.add'+attr('data-add',id)).forEach(function(b){b.disabled=!av||rest<1;b.textContent=!online?'Store offline':!av?'Coming soon':have(v.sku)<1?'Out of stock':rest<1?'All in your cart':'Add to cart'});
 all('form'+attr('data-notify',id)).forEach(function(f){var show=av&&have(v.sku)<1;f.hidden=!show;if(f.dataset.sku!==v.sku){f.dataset.sku=v.sku;f.querySelector('.notify-msg').textContent=''}})}
// Free shipping: the order ships free only when every item in the cart is marked free shipping.
function freeShip(id){var c=data.catalog[id];return c&&c.freeShipping!==undefined?!!c.freeShipping:!!(PRODUCTS[id]&&PRODUCTS[id].freeShipping)}
function draw(){
 IDS.forEach(drawProduct);
 var free=cart.filter(function(l){var h=BYSKU[l.sku];return h&&freeShip(h.id)}).length,allFree=cart.length>0&&free===cart.length,flat=(data.shipping.ship||{cents:2500}).cents;
 var n=count(),sub=cart.reduce(function(s,l){var h=BYSKU[l.sku];return s+l.qty*((h&&price(h.id))||0)},0),get=getChoice().fulfillment,shipC=get==='ship'&&allFree?0:(data.shipping[get]||{cents:0}).cents;
 $('ship-label').textContent=allFree?'Ship to me, free':'Ship to me, '+money(flat)+' flat';
 if($('ship-note'))$('ship-note').textContent='Lower 48. Address on the next screen.'+(free&&!allFree?' Ships free when every item in the cart has free shipping.':'');
 $('cart-count').textContent=n;$('cart-total').textContent=money(sub);$('cart-sub').textContent=money(sub+(n?shipC:0));$('sum-label').textContent=get==='ship'&&n?'Total with shipping':'Total';
 var ul=$('cart-lines');ul.innerHTML='';if(!cart.length)ul.innerHTML='<li class="empty-cart">Your cart is empty.</li>';
 cart.forEach(function(l,i){var h=BYSKU[l.sku],li=document.createElement('li');li.innerHTML='<strong></strong><span class="q"><button type="button" aria-label="Remove one">&minus;</button><span>'+l.qty+'</span><button type="button" aria-label="Add one">+</button></span><small></small>';
  li.querySelector('strong').textContent=lineLabel(l);li.querySelector('small').textContent=money(((h&&price(h.id))||0)*l.qty);
  var bs=li.querySelectorAll('button');bs[0].onclick=function(){l.qty--;if(!l.qty)cart.splice(i,1);save();draw()};bs[1].disabled=left(l.sku)<1;bs[1].onclick=function(){l.qty++;save();draw()};ul.appendChild(li)});
 // "Goes with your order": single-option products from the same categories as the cart, in stock and not in the cart yet.
 var cats={};cart.forEach(function(l){var h=BYSKU[l.sku];if(h)cats[PRODUCTS[h.id].cat]=1});
 var offers=IDS.filter(function(id){var v=PRODUCTS[id].variants[0];return !multi(id)&&cats[PRODUCTS[id].cat]&&sellable(id)&&left(v.sku)>0&&!inCart(v.sku)});
 var ub=$('upsell-btns');ub.innerHTML='';offers.forEach(function(id){var b=document.createElement('button');b.type='button';b.setAttribute('data-add',id);b.textContent='+ '+PRODUCTS[id].short+' '+money(price(id));ub.appendChild(b)});
 $('upsell').hidden=!offers.length;
 $('checkout').disabled=!cart.length||!online;
 align();
}
// Lines up titles, part numbers, descriptions and fact lists across each row of cards.
function align(){var parts=['h3','.idline','.desc','.facts'],items=all('.store-grid .item');
 items.forEach(function(it){parts.forEach(function(s){var e=it.querySelector(s);if(e)e.style.minHeight=''})});
 var rows={};items.forEach(function(it){var k=Math.round(it.getBoundingClientRect().top+scrollY);(rows[k]=rows[k]||[]).push(it)});
 Object.keys(rows).forEach(function(k){var row=rows[k];if(row.length<2)return;parts.forEach(function(s){var els=row.map(function(it){return it.querySelector(s)}).filter(Boolean),h=Math.max.apply(null,els.map(function(e){return e.getBoundingClientRect().height}));els.forEach(function(e){e.style.minHeight=h+'px'})})})}
window.addEventListener('resize',align);
function add(id){if(!PRODUCTS[id])return;var sku=variant(id).sku,l=cart.filter(function(x){return x.sku===sku})[0];if(l)l.qty++;else cart.push({sku:sku,qty:1});save();draw();open()}
function open(){$('cart').hidden=false;$('cart-shade').hidden=false;$('cart-close').focus()}
function close(){$('cart').hidden=true;$('cart-shade').hidden=true;$('cart-btn').focus()}
function note(t){var n=$('store-note');if(!n)return;n.textContent=t;n.hidden=!t}
document.addEventListener('click',function(e){var a=e.target.closest('[data-add]');if(a&&!a.disabled)add(a.getAttribute('data-add'))});
all('input[name=get]').forEach(function(r){r.onchange=draw});
$('cart-btn').onclick=open;$('cart-close').onclick=close;$('cart-shade').onclick=close;document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('cart').hidden)close()});
$('checkout').onclick=function(){var b=this;b.disabled=true;b.textContent='Opening secure checkout…';$('cart-error').hidden=true;
 fetch(API+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign(getChoice(),{items:cart.map(function(l){return{sku:l.sku,qty:l.qty}}),returnPath:location.pathname}))})
 .then(function(r){return r.json().then(function(j){return{r:r,j:j}})}).then(function(x){if(x.j.url){location.href=x.j.url;return}if(x.j.stock)data.stock=x.j.stock;throw new Error(x.j.error||'Checkout is unavailable.')})
 .catch(function(e){$('cart-error').textContent=e.message||'Checkout is unavailable. Please try again.';$('cart-error').hidden=false;b.textContent='Checkout';draw()})};
// "Email me when it's back"
all('form[data-notify]').forEach(function(f){f.onsubmit=function(e){e.preventDefault();var i=f.querySelector('input[type=email]'),m=f.querySelector('.notify-msg'),b=f.querySelector('button');
 if(!i.value||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i.value.trim())){m.textContent='Please enter a valid email address.';i.focus();return}
 b.disabled=true;fetch(API+'/api/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:f.dataset.sku,email:i.value.trim(),website:f.querySelector('.hp').value})})
 .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Please try again.')})})
 .then(function(){m.textContent="Got it. We'll email you once when it's back.";i.value=''}).catch(function(err){m.textContent=err.message||'Please try again.'}).then(function(){b.disabled=false})}});
// Track mode (QR code at the 799 table): offer "take it now" and preselect it, on every store page this visit.
var track=q.get('at')==='track'||via==='table';try{if(track)sessionStorage.setItem(TRACK,'1');else track=sessionStorage.getItem(TRACK)==='1'}catch(e){}
if(track){$('get-table').style.display='';document.querySelector('input[name=get][value=table]').checked=true}
if(q.get('order')==='success'){cart=[];save();var ref=q.get('ref')||'',num=/^cs_[A-Za-z0-9_]{8,}$/.test(ref)?' Order 799-'+ref.slice(-8).toUpperCase()+'.':'';
 note(via==='table'?'Paid! Show this screen at the 799 table to collect your gear.'+num:via==='event'?"Thanks! Your order is in. Stripe has emailed your receipt. Your gear will be waiting in the 799 paddock at the event, and we'll email you where to find us."+num:(via==='pickup'?"Thanks! Your order is in. Stripe has emailed your receipt, and we'll email you to set a pickup time.":"Thanks! Your order is in. Stripe has emailed your receipt, and we'll email tracking when it ships.")+num);
 setTimeout(function(){var n=$('store-note');if(n)n.scrollIntoView({block:'center'})},50)}
else if(q.get('order')==='cancelled')note('Checkout was cancelled. Your cart is saved.');
draw();
fetch(API+'/api/catalog').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){if(!j.catalog||typeof j.catalog!=='object'||!j.stock)throw 0;data=j;online=true;
 cart=cart.filter(function(l){var h=BYSKU[l.sku];return h&&!!data.catalog[h.id]&&l.qty>0});save();drawEvents();draw()})
 .catch(function(){note('The store is offline right now. Please check back soon.');draw()});
// Product page photo thumbnails.
all('[data-thumb]').forEach(function(t){t.onclick=function(){var m=$('main-photo');if(!m)return;m.src=t.dataset.thumb;m.removeAttribute('srcset');m.alt=t.dataset.alt||m.alt;all('[data-thumb]').forEach(function(x){x.setAttribute('aria-pressed',x===t)})}});
})();
