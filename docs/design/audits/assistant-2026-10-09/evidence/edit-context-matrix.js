async page => {
 page.setDefaultTimeout(4000);const root='docs/design/audits/assistant-2026-10-09/evidence/';const out=[];
 const control=patch=>page.evaluate(async patch=>(await(await fetch('/api/audit-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)})).json()),patch);
 const a=await control({});a.state.actions=[];a.state.pending_action=null;a.state.artifacts[0].status='draft';await control({state:a.state});await page.reload();await page.getByRole('button',{name:'Editar Hallazgos',exact:true}).waitFor();
 await page.getByRole('button',{name:'Editar Hallazgos',exact:true}).click();
 const input=page.locator('[data-artifact-id] textarea').first();await input.fill('Corrección clínica sintética SIN APLICAR');await page.screenshot({path:root+'field-edit-before-navigation.png'});
 await page.getByRole('link',{name:'Ver pendientes',exact:true}).click();const dialogs=await page.getByRole('alertdialog').count();await page.getByRole('button',{name:'Auditoría sintética',exact:true}).click();await page.getByRole('article',{name:'Evolución clínica',exact:true}).waitFor();
 out.push({id:'A20-inline-edit',dialogs,editPresent:await page.locator('textarea').evaluateAll(es=>es.some(e=>e.value.includes('SIN APLICAR'))),text:await page.getByRole('article',{name:'Evolución clínica',exact:true}).innerText()});await page.screenshot({path:root+'field-edit-after-navigation.png'});
 await page.getByRole('button',{name:'Quitar paciente activo'}).click();await page.getByLabel('Consulta al asistente',{exact:true}).waitFor();out.push({id:'A08-artifact-identity',text:await page.getByRole('article',{name:'Evolución clínica',exact:true}).innerText()});await page.screenshot({path:root+'draft-without-patient.png'});
 await page.getByLabel('Consulta al asistente',{exact:true}).fill('Texto extenso. '.repeat(100));await page.getByLabel('Consulta al asistente',{exact:true}).press('Shift+Enter');out.push({id:'composer-growth',input:await page.getByLabel('Consulta al asistente',{exact:true}).evaluate(e=>({height:e.getBoundingClientRect().height,scrollHeight:e.scrollHeight,endsNewline:e.value.endsWith('\n')}))});
 // Clear unsent text before later reload; do not dispatch any clinical turn.
 await page.getByLabel('Consulta al asistente',{exact:true}).fill('');return out;
}
