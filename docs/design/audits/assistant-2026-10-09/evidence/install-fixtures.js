async page => {
  await page.unroute('**/api/**');
  const t='11111111-1111-4111-8111-111111111111', p='22222222-2222-4222-8222-222222222222', u='55555555-5555-4555-8555-555555555555';
  const patient={id:p,first_name:'Ana',last_name:'Prueba sintética',rut_masked:'••.•••.•••-•',birth_date:'1990-01-01'};
  const base={id:t,owner_user_id:u,title:'Auditoría sintética',active_patient:null,pending_action_patient:null,active_turn_id:null,created_at:'2026-10-09T03:00:00Z',updated_at:'2026-10-09T03:00:00Z',messages:[],artifacts:[],pending_action:null,actions:[]};
  globalThis.audit={t,p,u,patient,state:base,requests:[],mode:'idle',draft:{context:'Control sintético',findings:'Hallazgo registrado en nota de prueba.',assessment:'',treatment:'Higiene indicada en nota de prueba.',follow_up:'Control en seis meses.'}};
  await page.route('**/api/**',async route=>{
    const req=route.request(), path=req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0], method=req.method();
    const a=globalThis.audit; a.requests.push({path,method});
    let status=200, body={};
    if(path==='/api/audit-control'){if(method==='POST')Object.assign(a,req.postDataJSON());body=a;}
    else if(path==='/api/auth/me') body={id:u,email:'audit@example.invalid',is_admin:false,messages_used_today:0,messages_remaining_today:25};
    else if(path==='/api/auth/config') body={mode:'google',google_client_id:'test.apps.googleusercontent.com',drive_enabled:true,drive_auto_onboard:false};
    else if(path==='/api/patients' || path==='/api/patients/search') body=[patient];
    else if(path==='/api/clinical-threads/acquire') body={thread:a.state,reused:true};
    else if(path==='/api/clinical-threads') body=method==='GET'?[{...a.state,active_patient_id:a.state.active_patient?.id??null,preview:null,approval_pending:!!a.state.pending_action}]:a.state;
    else if(path==='/api/clinical-pending-work') body={items:[],next_cursor:null};
    else if(path===`/api/clinical-threads/${t}/active-patient`){a.state={...a.state,active_patient:req.postDataJSON().patient_id?patient:null};body=a.state;}
    else if(path===`/api/clinical-threads/${t}`) {if(a.mode==='load-error'){status=503;body={detail:'Synthetic unavailable'};}else body=a.state;}
    else if(path.endsWith('/cancel')){a.state.active_turn_id=null;body={status:'cancelled'};await page.evaluate(()=>window.__auditStream?.close());}
    else if(path==='/api/google-drive/status') body={configured:true,status:'connected',workspace:{folder_name:'Auditoría sintética'}};
    else if(path==='/api/google-drive/sources') body={files:[{id:'source-synthetic',name:'Documento sintético.txt',mimeType:'text/plain',modifiedTime:'2026-10-09T03:00:00Z',version:'1',kind:'text',editable:true}],next_page_token:null};
    else if(path.includes('/sources/source-synthetic')) body={id:'source-synthetic',name:'Documento sintético.txt',mimeType:'text/plain',kind:'text',editable:true,version:'1',content:'Documento de prueba. Higiene oral y control periódico. Sin datos personales.'};
    else if(path==='/api/google-drive/evolution-journals/preferences') body={frequency:'weekly'};
    else if(path==='/api/google-drive/evolution-journals') body={journals:[]};
    else if(path.includes('/files')) body={files:[],next_page_token:null};
    else if(path.endsWith('/prepare-save')){const art=a.state.artifacts[0]; const action={id:'33333333-3333-4333-8333-333333333333',thread_id:t,turn_id:art.turn_id,artifact_id:art.id,patient_id:p,action_type:'save_evolution',proposal_payload:{evolution_id:'44444444-4444-4444-8444-444444444444',patient_id:p,evolution_at:art.evolution_at,raw_note:art.source_note,generated_text:'Propuesta sintética',final_text:'Hallazgo registrado en nota de prueba.'},proposal_hash:'a'.repeat(64),status:'pending',expires_at:'2026-10-09T23:00:00Z',created_at:'2026-10-09T03:01:00Z',resolved_at:null,result_resource_id:null,patient};a.state.actions=[action];a.state.pending_action=action;body=action;}
    else if(path.includes('/artifacts/')&&method==='PATCH'){Object.assign(a.state.artifacts[0],req.postDataJSON());body=a.state.artifacts[0];}
    else if(path.includes('/clinical-actions/')&&path.endsWith('/resolve')) {if(a.mode==='save-error'){status=503;body={detail:{code:'EVOLUTION_SAVE_FAILED'}};}else{const action=a.state.actions[0];action.status='approved';action.result_resource_id='44444444-4444-4444-8444-444444444444';action.drive_export={status:'failed',error_code:'DRIVE_EXPORT_FAILED'};a.state.pending_action=null;body=action;}}
    else if(path.includes('/clinical-actions/')&&path.endsWith('/edit')){a.state.actions[0].status='declined';a.state.pending_action=null;body={artifact_id:a.state.artifacts[0].id};}
    else {status=501;body={detail:'Audit blocked unconfigured endpoint'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.addInitScript(({t})=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const url=new URL(input instanceof Request?input.url:String(input),location.href);
      if(url.pathname!==`/api/clinical-threads/${t}/turns`||init?.method!=='POST')return original(input,init);
      const data=JSON.parse(init.body);let ctrl;
      const stream=new ReadableStream({start(c){ctrl=c;}});
      window.__auditStream={...data,aborted:false,push(frame){ctrl.enqueue(new TextEncoder().encode(frame));},close(){try{ctrl.close();}catch{}},fail(){ctrl.error(new Error('Synthetic transport failure'));}};
      init.signal?.addEventListener('abort',()=>{window.__auditStream.aborted=true;window.__auditStream.close();});
      return Promise.resolve(new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream'}}));
    };
  },{t});
  await page.goto(`http://localhost:8000/a/${t}`);
  return {fixture:'all API requests intercepted; turns browser-streamed; no clinical or Drive writes',url:page.url()};
}
