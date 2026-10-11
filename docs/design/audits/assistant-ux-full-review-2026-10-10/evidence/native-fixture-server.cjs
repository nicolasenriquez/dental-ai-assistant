// Audit-only HTTP fixture adapter. No DB, provider, browser automation or API proxy.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const REPO = path.resolve(__dirname, '../../../../..');
const original = path.join(REPO, 'openspec/changes/harden-clinical-workspace-continuity/evidence/integrated');
const dist = path.join(REPO, 'app/frontend/dist');
const input = fs.readFileSync(path.join(original, 'integrated-scenarios.cjs'), 'utf8');
const source = input.slice(input.indexOf("const U = "), input.indexOf('// ── Synthetic SSE streams'));
const context = vm.createContext({ require, fs, path, crypto, OUT: original, REPO, setTimeout, URL });
vm.runInContext(source + '\nglobalThis.audit = {installApi, resetWorld, requestLog, blocked};', context);
let handler;
context.audit.installApi({ route: async (_pattern, fn) => { handler = fn; } });
let scenario = '';
const config = path.join(__dirname, 'fixture-scenario.json');
const log = path.join(__dirname, 'fixture-request-log.json');
const requests = [];
function configure() {
  const next = JSON.parse(fs.readFileSync(config, 'utf8')).scenario;
  if (next === scenario) return;
  scenario = next;
  context.audit.resetWorld();
  vm.runInContext(`
    if (${JSON.stringify(next)} === 'entry') world.activePatientA = null;
    if (['artifact','approval','failed','saved'].includes(${JSON.stringify(next)})) {
      world.artifactsA = [artifact(${JSON.stringify(next === 'approval' ? 'pending' : next === 'failed' ? 'failed' : next === 'saved' ? 'approved' : 'draft')})];
      world.actionsA = ${JSON.stringify(next === 'artifact')} ? [] : [action(${JSON.stringify(next === 'approval' ? 'pending' : next === 'saved' ? 'approved' : 'failed')}, {expires_at:'2026-10-20T23:00:00Z'})];
    }
    if (${JSON.stringify(next)} === 'save-failure') { world.artifactsA=[artifact('pending')]; world.actionsA=[action('pending',{expires_at:'2026-10-20T23:00:00Z'})]; world.resolveMode='failed'; }
    if (${JSON.stringify(next)} === 'error') world.loadFail = true;
    if (${JSON.stringify(next)} === 'pending') world.pendingWork = [
      {id:'pending-1',kind:'approval_required',patient:{...ANA,display_name:'Ana Prueba sintética'},updated_at:'2026-10-10T12:00:00Z',summary:'Control sintético pendiente de revisión.',action:{kind:'review_approval',thread_id:A,action_id:ACTION_A}},
      {id:'pending-2',kind:'recoverable_draft',patient:{...BRUNO,display_name:'Bruno Ríos'},updated_at:'2026-10-10T11:00:00Z',summary:'Nota sintética recuperable.',action:{kind:'continue_draft',thread_id:B,artifact_id:'artifact-2'}},
      {id:'pending-3',kind:'drive_export_failed',patient:{...ANA,display_name:'Ana Prueba sintética'},updated_at:'2026-10-10T10:00:00Z',summary:'Copia sintética pendiente.',action:{kind:'retry_drive_export',evolution_id:'45454545-4545-4454-8454-454545454545'}}
    ];
  `, context);
}
const mime = {'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:5311');
  const chunks=[]; for await (const chunk of req) chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString();
  configure();
  if (url.pathname.startsWith('/api/')) {
    requests.push({scenario,path:url.pathname,method:req.method});
    fs.writeFileSync(log, JSON.stringify(requests,null,2));
    if (/\/clinical\/evolutions\/[^/]+\/drive-export\/retry$/.test(url.pathname)) {
      res.writeHead(200,{'Content-Type':'application/json'});res.end('{"status":"pending"}');return;
    }
    // Known empty collections and evolution detail, all synthetic.
    if (/google-drive\/(patient-documents|evolution-journals)(\/|$)/.test(url.pathname) && !url.pathname.endsWith('/preferences')) {
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({files:[],journals:[],items:[],next_page_token:null,next_cursor:null})); return;
    }
    if (/\/patients\/[^/]+\/overview$/.test(url.pathname)) {
      res.writeHead(503,{'Content-Type':'application/json'}); res.end('{"detail":"Synthetic unavailable overview"}');return;
    }
    if (/\/turns$/.test(url.pathname) && req.method === 'POST') {
      const payload=JSON.parse(raw); const tid=url.pathname.split('/')[3];
      vm.runInContext(`world.turns[${JSON.stringify(tid)}]={active:true};`,context);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      res.write(`event: turn.started\ndata: ${JSON.stringify({schema_version:1,sequence:1,event_id:'audit-start',thread_id:tid,turn_id:payload.turn_id,item_id:'audit-turn',item_type:'turn.started',data:{user_content:payload.content || payload.note || 'Consulta sintética',created_at:'2026-10-10T12:00:00Z'}})}\n\n`);
      const timer=setTimeout(()=>{res.end('data: [DONE]\n\n');},120000); res.on('close',()=>clearTimeout(timer)); return;
    }
    await handler({request:()=>({url:()=>url.href,method:()=>req.method,postDataJSON:()=>raw ? JSON.parse(raw) : {}}),fulfill:async ({status,contentType,body})=>{res.writeHead(status,{'Content-Type':contentType});res.end(body);}}); return;
  }
  const target=path.resolve(dist,'.'+decodeURIComponent(url.pathname));
  if (!target.startsWith(dist+path.sep) && target!==dist) {res.writeHead(403);res.end();return;}
  const file=fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(dist,'index.html');
  let data=fs.readFileSync(file);
  if (file.endsWith('index.html')) data=Buffer.from(data.toString().replace(/<script[^>]*src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*href="https:[^"]*"[^>]*>/g,''));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'"});res.end(data);
});
server.listen(5311,'127.0.0.1',()=>console.log('Audit fixtures http://localhost:5311; stop with Ctrl+C.'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
