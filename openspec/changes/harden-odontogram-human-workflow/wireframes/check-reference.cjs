// Planning-reference checks only. No production app or clinical API requests.
const { chromium } = require('../../../../app/frontend/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const base=pathToFileURL(path.join(__dirname,'odontogram-reference.html')).href;
  const states=['idle','draft','saving','saved','read_stale','uncertain','conflict','correction','whole_tooth','history'];
  const sizes=[[1440,900],[1280,800],[1024,768],[768,1024],[430,932],[390,844]];
  const results=[];
  try {
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height});
      for(const state of states){
        await page.goto(base+'?state='+state+'&length=long');
        const check=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,targets:[...document.querySelectorAll('button:not([hidden])')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44),text:getComputedStyle(document.querySelector('textarea')).fontSize,message:document.querySelector('#feedback').textContent}));
        if(check.scroll>width||!check.targets||check.text!=='16px'||!check.message)throw Error(JSON.stringify({width,state,check}));
        results.push({width,height,state,panel:false,...check});
        if(width>=1024){await page.locator('#panel').click();const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);if(scroll>width)throw Error('panel overflow '+width+' '+state);results.push({width,height,state,panel:true,scroll});}
        if((width===1440&&state==='draft')||(width===390&&['draft','conflict','correction','read_stale'].includes(state)))await page.screenshot({path:path.join(__dirname,`${width}-${state}.png`),fullPage:true});
      }
      await page.goto(base+'?patient=short&dentition=primary&state=whole_tooth');
      if(await page.locator('[data-fdi]').count()!==5)throw Error('primary count');
      for(const q of [5,6,8,7]){await page.locator('[data-q="'+q+'"]').click();if(await page.locator('[data-fdi]').count()!==5)throw Error('quadrant');}
      results.push({width,height,fixture:'short-name/primary/all-quadrants',passed:true});
      await page.goto(base+'?state=correction');
      if(!await page.locator('#replacement-context').isVisible())throw Error('replacement context absent');
      if(await page.locator('#replacement-fdi').inputValue()!=='26')throw Error('replacement FDI');
      await page.locator('#replacement-mode').selectOption('without');
      if(await page.locator('#editor').isVisible()||!await page.locator('#reason').isVisible())throw Error('no replacement composition');
      if(!await page.getByRole('button',{name:'Guardar corrección',exact:true}).isVisible())throw Error('no replacement save absent');
      if(!await page.locator('#correction-consequence').textContent().then(text=>text.includes('ningún reemplazo')))throw Error('no replacement consequence');
      if(await page.evaluate(()=>document.documentElement.scrollWidth)>width)throw Error('no replacement overflow');
      results.push({width,height,fixture:'correction/without-replacement',passed:true});
      if(width===390)await page.screenshot({path:path.join(__dirname,'390-correction-without-replacement.png'),fullPage:true});
      await page.locator('#replacement-mode').selectOption('with');
      await page.locator('#correction-outcome').selectOption('read_stale');
      if(!await page.locator('#correction-receipt').isVisible()||!await page.locator('#correction-read-retry').isVisible())throw Error('confirmed correction read retry absent');
      if(await page.locator('#editor').isVisible())throw Error('confirmed correction editable');
      if(await page.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.getClientRects().length&&button.textContent==='Guardar corrección')))throw Error('confirmed correction offers write');
      if(await page.evaluate(()=>document.documentElement.scrollWidth)>width)throw Error('correction stale overflow');
      results.push({width,height,fixture:'correction/confirmed-write-failed-read',passed:true});
      if(width===390)await page.screenshot({path:path.join(__dirname,'390-correction-read-stale.png'),fullPage:true});
      // Switching presentation must not leak correction-only controls into other states.
      await page.locator('#state').selectOption('draft');
      if(await page.locator('#correction-review').isVisible()||await page.locator('#replacement-context').isVisible())throw Error('correction presentation leaked');
    }
    if(errors.length)throw Error(errors.join('\n'));
    fs.writeFileSync(path.join(__dirname,'reference-check.json'),JSON.stringify({scope:'Synthetic composition only; no production/API/DB/AT/virtual keyboard proof',cases:results.length,pageErrors:errors,results},null,2));
    console.log(JSON.stringify({cases:results.length,pageErrors:errors,passed:true}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
