async page=>{
 const base='docs/design/audits/assistant-2026-10-09/evidence/build-parity/assets/';
 await page.route('**/assets/**',async r=>{const name=r.request().url().split('/').pop();const mapped=name==='index-hMjYLKeb.js'?'index-CNNUBSZj.js':name;if(['index-CNNUBSZj.js','index-C3Y2UvuD.js','index-BzakEpcP.css'].includes(mapped))await r.fulfill({path:base+mapped,contentType:mapped.endsWith('.css')?'text/css':'application/javascript'});else await r.abort();});
 const a=await page.evaluate(async()=>await(await fetch('/api/audit-control')).json());a.state.actions=[];a.state.pending_action=null;a.state.active_patient=a.patient;a.state.artifacts[0].status='draft';await page.evaluate(async state=>{await fetch('/api/audit-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})});},a.state);
 page.once('dialog',d=>d.accept());await page.goto('http://localhost:8000/a/'+a.t);await page.getByRole('button',{name:'Editar Hallazgos',exact:true}).waitFor();
 return {mode:'checkout compiled JS intercepted in browser; runtime app unchanged',main:'index-CNNUBSZj.js',originalServed:'index-hMjYLKeb.js',css:'identical SHA-256',url:page.url()};
}
