async page => {
  const dir='docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/';
  const result=[];
  await page.goto('http://localhost:8000/a/audit-thread');
  await page.getByRole('region',{name:'Evoluciones consultadas'}).waitFor();
  async function capture(name) {
    await page.waitForTimeout(400); // Allow responsive React effects and 200ms drawer transitions to settle.
    await page.screenshot({path:dir+name+'.png'});
    const data=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent),controls:[...document.querySelectorAll('button,a,input,textarea,select')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({role:e.tagName,name:e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder'),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}})),listText:document.querySelector('[aria-label="Evoluciones consultadas"]')?.textContent}));
    result.push({name,url:page.url(),...data});
  }
  for(const width of [1440,1024,768,390,360]) {
    await page.setViewportSize({width,height:900});
    await capture('assistant-'+width);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('link',{name:'Ver evolución del 10 oct 2026 · 12:00',exact:true}).first().click();
  await page.getByRole('tab',{name:'Actividad',exact:true}).waitFor();
  await capture('evolution-destination');
  await page.getByRole('tab',{name:'Información',exact:true}).click();
  await capture('patient-information');
  await page.getByRole('tab',{name:'Resumen',exact:true}).click();
  await capture('patient-summary');
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Pacientes',exact:true}).click();
  await page.getByRole('textbox',{name:'Buscar por nombre, teléfono o RUT'}).waitFor();
  await page.getByRole('link').filter({hasText:'Paciente sintética Alejandra'}).waitFor();
  await capture('patients-desktop');
  await page.setViewportSize({width:390,height:844});
  await capture('patients-mobile');
  return {measurements:result,requests:await page.evaluate(()=>window.auditRequestLog())};
}
