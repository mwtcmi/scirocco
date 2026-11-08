/* "How to play" screen for the Mountain Run start screen (arcade preview).
   The rules come from the start screen's own quick guide, so they stay in one place. */
(function(){
  var guide=document.querySelector('#msg .quick-guide');
  var actions=document.querySelector('#gamePanel .panel-actions');
  var game=document.getElementById('game');
  if(!guide||!actions||!game)return;
  var rules=guide.innerHTML;
  var d=document.createElement('dialog');
  d.className='how-to-play';d.id='howToPlay';d.setAttribute('aria-labelledby','howToTitle');
  d.innerHTML='<h2 id="howToTitle">HOW TO PLAY</h2>'+
    '<p class="how-goal">Climb from the start to the finish as fast as you can. Your best time goes on the podium.</p>'+
    '<div class="how-rules">'+rules+'</div>'+
    '<form method="dialog"><button class="how-close" value="ok">GOT IT &#9654;</button></form>';
  game.appendChild(d);
  var b=document.createElement('button');
  b.type='button';b.className='how-open';b.id='howToOpen';b.setAttribute('aria-haspopup','dialog');
  b.textContent='? HOW TO PLAY';
  actions.appendChild(b);
  b.addEventListener('click',function(){if(d.showModal)d.showModal();else d.setAttribute('open','')});
  // Keys pressed while reading the rules shouldn't reach the game.
  d.addEventListener('keydown',function(e){if(e.key!=='Escape'&&e.key!=='Tab'&&e.key!=='Enter')e.stopPropagation()});
  d.addEventListener('close',function(){b.focus()});
})();
