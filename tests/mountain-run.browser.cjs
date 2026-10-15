const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:8000/mountain-run/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 // Keep gameplay checks independent of the public service, including its pre-launch connection-test response.
 await page.route('https://scirocco799-leaderboard.mr-mikewhite.workers.dev/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"connected":1}'}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.addInitScript(()=>{
  const NativeAudioContext=window.AudioContext;
  window.AudioContext=class extends NativeAudioContext {
   constructor(...args){super(...args);window.testAudio=this}
   createGain(){const gain=super.createGain();if(!window.testGain)window.testGain=gain;else window.testTireGain=gain;return gain}
  };
  window.testNow=100;window.requestAnimationFrame=cb=>{window.testFrame=cb;return 1};
  window.stepGame=n=>{for(let i=0;i<n;i++){window.testNow+=50;window.testFrame(window.testNow)}};
  // Drive through real input events while keeping the car centered in the rendered road.
  window.driveGame=n=>{for(let i=0;i<n;i++){
   if(!document.getElementById('modal').classList.contains('off'))break;
   const x=window.carDraw?.x,progress=parseInt(document.getElementById('dist').textContent);
   // Aim toward the first pothole for the contact/sound check; normal summit runs stay centered.
   const center=(window.carDraw?.sceneWidth||960)/2-(window.seekPothole&&progress>=16&&progress<=22?150:0);
   const feedback=document.getElementById('feedback');
   const brake=feedback.classList.contains('visible')&&feedback.textContent.includes('CROSSING');
   for(const [key,on] of [['ArrowLeft',x>center+15],['ArrowRight',x<center-15],['ArrowDown',brake],['ArrowUp',!brake]])
    window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{key}));
   window.stepGame(1);
   if(window.stopAtPothole&&feedback.classList.contains('visible')&&feedback.textContent.includes('POTHOLE'))break;
  }};
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(im,...args){const matrix=this.getTransform(),scaleX=Math.hypot(matrix.a,matrix.c);window.carDraw={x:matrix.e/scaleX,sceneWidth:this.canvas.width/scaleX,src:im.src,width:im.naturalWidth,height:im.naturalHeight,args,matrix:Array.from(['a','b','c','d','e','f'],k=>this.getTransform()[k])};return draw.call(this,im,...args)};
 });
 await page.goto(baseURL);
 assert.match(await page.locator('.stage-tag').textContent(),/GAMEPLAY V5/, 'the server must serve the current gameplay release');
 assert.equal(await page.locator('.stage-tag').isVisible(),false, 'race labels stay hidden on the welcome screen');
 await page.waitForFunction(()=>window.testFrame&&performance.getEntriesByType('resource').some(r=>r.name.includes('799-scirocco-rear.svg')));
 await page.evaluate(()=>stepGame(1));await page.waitForFunction(()=>window.carDraw);
 let draw=await page.evaluate(()=>carDraw);assert.equal(draw.width/draw.height,1.5);assert.equal(draw.args[2],216);
 const checkAspect=async()=>{const d=await page.evaluate(()=>carDraw),b=await page.locator('#scene').boundingBox();assert.ok(Math.abs(d.args[2]*b.width/d.sceneWidth/(d.args[3]*b.height/600)-1.5)<.001)};
 await checkAspect();
 assert.equal(await page.locator('#damage').count(),0);
 assert.equal(await page.locator('#checkpoint').count(),0, 'distance popups must not obstruct the course');
 assert.equal(await page.locator('#eventSelect option').count(),9);
 const scenery = new Set();
 for(let i=0;i<9;i++){
  await page.locator('#eventSelect').selectOption(String(i));
  const preview=await page.evaluate(()=>{
   const e=MountainRun.events[Number(document.getElementById('eventSelect').value)];
   return {expected:e,actual:document.getElementById('intro').dataset.event,venue:document.getElementById('previewVenue').textContent,habitat:document.querySelector('#previewScene svg').dataset.habitat,art:document.getElementById('previewScene').innerHTML};
  });
  assert.equal(preview.actual,preview.expected.id);assert.equal(preview.venue,preview.expected.short);assert.equal(preview.habitat,preview.expected.habitat);scenery.add(preview.art);
 }
 assert.equal(scenery.size,9,'every venue has its own start-line preview');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.idle-exhaust i').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#eventSelect').selectOption('7');assert.match(await page.locator('#courseLocation').innerText(),/Lake Michigan/);
 await page.locator('#eventSelect').selectOption('0');
 await page.screenshot({path:'/tmp/gameplay-v5-start.png'});
 assert.match(await page.locator('#msg').innerText(),/¾ over the white line/);
 assert.equal(await page.locator('.logo').getAttribute('href'),'https://scirocco799.com/');
 assert.equal(await page.locator('.season-signature').evaluate(el=>getComputedStyle(el).color),'rgb(32, 201, 51)');
 assert.match(await page.locator('#sound').innerText(),/SOUND ON/);assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>!!window.testAudio),false);
 await page.click('#start');
 assert.equal(await page.locator('.stage-tag').isVisible(),true);
 assert.equal(await page.locator('.finish-marker text').textContent(),'FINISH');
 assert.equal(await page.locator('.finish-marker svg').count(),2);
 await page.waitForFunction(()=>window.testAudio?.state==='running'&&window.testGain?.gain.value>0&&window.testTireGain?.gain.value>.005,null,{polling:50});
 await page.keyboard.down('ArrowUp');await page.evaluate(()=>stepGame(6));await page.screenshot({path:'/tmp/gameplay-launch-burnout.png'});
 await page.evaluate(()=>stepGame(20));await page.keyboard.up('ArrowUp');
 await page.waitForFunction(()=>window.testTireGain.gain.value<.001,null,{polling:50});
 assert.ok(parseInt(await page.locator('#speed').innerText())>90);
 const before=await page.evaluate(()=>carDraw.matrix[4]);await page.keyboard.down('ArrowRight');await page.evaluate(()=>stepGame(4));await page.keyboard.up('ArrowRight');assert.ok((await page.evaluate(()=>carDraw.matrix[4]))>before);
 await page.keyboard.down('ArrowDown');await page.evaluate(()=>stepGame(20));await page.keyboard.up('ArrowDown');assert.ok(parseInt(await page.locator('#speed').innerText())<25);
 await page.keyboard.press('Space');const paused=await page.locator('#time').innerText();await page.evaluate(()=>stepGame(20));assert.equal(await page.locator('#time').innerText(),paused);assert.match(await page.locator('#title').innerText(),/PAUSED/);
 await page.click('#start');await page.evaluate(()=>stepGame(4));assert.notEqual(await page.locator('#time').innerText(),paused);
 await page.keyboard.press('r');await page.evaluate(()=>stepGame(1));assert.equal(await page.locator('#dist').innerText(),'0%');assert.equal(await page.locator('#apexes').innerText(),'0');
 await page.click('#sound');assert.match(await page.locator('#sound').innerText(),/SOUND OFF/);assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');await page.waitForFunction(()=>window.testGain.gain.value<.001,null,{polling:50});await page.keyboard.press('m');assert.match(await page.locator('#sound').innerText(),/SOUND ON/);await page.waitForFunction(()=>window.testGain.gain.value>0,null,{polling:50});
 await page.keyboard.down('ArrowUp');await page.evaluate(()=>stepGame(45));await page.keyboard.up('ArrowUp');await page.screenshot({path:'/tmp/gameplay-chicane.png'});
 await page.keyboard.press('r');await page.keyboard.down('ArrowRight');await page.evaluate(()=>stepGame(50));await page.keyboard.up('ArrowRight');
 assert.match(await page.locator('#title').innerText(),/OFF ROAD/);assert.equal(await page.locator('#best').innerText(),'--');
 await page.click('#start');await page.evaluate(()=>stepGame(1));assert.equal(await page.locator('#round').innerText(),'1 / 9');
 await page.evaluate(()=>{window.stopAtPothole=true;window.seekPothole=true});
 for(let i=0;i<18&&!/POTHOLE/.test(await page.locator('#feedback').innerText());i++)await page.evaluate(()=>driveGame(100));
 assert.match(await page.locator('#feedback').innerText(),/POTHOLE/, 'drive through an actual surface hazard');
 await page.waitForFunction(()=>window.testTireGain.gain.value>.005,null,{polling:50});
 await page.screenshot({path:'/tmp/gameplay-pothole-skid.png'});
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>window.testGain.gain.value<.001&&window.testTireGain.gain.value<.001,null,{polling:50});
 await page.click('#sound');await page.click('#start');await page.evaluate(()=>stepGame(3));
 await page.waitForFunction(()=>window.testGain.gain.value<.001&&window.testTireGain.gain.value<.001,null,{polling:50});
 await page.click('#sound');
 await page.waitForFunction(()=>window.testTireGain.gain.value>.005,null,{polling:50});
 await page.evaluate(()=>{window.stopAtPothole=false;window.seekPothole=false});
 for(let i=0;i<18&&!(await page.locator('#modal').isVisible());i++)await page.evaluate(()=>driveGame(500));
 assert.match(await page.locator('#title').innerText(),/FINISH|SEASON/);assert.equal(await page.locator('#dist').innerText(),'100%');assert.match(await page.locator('#msg').innerText(),/CLEAN APEXES/);assert.notEqual(await page.locator('#best').innerText(),'--');
 await page.click('#start');await page.evaluate(()=>stepGame(1));assert.equal(await page.locator('#dist').innerText(),'0%');
 for(let round=1;round<9;round++){
  assert.equal(await page.locator('#round').innerText(),(round+1)+' / 9');
  assert.equal(await page.locator('.hud').isVisible(),true, 'restore the racing HUD for each next event');
  await page.screenshot({path:'/tmp/season-event-'+(round+1)+'.png'});
  for(let i=0;i<18&&!(await page.locator('#modal').isVisible());i++)await page.evaluate(()=>driveGame(500));
  assert.match(await page.locator('#title').innerText(),/FINISH|SEASON/, 'finish event '+(round+1));
  if(round<8){await page.click('#start');await page.evaluate(()=>stepGame(1))}
 }
 assert.match(await page.locator('#title').innerText(),/SEASON/);assert.match(await page.locator('#msg').innerText(),/9 \/ 9/);
 await page.locator('#replay').click();await page.evaluate(()=>stepGame(1));assert.equal(await page.locator('#round').innerText(),'9 / 9');
 await page.locator('#pause').click();await page.locator('#eventMenu').click();
 assert.equal(await page.locator('#eventSelect').inputValue(),'8');assert.match(await page.locator('#seasonProgress').innerText(),/9 \/ 9/);
 await page.setViewportSize({width:390,height:844});await page.reload();await page.evaluate(()=>stepGame(1));await page.screenshot({path:'/tmp/gameplay-v4-start-mobile.png'});await page.click('#start');await page.keyboard.press('r');const gas=await page.locator('#up').boundingBox();await page.mouse.move(gas.x+gas.width/2,gas.y+gas.height/2);await page.mouse.down();await page.evaluate(()=>stepGame(20));await page.mouse.up();assert.ok(parseInt(await page.locator('#speed').innerText())>80);
 await checkAspect();const stage=await page.locator('.stage').boundingBox();assert.ok(stage.x>=0&&stage.x+stage.width<=390&&stage.y+stage.height<=844);await page.screenshot({path:'/tmp/gameplay-mobile.png'});
 await page.setViewportSize({width:844,height:390});await page.reload();await page.evaluate(()=>stepGame(1));const footer=await page.locator('.controls').boundingBox();assert.ok(footer.y+footer.height<=390);const panel=await page.locator('.panel').boundingBox();assert.ok(panel.y>=0&&panel.y+panel.height<=390);const startButton=await page.locator('#start').boundingBox();assert.ok(startButton.y+startButton.height<=panel.y+panel.height, 'the landscape welcome button must be visible without scrolling');assert.notEqual(await page.locator('#best').innerText(),'--');
 assert.deepEqual(errors,[]);console.log('PASS: sprite, desktop/mobile proportions, real controls, pause/resume, restart, engine and burnout/skid sound, actual pothole contact, all nine season events, next-event/replay/menu flow, per-event best persistence, mobile pointer input; off-road crash/replay, V5 season selector; no page or HTTP errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
