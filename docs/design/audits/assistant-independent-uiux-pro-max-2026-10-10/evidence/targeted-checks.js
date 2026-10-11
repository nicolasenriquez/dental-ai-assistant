async page => {
 await page.setViewportSize({width:390,height:900});
 await page.goto('http://localhost:8000/a/audit-thread');
 await page.getByRole('region',{name:'Evoluciones consultadas'}).waitFor();
 await page.waitForTimeout(400);
 const mobile=await page.evaluate(()=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const menu=document.querySelector('button[aria-label="Abrir navegación"]');
   const banner=document.querySelector('.drive-bootstrap-banner');
   return {viewport:{width:innerWidth,height:innerHeight},menu:menu?box(menu):null,banner:banner?box(banner):null,bannerHeading:banner?box(banner.querySelector('p')):null,patient:box(document.querySelector('button[aria-label="Cambiar paciente activo"]')),transcript:box(document.querySelector('[role="log"]')),assets:[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e=>e.src||e.href)};
 });
 await page.screenshot({path:'docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/targeted-mobile.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.waitForTimeout(400);
 const history=await page.locator('aside').ariaSnapshot();
 const requests=await page.evaluate(()=>window.auditRequestLog());
 return {mobile,history,requests};
}
