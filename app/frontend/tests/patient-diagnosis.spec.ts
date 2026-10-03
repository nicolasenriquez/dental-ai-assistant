import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Page, expect, test } from '@playwright/test';

async function syntheticPatient(page:Page):Promise<string> {
  const body=String(20000000+Math.floor(Math.random()*60000000));
  let sum=0;
  for(let i=0;i<body.length;i++)sum+=Number(body[body.length-1-i])*(2+i%6);
  const check=11-sum%11;
  const dv=check===11?'0':check===10?'K':String(check);
  const response=await page.request.post('/api/patients',{data:{first_name:'Sintética',last_name:`Odontograma ${randomUUID().slice(0,8)}`,rut:`${body}-${dv}`}});
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

test.use({ storageState: path.join(os.tmpdir(), 'ai-tutor-playwright', 'auth.json') });
test('slice5 real manual list lifecycle, retry, conflict and dirty guard', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8001', 'Isolated E2E only');
  const patientId=await syntheticPatient(page);
  const base=`/api/patients/${patientId}/conditions`;
  await page.goto(`/patients/${patientId}?tab=clinical`);
  await expect(page.getByRole('heading',{name:'Diagnóstico manual'})).toBeVisible();
  await expect(page.getByText('Cargando condiciones…')).toBeHidden();
  const before=(await (await page.request.get(base)).json()).total;
  await page.getByRole('button',{name:'Caries',exact:true}).click();
  await page.getByLabel('Pieza FDI',{exact:true}).selectOption('36');
  const note=`Sintética ${randomUUID()}`;
  await page.getByLabel('Nota de condición').fill(note);
  await page.getByRole('checkbox',{name:'Mesial (M)'}).check();
  expect((await (await page.request.get(base)).json()).total).toBe(before);
  // Commit then lose response: only identical retry is allowed.
  let identifier='';
  await page.route(`**${base}`,async route=>{
    if(route.request().method()!=='POST')return route.continue();
    identifier=route.request().postDataJSON().id;
    await route.fetch();await route.abort();
  },{times:1});
  await page.getByRole('button',{name:'Guardar condición',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar guardado'})).toBeVisible();
  await expect(page.getByLabel('Nota de condición')).toBeDisabled();
  await page.getByRole('button',{name:'Reintentar guardado'}).click();
  const row=page.getByRole('article').filter({has:page.getByText(note,{exact:true})});
  await expect(row).toBeVisible();
  expect((await (await page.request.get(`${base}/${identifier}/revisions`)).json()).total).toBe(1);
  await row.getByRole('button',{name:'Editar condición'}).click();
  await page.getByLabel('Nota de condición').fill(`${note} local`);
  await page.request.patch(`${base}/${identifier}`,{data:{expected_revision:1,note:'Cambio remoto sintético'}});
  await page.getByRole('button',{name:'Guardar condición',exact:true}).click();
  await expect(page.getByText('Versión actual: 2')).toBeVisible();
  await page.getByRole('complementary',{name:'Editor de condición'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve('../../.playwright-cli/slice6-conflict-1440.png')});
  await page.getByRole('button',{name:'Rebasar mis cambios'}).click();
  await page.getByRole('button',{name:'Guardar condición',exact:true}).click();
  const edited=page.getByRole('article').filter({has:page.getByText(`${note} local`,{exact:true})});
  await expect(edited).toBeVisible();
  await edited.getByRole('button',{name:'Resolver condición'}).click();
  expect((await (await page.request.get(`${base}/${identifier}`)).json()).status).toBe('active');
  await page.getByRole('tab',{name:'Información',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Condición sin guardar'})).toBeVisible();
  await page.getByRole('button',{name:'Seguir editando'}).click();
  await page.getByRole('button',{name:'Guardar condición',exact:true}).click();
  await expect(edited.getByText('Resuelta · M',{exact:true})).toBeVisible();
  await edited.getByRole('button',{name:'Historial de condición'}).click();
  await expect(edited.getByText('Revisión 4 · Resuelta',{exact:true})).toBeVisible();
  await page.goto(`/patients/${patientId}?tab=clinical&condition=${identifier}`);
  await expect(page.getByRole('article',{name:'Pieza 36 · Caries · Resuelta'}).filter({has:page.getByText(`${note} local`,{exact:true})})).toBeFocused();
  const out=path.resolve('../../.playwright-cli');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'slice5-list-1440.png'),fullPage:true});
});

test('slice6 anatomy, symbols, draft highlight and available-width reflow', async ({page})=>{
  test.skip(process.env.E2E_BASE_URL!=='http://localhost:8001','Isolated E2E only');
  const patientId=await syntheticPatient(page);
  const base=`/api/patients/${patientId}/conditions`;
  const make=async(tooth_fdi:number,condition_code:string,surfaces:string[],dentition='permanent'):Promise<string>=>{
    const response=await page.request.post(base,{data:{id:randomUUID(),dentition,tooth_fdi,condition_code,surfaces}});
    const body=await response.json();
    return response.ok()?body.id:body.detail.existing.id;
  };
  const caries=await make(36,'caries',['M','O']);
  await make(36,'fracture',['V']);
  const resolved=await make(21,'incipient_caries',['M']);
  const current=await(await page.request.get(`${base}/${resolved}`)).json();
  if(current.status==='active')await page.request.patch(`${base}/${resolved}`,{data:{expected_revision:current.revision,status:'resolved'}});
  await make(51,'missing',[],'primary');
  const out=path.resolve('../../.playwright-cli');fs.mkdirSync(out,{recursive:true});
  await page.goto(`/patients/${patientId}?tab=clinical`);
  await expect(page.getByRole('heading',{name:'Odontograma FDI'})).toBeVisible();
  await expect(page.getByText('Cargando condiciones…')).toBeHidden();
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:375,height:667},{width:320,height:667}]){
    await page.setViewportSize(viewport);
    await expect(page.getByRole('img',{name:/Odontograma permanente/})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const selector=page.getByLabel('Seleccionar pieza FDI');
    await expect(selector).toBeVisible();
    expect((await selector.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('heading',{name:'Odontograma FDI'}).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); // settle shell reflow before measuring/capturing narrow states
    await page.screenshot({path:path.join(out,`slice6-chart-${viewport.width}.png`)});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Caries',exact:true}).click();
  await page.getByLabel('Seleccionar pieza FDI').selectOption('11');
  await page.getByLabel('Nota de condición').fill('Borrador sintético intacto');
  const hover=page.getByRole('button',{name:/Pieza 36: /});
  if(await hover.isVisible())await hover.hover();
  await expect(page.getByLabel('Pieza FDI',{exact:true})).toHaveValue('11');
  await page.setViewportSize({width:375,height:667});
  await page.getByRole('complementary',{name:'Editor de condición'}).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({path:path.join(out,'slice6-selected-375.png')});
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Asistente',exact:true}).click();
  await expect(page.getByLabel('Nota de condición')).toHaveValue('Borrador sintético intacto');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.join(out,'slice6-context-1440.png'),fullPage:true});
  await page.getByRole('button',{name:'Cerrar asistente'}).click();
  await page.getByRole('button',{name:'Temporal',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Condición sin guardar'})).toBeVisible();
  await page.getByRole('button',{name:'Descartar condición'}).click();
  await expect(page.getByRole('img',{name:/Odontograma temporal/})).toBeVisible();
  await expect(page.getByLabel('Nota de condición')).toBeHidden();
  await page.screenshot({path:path.join(out,'slice6-primary-1440.png'),fullPage:true});
  await page.goto(`/patients/${patientId}?tab=clinical&condition=${caries}`);
  await expect(page.getByRole('article',{name:'Pieza 36 · Caries · Activa'})).toBeFocused();
});


test('slice6 empty, loading, read failure and recovery are distinct',async({page})=>{
  test.skip(process.env.E2E_BASE_URL!=='http://localhost:8001','Isolated E2E only');
  const patientId=await syntheticPatient(page);
  const out=path.resolve('../../.playwright-cli');fs.mkdirSync(out,{recursive:true});
  let release:(()=>void)|undefined;
  await page.route(`**/api/patients/${patientId}/conditions?*`,async route=>{
    await new Promise<void>(resolve=>{release=resolve;});
    await route.continue();
  },{times:1});
  await page.goto(`/patients/${patientId}?tab=clinical`);
  await expect(page.getByText('Cargando condiciones…')).toBeVisible();
  await page.getByRole('heading',{name:'Odontograma FDI'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'slice6-loading-1440.png')});
  release?.();
  await expect(page.getByText('Sin condiciones en esta dentición y estado.')).toBeVisible();
  await page.screenshot({path:path.join(out,'slice6-empty-1440.png')});
  await page.route(`**/api/patients/${patientId}/conditions?*`,route=>route.abort(),{times:1});
  await page.reload();
  await expect(page.getByText(/Los datos mostrados pueden estar incompletos/)).toBeVisible();
  await expect(page.getByText('Sin condiciones en esta dentición y estado.')).toBeHidden();
  await page.getByRole('heading',{name:'Odontograma FDI'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'slice6-error-1440.png')});
  await page.getByRole('button',{name:'Reintentar condiciones'}).click();
  await expect(page.getByText('Sin condiciones en esta dentición y estado.')).toBeVisible();
});
