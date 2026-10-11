async page => {
  const patient = {id:'11111111-1111-4111-8111-111111111111', first_name:'Paciente sintética Alejandra', last_name:'Apellido compuesto de prueba extensa', rut_masked:'••••', birth_date:'1980-01-01',phone:null,email:null,last_evolution_at:'2026-10-10T15:00:00Z'};
  const stamp = '2026-10-10T15:00:00Z';
  const evolutions = Array.from({length:12},(_,i)=>({id:`evolution-${i}`,patient_id:patient.id,evolution_at:stamp,preview:`Registro sintético ${i+1}`,final_text:`Contenido sintético de evolución ${i+1}`,created_at:stamp}));
  const messages = [{id:'message-1',thread_id:'audit-thread',turn_id:'audit-turn',role:'assistant',content:'Estas son las evoluciones sintéticas consultadas.',created_at:stamp,clinical_result:{result_kind:'evolution_list',payload:{patient_id:patient.id,evolutions}}}];
  const thread = {id:'audit-thread',owner_user_id:'audit-owner',title:'Consulta sintética',active_patient:patient,pending_action_patient:null,active_turn_id:null,created_at:stamp,updated_at:stamp,messages,artifacts:[],pending_action:null,actions:[]};
  const threads = Array.from({length:25},(_,i)=>({id:i===0?'audit-thread':`audit-thread-${i}`,title:i<3?'Asistente clínico':`Consulta sintética larga ${i} para prueba de navegación`,active_patient_id:patient.id,active_turn_id:null,updated_at:stamp,preview:`Vista previa sintética ${i}`,approval_pending:false}));
  const log = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = {pathname:request.url().split('://')[1].split('/').slice(1).join('/').split('?')[0]};
    url.pathname = '/' + url.pathname;
    log.push({method:request.method(),path:url.pathname});
    let body;
    if(url.pathname==='/api/auth/me') body={id:'audit-owner',email:'audit@example.invalid',is_admin:false,is_member:true,professional_display_name:'Profesional sintético',messages_used_today:0,messages_remaining_today:25,rate_window_resets_at:null};
    else if(url.pathname==='/api/auth/config') body={mode:'local',google_client_id:null,drive_enabled:true,drive_auto_onboard:false};
    else if(url.pathname==='/api/patients') body=[patient,{...patient,id:'22222222-2222-4222-8222-222222222222',first_name:'Paciente sintético Bruno',last_name:'Prueba',birth_date:null,last_evolution_at:null}];
    else if(url.pathname==='/api/patients/search') body=[];
    else if(url.pathname===`/api/patients/${patient.id}`) body=patient;
    else if(url.pathname.endsWith('/evolutions')) body=evolutions;
    else if(url.pathname.startsWith('/api/evolutions/')) body=evolutions.find(e=>url.pathname.endsWith(e.id)) || evolutions[0];
    else if(url.pathname==='/api/clinical-threads' && request.method()==='GET') body=threads;
    else if(url.pathname==='/api/clinical-threads/acquire') body={thread,reused:true};
    else if(url.pathname.startsWith('/api/clinical-threads/') && request.method()==='GET') body={...thread,id:url.pathname.split('/')[3]};
    else if(url.pathname.includes('clinical-pending-work')) body={items:[],next_cursor:null,total:0};
    else if(url.pathname.includes('google-drive') || url.pathname.includes('/drive/')) body={connected:false,enabled:true,status:'disconnected',items:[],journals:[]};
    else if(url.pathname.includes('catalog')) body=[];
    else if(request.method()==='GET') body={items:[],next_cursor:null,total:0};
    else { await route.fulfill({status:409,json:{detail:'AUDIT_BLOCKED_MUTATION'}}); return; }
    await route.fulfill({status:200,json:body});
  });
  await page.exposeFunction('auditRequestLog', ()=>log);
  await page.goto('http://localhost:8000/a/audit-thread');
  await page.getByRole('region',{name:'Evoluciones consultadas'}).waitFor();
  return {isolation:'All /api/ requests fulfilled locally; unknown writes blocked; no cookies copied',requests:log};
}
