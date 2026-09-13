import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BALLAST_URL||'http://localhost:3000';
const address='0x6741990a207678c444ad53b732b80046435706cb';
const other='0x2222222222222222222222222222222222222222';
const browser=await chromium.launch();
try{
 for(const width of [390,768,1440,1920])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:theme,reducedMotion:'reduce'});
  await page.addInitScript(({address})=>{
   const listeners={};window.ethereum={request:async({method})=>method==='eth_accounts'?[address]:method==='eth_chainId'?'0xc488':null,on:(name,fn)=>{listeners[name]=fn;},removeListener:()=>{}};
   window.switchTestWallet=address=>listeners.accountsChanged?.([address]);
  },{address});
  let remaining=[{id:'11111111-1111-1111-1111-111111111111',kind:'cover_opened',title:'Cover bought',body:'Spent 20 tUSDC for 40 Down contracts. Makes you whole at 1.20% of a fall. Requested 2.50%; available liquidity reduced the fill.',data:{href:'/app/cover'},created_at:new Date().toISOString()}];
  const reads=[];
  await page.route('**/api/auth/session',route=>route.fulfill({json:{address}}));
  await page.route('**/api/notifications?*',route=>route.fulfill({json:{items:remaining,unread:remaining.length}}));
  await page.route('**/api/notifications/read',route=>{const body=route.request().postDataJSON();reads.push(body);remaining=body.all?[]:remaining.filter(n=>!body.ids.includes(n.id));return route.fulfill({json:{ok:true}});});
  await page.route('**/api/vault/status?*',route=>route.fulfill({json:{address,vaultLow:true,vaultEmpty:false,free:'10000000',estimatedPremium:'20000000',suggestedDeposit:'200000000',windowsRemaining:0.5,estimateReason:'Test fixture: current quoted premium.',observedAt:new Date().toISOString()}}));
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.locator('.vaultReminder').waitFor();
  const bell=page.getByRole('button',{name:/^Notifications/});await bell.click();
  await page.getByText('Cover bought',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.notificationBadge').textContent==='0');assert.equal(reads.length,1);
  const contrast=await page.locator('.notificationList p').evaluate(el=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
   const rgb=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(c=>c/255);};
   const lum=rgb=>rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
   const a=lum(rgb(getComputedStyle(el).color)),b=lum(rgb(getComputedStyle(el.closest('.notificationPanel')).backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });assert.ok(contrast>=4.5,`contrast ${contrast} ${width} ${theme}`);
  // Negative control: identical foreground/background must fail the same colour parser.
  const negative=await page.locator('.notificationList p').evaluate(el=>{const a=getComputedStyle(el.closest('.notificationPanel')).backgroundColor;el.style.color=a;return getComputedStyle(el).color===a;});assert.ok(negative);
  await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'Top up now',exact:true}).click();
  await page.locator('.topupField input').waitFor();assert.equal(await page.locator('.topupField input').inputValue(),'200');
  assert.ok(await page.locator('.topupField input').evaluate(el=>el===document.activeElement));
  await page.goto(base+'/app',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Remind me later'}).click();assert.equal(await page.locator('.vaultReminder').count(),0);
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.vaultReminder').count(),0);
  await page.evaluate(other=>window.switchTestWallet(other),other);await page.waitForTimeout(300);
  await page.getByRole('button',{name:/^Notifications/}).click();assert.equal(await page.getByText('Cover bought',{exact:true}).count(),0);assert.equal(await page.locator('.vaultReminder').count(),0);
  assert.ok(await page.getByRole('button',{name:'Sign in for notifications'}).isVisible());
  await page.close();console.log(`${width} ${theme}: unread/read, contrast, prefill, dismissal and wallet isolation passed`);
 }
}finally{await browser.close();}
