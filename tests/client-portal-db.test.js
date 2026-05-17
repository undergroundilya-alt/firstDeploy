'use strict';
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function getFreePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
function form(body){return new URLSearchParams(body).toString();}
function cookie(res){const c=res.headers.get('set-cookie');assert.ok(c,'expected set-cookie');return c.split(';')[0];}
function csrf(html){const m=html.match(/name="csrf" value="([^"]+)"/);assert.ok(m,'expected csrf token');return m[1];}
async function start(){
  const port=await getFreePort(); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'avp-client-')); const storage=path.join(tmp,'storage');
  const env={...process.env,NODE_ENV:'test',USE_HTTPS:'false',HOST:'127.0.0.1',PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,STORAGE_ROOT:storage,DATA_FILE:path.join(storage,'saas-state.json'),RUNTIME_FILE:path.join(storage,'runtime-sessions.json'),AUTH_DB_FILE:path.join(storage,'auth-accounts.json'),LEADS_FILE:path.join(storage,'leads.json'),BACKUP_DIR:path.join(storage,'backups'),EVENT_LOG_DIR:path.join(storage,'events'),AUDIT_LOG_DIR:path.join(storage,'audit'),ALERT_LOG_DIR:path.join(storage,'alerts'),DOCS_PRIVATE:'false',ENABLE_APP_DB:'false',ENABLE_POSTGRES_STORAGE:'false',CLUSTER_MODE:'false',API_LIMIT_MAX:'1000'};
  const child=childProcess.spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']}); let out='',err=''; child.stdout.on('data',c=>out+=c); child.stderr.on('data',c=>err+=c);
  const base=`http://127.0.0.1:${port}`; const started=Date.now();
  while(Date.now()-started<15000){ if(child.exitCode!==null) throw new Error(`server exited\n${out}\n${err}`); try{const r=await fetch(`${base}/health`); if(r.status===200) return {base,child,storage};}catch{} await sleep(100); }
  child.kill('SIGTERM'); throw new Error('server did not start');
}
async function stop(s){s.child.kill('SIGTERM'); await sleep(250); if(s.child.exitCode===null)s.child.kill('SIGKILL');}
(async()=>{
  console.log('\n==================================================================================\nClient portal, registration and DB fallback tests\n==================================================================================');
  const s=await start(); const base=s.base;
  try{
    let res=await fetch(`${base}/register`); assert.equal(res.status,200); let html=await res.text(); assert.match(html,/Create your account/); assert.match(html,/site-header topbar/); assert.match(html,/Continue with Google/); assert.match(html,/Full name/); assert.match(html,/Phone number/); assert.match(html,/marketingConsent/); assert.match(html,/termsAccepted/); assert.match(html,/Terms of Use/); assert.match(html,/countryCode/); assert.match(html,/Confirm password/); console.log('   ✓ register page renders with marketing checkbox, terms, full name, phone, confirm password and Google button');
    res=await fetch(`${base}/register`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({fullName:'<script>alert(1)</script>',countryCode:'+380',phone:'abc',companyName:'A',email:'bad',password:'short',confirmPassword:'different'}),redirect:'manual'}); assert.equal(res.status,400); html=await res.text(); assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/); assert.match(html,/Enter your full name|Company name|valid email|Password/i); console.log('   ✓ invalid/script-like registration input is rejected and escaped');
    res=await fetch(`${base}/register`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({fullName:'Client Owner',countryCode:'+380',phone:'671234567',companyName:'Client Media',email:'client@example.com',password:'StrongPass123',confirmPassword:'StrongPass123',termsAccepted:'on'}),redirect:'manual'}); assert.equal(res.status,302); assert.ok((res.headers.get('location') || '').startsWith('/account')); const cliCookie=cookie(res); console.log('   ✓ register form creates account and client session');
    res=await fetch(`${base}/account`,{headers:{cookie:cliCookie}}); assert.equal(res.status,200); html=await res.text(); assert.match(html,/Client account/); assert.match(html,/Create project/); const token=csrf(html); console.log('   ✓ account page opens with client cookie and CSRF');
    res=await fetch(`${base}/account/projects/create`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:cliCookie},body:form({csrf:token,projectName:'Static Banner Test',domain:'localhost',adContainerSelector:'[data-adproof-slot="left-sidebar"]',protectedSelector:'[data-adproof-content="protected"]'}),redirect:'manual'}); assert.equal(res.status,302); assert.ok((res.headers.get('location') || '').startsWith('/account')); console.log('   ✓ client can create a project linked to account');
    res=await fetch(`${base}/account`,{headers:{cookie:cliCookie}}); html=await res.text(); assert.match(html,/Static Banner Test/); const projectKey=html.match(/avp_pub_[A-Za-z0-9_-]+/)?.[0]; assert.ok(projectKey); console.log('   ✓ account page lists project and SDK public key');
    const authDb=JSON.parse(fs.readFileSync(path.join(s.storage,'auth-accounts.json'),'utf8')); assert.equal(authDb.accounts.length,1); assert.equal(authDb.accounts[0].fullName,'Client Owner'); assert.equal(authDb.accounts[0].phone,'+380671234567'); assert.ok(authDb.projectLinks.length>=1); console.log('   ✓ JSON DB fallback stores account profile, session and project link');
    res=await fetch(`${base}/register`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({fullName:'Client Owner',countryCode:'+380',phone:'671234567',companyName:'Client Media',email:'client@example.com',password:'StrongPass123',confirmPassword:'StrongPass123',termsAccepted:'on'}),redirect:'manual'}); assert.equal(res.status,409); html=await res.text(); assert.match(html,/already exists/i); console.log('   ✓ duplicate registration shows friendly account-exists message');
    res=await fetch(`${base}/logout`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:cliCookie},body:form({csrf:token}),redirect:'manual'}); assert.equal(res.status,302); assert.equal(res.headers.get('location'),'/login'); console.log('   ✓ client logout clears session');
    res=await fetch(`${base}/login`); assert.equal(res.status,200); html=await res.text(); assert.match(html,/<h2 class="title">Login<\/h2>/); console.log('   ✓ login page renders');
    res=await fetch(`${base}/login`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'client@example.com',password:'StrongPass123'}),redirect:'manual'}); assert.equal(res.status,302); assert.ok((res.headers.get('location') || '').startsWith('/account')); const loginCookie=cookie(res); console.log('   ✓ login form authenticates registered client');
    res=await fetch(`${base}/account`,{headers:{cookie:loginCookie}}); assert.equal(res.status,200); html=await res.text(); assert.doesNotMatch(html,/Cancel subscription/); assert.doesNotMatch(html,/account\/cancel-subscription/); console.log('   ✓ account page does not expose subscription cancellation UI on the website');
    console.log('\n✅ Client portal tests passed');
  } finally { await stop(s); }
})().catch(e=>{console.error(e);process.exit(1);});
