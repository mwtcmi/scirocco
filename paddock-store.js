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
var q=new URLSearchParams(location.search),via=q.get('via'),want=q.get('color'),wantSku=q.get('sku');
// The option picked for each product (?color= or ?sku= picks it on arrival).
var sel={};IDS.forEach(function(id){var p=PRODUCTS[id],bySku=wantSku&&p.variants.filter(function(v){return v.sku===wantSku})[0];
 sel[id]=bySku?bySku.name:want&&p.variants.some(function(v){return v.name===want})?want:(p.default||p.variants[0].name)});
var cart=null;try{cart=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
if(!Array.isArray(cart)){cart=[];try{(JSON.parse(localStorage.getItem(OLD)||'[]')||[]).forEach(function(l){var p=PRODUCTS[l.product];if(!p||!(l.qty>0))return;
 var v=p.variants.length>1?p.variants.filter(function(x){return x.name===l.color})[0]:p.variants[0];if(v)cart.push({sku:v.sku,qty:l.qty})});localStorage.removeItem(OLD)}catch(e){}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(cart))}catch(e){}}
function $(id){return document.getElementById(id)}
function all(s){return [].slice.call(document.querySelectorAll(s))}
function attr(name,id){return '['+name+'="'+id+'"]'}
function money(c){return '$'+(c/100).toFixed(2)}
function price(id){var c=data.catalog[id];return c&&c.cents}
// Configurator products ("Option"): each option has its own price and can be Coming Soon on its own.
function picker(id){return !!PRODUCTS[id].options}
function liveVariant(id,sku){var c=data.catalog[id];return c&&c.variants?c.variants.filter(function(x){return x.sku===sku})[0]:null}
function skuPrice(sku){var h=BYSKU[sku];if(!h)return 0;var lv=liveVariant(h.id,sku);return lv&&lv.cents!=null?lv.cents:picker(h.id)?h.v.cents||0:price(h.id)||0}
function variant(id){var p=PRODUCTS[id];return p.variants.filter(function(v){return v.name===sel[id]})[0]||p.variants[0]}
function multi(id){return PRODUCTS[id].variants.length>1}
function have(sku){return online?(data.stock[sku]||0):0}
function inCart(sku){return cart.reduce(function(s,l){return s+(l.sku===sku?l.qty:0)},0)}
// A set (v.includes) has no stock of its own: it uses one of each part, so parts and sets share the same count.
function parts(sku){var h=BYSKU[sku];return h&&h.v.includes?h.v.includes:[sku]}
function used(sku){return cart.reduce(function(s,l){return s+(parts(l.sku).indexOf(sku)>=0?l.qty:0)},0)}
function left(sku){var h=BYSKU[sku];if(h&&h.v.includes)return online?Math.min.apply(null,h.v.includes.map(function(k){return (data.stock[k]||0)-used(k)})):0;return have(sku)-used(sku)}
function sellable(id){return online&&!!data.catalog[id]&&(!picker(id)||!!liveVariant(id,variant(id).sku))}
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
function pickTo(id,i,val){var p=PRODUCTS[id],cur=variant(id).opts.slice();cur[i]=val;
 var hit=p.variants.filter(function(x){return x.opts.join('|')===cur.join('|')})[0]||p.variants.filter(function(x){return x.opts[i]===val})[0];if(hit){sel[id]=hit.name;draw()}}
// "pick": "many" (the MVRK ratchet grid): any mix of single options at once; an exact match for a set gets the set price.
function bySku(id,sku){return PRODUCTS[id].variants.filter(function(x){return x.sku===sku})[0]}
var gsel={};IDS.forEach(function(id){if(PRODUCTS[id].pick==='many'){var v=wantSku&&bySku(id,wantSku);gsel[id]=v?(v.includes?v.includes.slice():[v.sku]):[]}}); // starts empty unless ?sku= picks one
function gridSet(id){var pick=gsel[id].slice().sort().join(' ');return pick.indexOf(' ')<0?null:PRODUCTS[id].variants.filter(function(x){return x.includes&&x.includes.slice().sort().join(' ')===pick})[0]||null}
function gridLines(id){var st=gridSet(id);return st?[st.sku]:gsel[id].slice()}
function drawThumbs(id,v){all(attr('data-thumbs',id)).forEach(function(box){var shown=0,first=null;[].slice.call(box.querySelectorAll('[data-thumb]')).forEach(function(t){var on=!t.dataset.for||t.dataset.for.split(' ').some(function(k){return (v.shows||[v.sku]).indexOf(k)>=0});t.hidden=!on;if(on){shown++;if(!first)first=t}});
 if(box.dataset.keep){box.hidden=false;box.style.visibility=shown<2?'hidden':''}else box.hidden=shown<2;if(box.dataset.sku!==v.sku){box.dataset.sku=v.sku;[].slice.call(box.querySelectorAll('[data-thumb]')).forEach(function(t){t.setAttribute('aria-pressed',t===first)})}})}
// The photo area as a lineup of every ratchet to scale (same-scale cut-outs, "cut" + "inches"), grouped by the second
// option (Fixed, Flex). Nothing picked: all of them as light silhouettes under "Tap to build your set". Two or more
// picked: the picked ones in full chrome, the rest as silhouettes, so the picture builds as you pick. One picked: that
// ratchet's own photo. Each row can be tapped like the grid. A thumbnail click shows that photo instead.
var lineupOff={};
function toggleSku(id,sku){var i=gsel[id].indexOf(sku);if(i>=0)gsel[id].splice(i,1);else gsel[id].push(sku);if(gsel[id].length)sel[id]=bySku(id,gsel[id][gsel[id].length-1]).name;lineupOff[id]=false;draw()}
all('[data-pick-sku]').forEach(function(a){a.onclick=function(e){var id=a.getAttribute('data-pick-for'),sku=a.getAttribute('data-pick-sku');if(!gsel[id]||!bySku(id,sku))return;e.preventDefault();if(gsel[id].indexOf(sku)<0)toggleSku(id,sku);var g=document.querySelector('[data-grid="'+id+'"]');if(g)g.scrollIntoView({behavior:'smooth',block:'center'})}}); // Part numbers table: tap a SKU to add it to the set
function drawLineup(id){var p=PRODUCTS[id],pick=gsel[id];all(attr('data-lineup',id)).forEach(function(box){
 var vs=p.variants.filter(function(x){return x.cut}),n=vs.filter(function(x){return pick.indexOf(x.sku)>=0}).length;
 box.hidden=lineupOff[id]||!(n===0||n>=2);if(box.hidden)return;
 if(!box.dataset.built){box.dataset.built='1';var max=Math.max.apply(null,vs.map(function(x){return x.inches})),groups={},order=[];
  vs.forEach(function(x){var g=x.opts[1];if(!groups[g]){groups[g]=[];order.push(g)}groups[g].push(x)});
  var cap=document.createElement('div');cap.className='lu-cap';cap.textContent='Tap to build your set';box.appendChild(cap);
  order.forEach(function(g){var h=document.createElement('div');h.className='lu-head';h.textContent=g;box.appendChild(h);
   groups[g].sort(function(a,b){return a.inches-b.inches}).forEach(function(x){var r=document.createElement('button');r.type='button';r.className='lu-row';r.dataset.sku=x.sku;r.setAttribute('aria-label',x.name);
    var im=document.createElement('img');im.src=x.cut;im.alt='';im.style.width=(x.inches/max*82)+'%';var t=document.createElement('span');t.textContent=x.inches+'"';
    r.appendChild(im);r.appendChild(t);r.onclick=function(){toggleSku(id,x.sku)};box.appendChild(r)})})}
 box.classList.toggle('empty',n===0);
 [].slice.call(box.querySelectorAll('.lu-row')).forEach(function(r){var on=pick.indexOf(r.dataset.sku)>=0;r.classList.toggle('on',on);r.setAttribute('aria-pressed',on)})})}
function drawGrid(id){var p=PRODUCTS[id],pick=gsel[id],st=gridSet(id),v=st&&bySku(id,st.sku).img&&bySku(id,st.sku).shows[0]===st.sku?bySku(id,st.sku):variant(id),lines=gridLines(id),cat=online&&!!data.catalog[id];
 all(attr('data-cell',id)).forEach(function(b){var sku=b.dataset.sku,out=online&&have(sku)<1,soon=online&&cat&&!liveVariant(id,sku);b.setAttribute('aria-pressed',pick.indexOf(sku)>=0);b.classList.toggle('out',out||soon);
  if(!b.onclick)b.onclick=function(){toggleSku(id,sku)}});
 all(attr('data-quick',id)).forEach(function(b){var k=b.dataset.skus;b.setAttribute('aria-pressed',!!k&&pick.slice().sort().join(' ')===k.split(' ').sort().join(' '));
  if(!b.onclick)b.onclick=function(){lineupOff[id]=false;gsel[id]=k?k.split(' '):[];if(gsel[id].length)sel[id]=bySku(id,gsel[id][gsel[id].length-1]).name;draw()}});
 if(v.img)all(attr('data-variant-img',id)).forEach(function(img){if(img.dataset.sku!==v.sku){img.dataset.sku=v.sku;img.src=v.img.src;if(v.img.srcset)img.srcset=v.img.srcset;img.alt=v.img.alt}});
 drawThumbs(id,v);if(!pick.length)all(attr('data-thumbs',id)).forEach(function(t){t.style.visibility='hidden'});drawLineup(id);
 var total=lines.reduce(function(t,k){return t+skuPrice(k)},0),n=pick.length;
 all(attr('data-price',id)).forEach(function(e){e.textContent=n?money(total):'\u00a0';e.style.visibility=n?'':'hidden'});
 all(attr('data-grid-count',id)).forEach(function(e){e.textContent=n?n+' picked':''});
 all(attr('data-grid-sum',id)).forEach(function(e){var q=all(attr('data-quick',id)).filter(function(b){return b.dataset.skus&&b.dataset.skus.split(' ').sort().join(' ')===pick.slice().sort().join(' ')})[0];e.textContent=q?q.dataset.label+': '+pick.map(function(k){return bySku(id,k)}).sort(function(a,b){return parseFloat(a.size)-parseFloat(b.size)}).map(function(x){return x.size}).join(', ')+'.':n?pick.map(function(k){return bySku(id,k).name}).join(' · '):'Tap the ratchets you want.'});
 all(attr('data-variant-ids',id)).forEach(function(e){e.textContent=n?'SKU '+(st?st.sku:pick.join(' · ')):''});
 var bad=pick.filter(function(k){return !cat||!liveVariant(id,k)}),outs=pick.filter(function(k){return online&&have(k)<1}),rest=Math.min.apply(null,lines.map(function(k){return left(k)}).concat([99]));
 all(attr('data-stock',id)).forEach(function(e){e.textContent=n&&online&&!outs.length?(rest<1?'All in your cart':rest<3?'Only '+rest+' left':''):''});
 all('.add'+attr('data-add',id)).forEach(function(b){var ok=online&&n&&!bad.length&&!outs.length&&rest>0;b.disabled=!ok;
  b.textContent=!n?'Build your set':bad.length&&online?'Coming Soon':!online?'Coming Soon':outs.length?(outs.length===n?'Out of stock':bySku(id,outs[0]).name+' is out of stock'):rest<1?'All in your cart':n>1?'Add '+n+' to cart':'Add to cart'});
 all('form'+attr('data-notify',id)).forEach(function(f){var k=outs[0],show=!!k&&cat;f.hidden=!show;if(k&&f.dataset.sku!==k){f.dataset.sku=k;f.querySelector('.notify-msg').textContent='';var l=f.querySelector('label');if(l)l.textContent='Want the '+bySku(id,k).name+'? Get an email when it\'s back.'}})}
function drawProduct(id){if(PRODUCTS[id].pick==='many'){drawGrid(id);return}var p=PRODUCTS[id],v=variant(id),av=sellable(id),rest=left(v.sku);
 if(v.opts){all(attr('data-pick',id)).forEach(function(b){var i=+b.dataset.opt;b.setAttribute('aria-pressed',v.opts[i]===b.dataset.val);if(!b.onclick)b.onclick=function(){pickTo(id,i,b.dataset.val)}});
  all(attr('data-pick-name',id)).forEach(function(e){e.textContent=v.opts[+e.dataset.opt]+(+e.dataset.opt===v.opts.length-1&&v.size?', '+v.size:'')});
  all(attr('data-thumbs',id)).forEach(function(box){var shown=0,first=null;[].slice.call(box.querySelectorAll('[data-thumb]')).forEach(function(t){var on=!t.dataset.for||t.dataset.for.split(' ').some(function(k){return (v.shows||[v.sku]).indexOf(k)>=0});t.hidden=!on;if(on){shown++;if(!first)first=t}});
   if(box.dataset.keep){box.hidden=false;box.style.visibility=shown<2?'hidden':''}else box.hidden=shown<2;if(box.dataset.sku!==v.sku){box.dataset.sku=v.sku;[].slice.call(box.querySelectorAll('[data-thumb]')).forEach(function(t){t.setAttribute('aria-pressed',t===first)})}})}
 all(attr('data-options',id)).forEach(function(box){box.innerHTML='';p.variants.forEach(function(x){var b=document.createElement('button');b.type='button';b.className='sw'+(online&&have(x.sku)<1?' out':'');b.style.background=x.hex||'#777';b.title=x.name;
  b.setAttribute('aria-label',x.name+(online&&have(x.sku)<1?' (out of stock)':''));b.setAttribute('aria-pressed',sel[id]===x.name);b.onclick=function(){sel[id]=x.name;draw()};box.appendChild(b)})});
 all(attr('data-option-name',id)).forEach(function(e){e.textContent=v.name});
 all(attr('data-variant-ids',id)).forEach(function(e){e.textContent=v.sku?'SKU '+v.sku+(v.upc?' · UPC '+v.upc:''):''});
 if(v.img)all(attr('data-variant-img',id)).forEach(function(img){if(img.dataset.sku!==v.sku){img.dataset.sku=v.sku;img.src=v.img.src;if(v.img.srcset)img.srcset=v.img.srcset;img.alt=v.img.alt}});
 all(attr('data-variant-link',id)).forEach(function(a){if(!a.dataset.base)a.dataset.base=a.getAttribute('href');a.href=a.dataset.base+(picker(id)?'?sku='+encodeURIComponent(v.sku):multi(id)?'?color='+encodeURIComponent(v.name):'')});
 all(attr('data-price',id)).forEach(function(e){var c=picker(id)?skuPrice(v.sku):price(id);if(c)e.textContent=money(c)});
 all(attr('data-stock',id)).forEach(function(e){e.textContent=av?stockText(have(v.sku),rest):''});
 all('.add'+attr('data-add',id)).forEach(function(b){b.disabled=!av||rest<1;b.textContent=!online&&!picker(id)?'Store offline':!av?'Coming Soon':have(v.sku)<1?'Out of stock':rest<1?'All in your cart':'Add to cart'});
 all('form'+attr('data-notify',id)).forEach(function(f){var show=av&&have(v.sku)<1&&!v.includes;f.hidden=!show;if(f.dataset.sku!==v.sku){f.dataset.sku=v.sku;f.querySelector('.notify-msg').textContent=''}})}
// Free shipping: the order ships free only when every item in the cart is marked free shipping.
function freeShip(id){var c=data.catalog[id];return c&&c.freeShipping!==undefined?!!c.freeShipping:!!(PRODUCTS[id]&&PRODUCTS[id].freeShipping)}
function draw(){
 IDS.forEach(drawProduct);
 var free=cart.filter(function(l){var h=BYSKU[l.sku];return h&&freeShip(h.id)}).length,allFree=cart.length>0&&free===cart.length,flat=(data.shipping.ship||{cents:2500}).cents;
 var n=count(),sub=cart.reduce(function(s,l){return s+l.qty*skuPrice(l.sku)},0),get=getChoice().fulfillment,shipC=get==='ship'&&allFree?0:(data.shipping[get]||{cents:0}).cents;
 $('ship-label').textContent=allFree?'Ship to me, free':'Ship to me, '+money(flat)+' flat';
 if($('ship-note'))$('ship-note').textContent='Lower 48. Address on the next screen.'+(free&&!allFree?' Ships free when every item in the cart has free shipping.':'');
 $('cart-count').textContent=n;$('cart-total').textContent=money(sub);$('cart-sub').textContent=money(sub+(n?shipC:0));$('sum-label').textContent=get==='ship'&&n?'Total with shipping':'Total';
 var ul=$('cart-lines');ul.innerHTML='';if(!cart.length)ul.innerHTML='<li class="empty-cart">Your cart is empty.</li>';
 cart.forEach(function(l,i){var h=BYSKU[l.sku],li=document.createElement('li');li.innerHTML='<strong></strong><span class="q"><button type="button" aria-label="Remove one">&minus;</button><span>'+l.qty+'</span><button type="button" aria-label="Add one">+</button></span><small></small>';
  li.querySelector('strong').textContent=lineLabel(l);li.querySelector('small').textContent=money(skuPrice(l.sku)*l.qty);
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
function add(id){if(!PRODUCTS[id])return;(PRODUCTS[id].pick==='many'?gridLines(id):[variant(id).sku]).forEach(function(sku){var l=cart.filter(function(x){return x.sku===sku})[0];if(l)l.qty++;else cart.push({sku:sku,qty:1})});save();draw();open()}
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
 cart=cart.filter(function(l){var h=BYSKU[l.sku];return h&&!!data.catalog[h.id]&&(!picker(h.id)||!!liveVariant(h.id,l.sku))&&l.qty>0});save();drawEvents();draw()})
 .catch(function(){note('The store is offline right now. Please check back soon.');draw()});
// Product page photo thumbnails.
all('[data-thumb]').forEach(function(t){t.onclick=function(){var m=$('main-photo');if(!m)return;IDS.forEach(function(id){if(PRODUCTS[id].pick==='many'){lineupOff[id]=true;drawLineup(id)}});m.src=t.dataset.thumb;m.removeAttribute('srcset');m.alt=t.dataset.alt||m.alt;all('[data-thumb]').forEach(function(x){x.setAttribute('aria-pressed',x===t)})}});
})();
