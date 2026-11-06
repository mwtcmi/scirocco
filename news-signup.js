// 799 News sign-up: posts to the store, which emails a confirmation link (double opt-in).
// Live domains use the live store; preview links (*.pages.dev) and local copies use the test store.
(function(){
var API=/(^|\.)(799motorsport|scirocco799)\.com$/.test(location.hostname)?'https://scirocco799-store.mr-mikewhite.workers.dev':'https://scirocco799-store-test.mr-mikewhite.workers.dev';
var OK=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
[].forEach.call(document.querySelectorAll('form[data-news-form]'),function(f){
 var msg=f.querySelector('.news-msg'),b=f.querySelector('button'),em=f.querySelector('input[name=email]');
 f.addEventListener('submit',function(e){e.preventDefault();var email=em.value.trim();
  if(!OK.test(email)){msg.textContent='Please enter a valid email address.';em.focus();return}
  b.disabled=true;msg.textContent='';
  fetch(API+'/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,firstName:(f.querySelector('input[name=firstName]')||{}).value||'',website:f.querySelector('input[name=website]').value})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Please try again.')})})
  .then(function(){msg.textContent='Almost done. Check your inbox and tap the confirm button.';f.reset()})
  .catch(function(err){msg.textContent=err.message||'Please try again.'})
  .then(function(){b.disabled=false})})});
// Back from the confirmation link (/news?confirmed=1 or 0).
var c=new URLSearchParams(location.search).get('confirmed'),note=document.getElementById('news-note');
if(note&&c!==null){note.hidden=false;note.textContent=c==='1'?"You're on 799 News. Thanks for following along.":'That link has expired or was already used. Sign up again below.'}
})();
