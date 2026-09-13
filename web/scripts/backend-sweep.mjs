import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BALLAST_URL||'http://localhost:3000';
const routes=['/','/app','/app/cover','/app/policy','/app/funds','/app/engine','/app/activity','/docs','/docs/what-it-is','/docs/what-it-pays','/docs/economics','/docs/how-it-works','/docs/custody','/docs/refusals','/docs/findings','/docs/limitations','/docs/reference'];
const browser=await chromium.launch();
let passed=0;const failures=[];
try{
 await Promise.all([390,768,1440,1920].map(async width=>{
  const page=await browser.newPage({viewport:{width,height:1000}});
  for(const theme of ['dark','light']){
   await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
   for(const route of routes){
    try{
     const response=await page.goto(base+route,{waitUntil:'networkidle',timeout:60000});
     assert.equal(response.status(),200);
     await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
     const overflow=await page.evaluate(()=>({body:document.body.scrollWidth,doc:document.documentElement.scrollWidth,width:innerWidth}));
     assert.ok(overflow.body<=width&&overflow.doc<=width,JSON.stringify(overflow));
     assert.ok(await page.locator('h1').first().isVisible(),'h1 hidden');
     if(route==='/app'){
      const bell=page.getByRole('button',{name:/^Notifications/});await bell.click();
      assert.ok(await page.getByRole('region',{name:'Wallet notifications'}).isVisible());
      const bounds=await page.locator('#notification-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
      const hit=await page.locator('#notification-panel').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.bottom-12));});assert.ok(hit,'notification panel is clipped or covered');
      await page.keyboard.press('Escape');assert.ok(await bell.evaluate(el=>el===document.activeElement));
     }
     passed++;
    }catch(e){failures.push({width,theme,route,error:e.message});}
   }
  }
  await page.close();
 }));
 console.log(JSON.stringify({routeChecksCompleted:passed,failures}));
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}}),page=await nojs.newPage();
 await page.goto(base,{waitUntil:'networkidle'});assert.ok(await page.locator('h1').isVisible());
 const invisible=await page.locator('body').evaluate(el=>[...el.querySelectorAll('h1,h2,p')].filter(x=>x.textContent.trim()&&getComputedStyle(x).opacity==='0').length);assert.equal(invisible,0);
 await page.screenshot({path:'/tmp/ballast-nojs-390.png',fullPage:true});await nojs.close();
 // A real Tab sequence, including a negative control proving this check can fail.
 const focus=await browser.newPage({viewport:{width:390,height:1000}});await focus.goto(base+'/app',{waitUntil:'networkidle'});
 let reached=false;for(let i=0;i<50;i++){await focus.keyboard.press('Tab');if(await focus.locator('.notificationToggle').evaluate(el=>el===document.activeElement)){reached=true;break;}}
 assert.ok(reached,'bell unreachable by Tab');
 const ring=()=>focus.locator('.notificationToggle').evaluate(el=>{const s=getComputedStyle(el);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2;});
 assert.ok(await ring(),'bell has no visible focus ring');
 const negative=await focus.addStyleTag({content:'#dir-a .notificationToggle:focus-visible{outline:none!important}'});assert.equal(await ring(),false);await negative.evaluate(el=>el.remove());assert.ok(await ring());
 await focus.keyboard.press('Enter');assert.ok(await focus.locator('#notification-panel').isVisible());
 await focus.screenshot({path:'/tmp/ballast-bell-390.png',fullPage:false});await focus.close();
 console.log(JSON.stringify({base,routeThemeWidthChecks:passed,total:136,noJs:'passed',realTabFocus:'passed including negative control',failures},null,2));
 if(failures.length)process.exitCode=1;
}finally{await browser.close();}
