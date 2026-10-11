async page => {
 const dir='docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/';
 const results=[];
 async function capture(name){
   await page.waitForTimeout(400);
   await page.screenshot({path:dir+name+'.png'});
   results.push({name,url:page.url(),snapshot:await page.locator('body').ariaSnapshot(),geometry:await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,focus:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),text:document.activeElement?.textContent},mainTop:document.querySelector('main')?.getBoundingClientRect().top}))});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://localhost:8000/a/audit-thread');
 await page.getByRole('region',{name:'Evoluciones consultadas'}).waitFor();
 await page.getByRole('button',{name:'Cambiar paciente activo'}).click();
 await capture('picker-open');
 await page.keyboard.press('Escape');
 await capture('picker-escape');
 await page.getByRole('button',{name:'Buscar en conversaciones'}).click();
 await capture('thread-search');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Abrir Google Drive'}).click();
 await capture('drive-desktop');
 await page.setViewportSize({width:390,height:844});
 await capture('drive-mobile');
 await page.keyboard.press('Escape');
 await capture('drive-escape-mobile');
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://localhost:8000/patients');
 await page.getByRole('textbox',{name:'Buscar por nombre, teléfono o RUT'}).fill('Sin coincidencias sintéticas');
 await page.getByText('No encontramos pacientes').waitFor({timeout:3000}).catch(()=>{});
 await capture('patients-search-empty');
 await page.goto('http://localhost:8000/assistant?view=pending');
 await page.getByText('No hay trabajo pendiente').waitFor();
 await capture('pending-empty');
 await page.route('**/api/clinical-pending-work?**',route=>route.fulfill({status:503,json:{detail:'synthetic unavailable'}}));
 await page.reload();
 await page.getByText('No pudimos cargar tus pendientes.').waitFor();
 await capture('pending-error');
 await page.setViewportSize({width:720,height:450});
 await page.emulateMedia({reducedMotion:'reduce'});
 await capture('reflow-720-reduced');
 return {results,requests:await page.evaluate(()=>window.auditRequestLog()),limitations:'720x450 is a reflow proxy, not browser 200% zoom; no physical device'};
}
