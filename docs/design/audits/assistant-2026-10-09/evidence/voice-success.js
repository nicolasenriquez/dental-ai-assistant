async page=>{
 page.setDefaultTimeout(4000);
 await page.route('**/api/transcriptions',async r=>{await page.waitForTimeout(900);await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'dictado sintético editable'})});});
 await page.evaluate(()=>{const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();window.__auditAudio={ctx,osc};navigator.mediaDevices.getUserMedia=async()=>dest.stream;window.MediaRecorder=class{state='inactive';mimeType='audio/webm';static isTypeSupported(){return true;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['synthetic'],{type:'audio/webm'})});this.onstop?.();}};});
 const c=page.getByLabel('Nota clínica',{exact:true});await c.fill('Nota previa ');await c.press('End');await page.getByRole('button',{name:'Iniciar dictado'}).click();await page.getByRole('button',{name:'Detener grabación',exact:true}).waitFor();const disabled=await page.getByRole('button',{name:'Cambiar paciente activo'}).isDisabled();await page.screenshot({path:'docs/design/audits/assistant-2026-10-09/evidence/voice-recording-mock.png'});
 await page.getByRole('button',{name:'Detener grabación',exact:true}).click();await c.fill('Nota previa editada ');await page.waitForTimeout(1100);await page.screenshot({path:'docs/design/audits/assistant-2026-10-09/evidence/voice-transcribed-mock.png'});
 const result={text:await c.inputValue(),patientDisabledWhileRecording:disabled,autoSend:await page.evaluate(()=>!!window.__auditStream),focus:await c.evaluate(e=>e===document.activeElement)};
 await c.fill('');await page.evaluate(()=>{window.__auditAudio.osc.stop();window.__auditAudio.ctx.close();});return result;
}
