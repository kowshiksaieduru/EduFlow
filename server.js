const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data.json');
const UPLOADS = path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const defaultData = {
  students: [{ id:'S1001', name:'Kowshik Sai Eduru', roll:'23CSE001', branch:'CSE', year:3, section:'A', mobile:'9999999999', email:'kowshik@example.com', password:'student123', approved:true, attendance:{DBMS:82,OS:76,SE:91,CN:88} }],
  faculty: [{ username:'faculty', password:'faculty123', name:'Demo Faculty', department:'CSE' }],
  hods: [{ username:'hod', password:'hod123', name:'Demo HOD', department:'CSE' }],
  admins: [{ username:'admin', password:'admin123', name:'System Admin' }],
  assignments: [
    {id:'A1001',title:'DBMS Normalization Assignment',subject:'DBMS',due:'2026-10-15',faculty:'Demo Faculty',description:'Prepare notes and examples for 1NF, 2NF and 3NF.'},
    {id:'A1002',title:'Operating Systems Record',subject:'OS',due:'2026-10-20',faculty:'Demo Faculty',description:'Complete Unit-3 record work.'}
  ],
  submissions: [],
  notes: [
    {id:'N1',subject:'DBMS',title:'Unit 3 Notes',type:'PDF',url:'#'},
    {id:'N2',subject:'OS',title:'Deadlocks Video',type:'VIDEO',url:'#'}
  ],
  notices: [
    {id:'NT1',title:'EduFlow portal launched',body:'Students can view assignments, attendance and notices from the dashboard.',date:'2026-10-07'}
  ],
  otp: {}
};

function load(){
  if(!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify(defaultData,null,2));
  return JSON.parse(fs.readFileSync(DATA,'utf8'));
}
function save(d){fs.writeFileSync(DATA, JSON.stringify(d,null,2));}
let db = load();

const sessions = new Map();
const captchas = new Map();
const rate = new Map();

function send(res,status,obj,extra={}){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS',
    ...extra
  });
  res.end(JSON.stringify(obj));
}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>12*1024*1024)req.destroy();});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(new Error('Invalid JSON body'))}});req.on('error',reject);});}
function id(prefix){return prefix+crypto.randomBytes(4).toString('hex').toUpperCase()}
function token(){return crypto.randomBytes(32).toString('hex')}
function publicStudent(s){if(!s)return null;const {mobile,password,...rest}=s;return rest}
function auth(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';return sessions.get(t)||null;}
function requireRole(me,roles){return me && roles.includes(me.role)}
function cleanName(s){return String(s||'').replace(/[<>]/g,'').trim()}
function nowDate(){return new Date().toISOString().slice(0,10)}

function makeCaptcha(){
  const a=crypto.randomInt(2,10), b=crypto.randomInt(2,10);
  const cid=crypto.randomBytes(10).toString('hex');
  captchas.set(cid,{answer:String(a+b),expires:Date.now()+3*60*1000});
  return {captchaId:cid,question:`${a} + ${b} = ?`};
}
function validCaptcha(cid,answer){
  const c=captchas.get(String(cid||''));
  if(!c || c.expires<Date.now()) return false;
  captchas.delete(String(cid));
  return c.answer===String(answer||'').trim();
}
function allowedLogin(key){
  const now=Date.now(), arr=(rate.get(key)||[]).filter(x=>now-x<10*60*1000);
  if(arr.length>=15){rate.set(key,arr);return false} arr.push(now);rate.set(key,arr);return true;
}

async function api(req,res){
  const url=new URL(req.url,`http://${req.headers.host}`); const p=url.pathname;
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});return res.end();}
  try{
    if(req.method==='GET'&&p==='/api/captcha') return send(res,200,{ok:true,...makeCaptcha()});
    if(req.method==='POST'&&p==='/api/student/login'){
      const b=await body(req); if(!allowedLogin('student:'+req.socket.remoteAddress))return send(res,429,{ok:false,message:'Too many login attempts. Try again later.'});
      const s=db.students.find(x=>x.roll===String(b.roll||'').trim());
      if(!s||s.password!==String(b.password||''))return send(res,401,{ok:false,message:'Invalid roll number or password.'});
      if(!s.approved)return send(res,403,{ok:false,message:'In-charge approval is pending.'});
      const t=token();sessions.set(t,{role:'student',id:s.id,created:Date.now()});
      return send(res,200,{ok:true,token:t,user:publicStudent(s)});
    }
    if(req.method==='POST'&&p==='/api/registration/request-otp'){
      const b=await body(req), mobile=String(b.mobile||'').trim();
      if(!/^[0-9]{10}$/.test(mobile))return send(res,400,{ok:false,message:'Enter a valid 10-digit mobile number.'});
      if(db.students.some(x=>x.mobile===mobile))return send(res,409,{ok:false,message:'Mobile number is already registered.'});
      const code=process.env.DEMO_OTP||'123456';db.otp['reg:'+mobile]={code,expires:Date.now()+5*60*1000};save(db);
      return send(res,200,{ok:true,message:'Registration OTP generated.',demoOtp:process.env.NODE_ENV==='production'?undefined:code});
    }
    if(req.method==='POST'&&p==='/api/students/register'){
      const b=await body(req),mobile=String(b.mobile||'').trim(),rec=db.otp['reg:'+mobile];
      if(!rec||rec.expires<Date.now()||rec.code!==String(b.otp||''))return send(res,401,{ok:false,message:'Invalid or expired registration OTP.'});
      const roll=String(b.roll||'').trim();
      if(db.students.some(x=>x.roll===roll||x.mobile===mobile))return send(res,409,{ok:false,message:'Roll number or mobile already registered.'});
      if(String(b.password||'').length<6)return send(res,400,{ok:false,message:'Password must be at least 6 characters.'});
      const s={id:id('S'),name:cleanName(b.name),roll,branch:cleanName(b.branch),year:Number(b.year)||1,section:cleanName(b.section),mobile,email:cleanName(b.email),password:String(b.password),approved:false,attendance:{}};
      db.students.push(s);delete db.otp['reg:'+mobile];save(db);return send(res,201,{ok:true,message:'Registration submitted for in-charge approval.',student:publicStudent(s)});
    }
    if(req.method==='POST'&&p==='/api/staff/login'){
      const b=await body(req); if(!validCaptcha(b.captchaId,b.captchaAnswer))return send(res,401,{ok:false,message:'CAPTCHA is incorrect or expired.'});
      const type=['faculty','hod','admin'].includes(String(b.role))?String(b.role):'faculty';
      if(!allowedLogin(type+':'+req.socket.remoteAddress))return send(res,429,{ok:false,message:'Too many login attempts. Try again later.'});
      const list=type==='faculty'?db.faculty:type==='hod'?db.hods:db.admins;
      const u=list.find(x=>x.username===String(b.username||'').trim()&&x.password===String(b.password||''));
      if(!u)return send(res,401,{ok:false,message:'Invalid credentials.'});
      const t=token();sessions.set(t,{role:type,username:u.username,name:u.name,department:u.department,created:Date.now()});
      return send(res,200,{ok:true,token:t,user:{name:u.name,role:type,department:u.department}});
    }
    if(req.method==='POST'&&p==='/api/logout'){
      const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';sessions.delete(t);return send(res,200,{ok:true});
    }
    const me=auth(req);
    if(req.method==='GET'&&p==='/api/me'){
      if(!me)return send(res,401,{ok:false});
      if(me.role==='student'){const s=db.students.find(x=>x.id===me.id);return send(res,200,{ok:true,user:publicStudent(s),role:me.role});}
      return send(res,200,{ok:true,user:{name:me.name,role:me.role,department:me.department},role:me.role});
    }
    if(req.method==='GET'&&p==='/api/dashboard'){
      if(!me)return send(res,401,{ok:false});
      if(me.role==='student'){
        const s=db.students.find(x=>x.id===me.id);const subs=db.submissions.filter(x=>x.studentId===s.id);
        return send(res,200,{ok:true,attendance:s.attendance,assignments:db.assignments,submissions:subs,notes:db.notes,notices:db.notices,profile:publicStudent(s)});
      }
      return send(res,200,{ok:true,students:db.students.map(publicStudent),assignments:db.assignments,submissions:db.submissions,notices:db.notices,notes:db.notes});
    }
    if(req.method==='POST'&&p==='/api/assignments'){
      if(!requireRole(me,['faculty','hod','admin']))return send(res,403,{ok:false,message:'Staff access required.'});
      const b=await body(req);if(!b.title||!b.subject||!b.due)return send(res,400,{ok:false,message:'Title, subject and due date are required.'});
      const a={id:id('A'),title:cleanName(b.title),subject:cleanName(b.subject),due:String(b.due),faculty:me.name||'Admin',description:cleanName(b.description),createdAt:new Date().toISOString()};db.assignments.unshift(a);save(db);return send(res,201,{ok:true,assignment:a});
    }
    if(req.method==='POST'&&p==='/api/submissions'){
      if(!me||me.role!=='student')return send(res,403,{ok:false,message:'Student access required.'});
      const b=await body(req),a=db.assignments.find(x=>x.id===b.assignmentId);if(!a)return send(res,404,{ok:false,message:'Assignment not found.'});
      let fileName=cleanName(b.fileName||'submission.txt').replace(/[^a-zA-Z0-9._-]/g,'_');let stored='';
      if(b.fileData){
        const raw=String(b.fileData).replace(/^data:[^;]+;base64,/,'');const buf=Buffer.from(raw,'base64');
        if(buf.length>8*1024*1024)return send(res,413,{ok:false,message:'File must be 8 MB or smaller.'});
        stored=id('F')+'_'+fileName;fs.writeFileSync(path.join(UPLOADS,stored),buf);
      }
      const late=nowDate()>a.due;const sub={id:id('SUB'),assignmentId:a.id,studentId:me.id,fileName,storedFile:stored,submittedAt:new Date().toISOString(),status:late?'Late':'Submitted'};
      db.submissions=db.submissions.filter(x=>!(x.assignmentId===a.id&&x.studentId===me.id));db.submissions.push(sub);save(db);return send(res,201,{ok:true,message:late?'Submitted after the due date.':'Assignment submitted successfully.',submission:sub});
    }
    if(req.method==='GET'&&p==='/api/submissions'){
      if(!requireRole(me,['faculty','hod','admin']))return send(res,403,{ok:false,message:'Staff access required.'});
      return send(res,200,{ok:true,submissions:db.submissions.map(s=>({...s,student:publicStudent(db.students.find(x=>x.id===s.studentId)),assignment:db.assignments.find(x=>x.id===s.assignmentId)}))});
    }
    if(req.method==='POST'&&p==='/api/integration/attendance'){
      if(!requireRole(me,['hod','admin']))return send(res,403,{ok:false,message:'Only HOD/Admin can sync attendance.'});
      const b=await body(req),s=db.students.find(x=>x.id===b.studentId||x.roll===String(b.roll||''));if(!s)return send(res,404,{ok:false,message:'Student not found.'});
      s.attendance=Object.assign({},s.attendance,b.attendance||{});save(db);return send(res,200,{ok:true,message:'Attendance synchronized.',student:publicStudent(s)});
    }
    if(req.method==='POST'&&p==='/api/students/approve'){
      if(!requireRole(me,['hod','admin']))return send(res,403,{ok:false,message:'Only HOD/Admin can approve students.'});
      const b=await body(req),s=db.students.find(x=>x.id===b.studentId);if(!s)return send(res,404,{ok:false,message:'Student not found.'});s.approved=true;save(db);return send(res,200,{ok:true,message:'Student approved.',student:publicStudent(s)});
    }
    if(req.method==='GET'&&p==='/api/class-schedule'){
      if(!requireRole(me,['faculty','hod','admin']))return send(res,403,{ok:false,message:'Staff access required.'});
      return send(res,200,{ok:true,schedules:db.classSchedules||[]});
    }
    if(req.method==='POST'&&p==='/api/class-schedule'){
      if(!requireRole(me,['faculty','hod','admin']))return send(res,403,{ok:false,message:'Staff access required.'});
      const b=await body(req); if(!b.day||!b.time||!b.subject||!b.section||!b.room)return send(res,400,{ok:false,message:'Day, time, subject, section and room are required.'});
      db.classSchedules=db.classSchedules||[];
      const item={id:id('CLS'),day:cleanName(b.day),time:cleanName(b.time),subject:cleanName(b.subject),section:cleanName(b.section),room:cleanName(b.room),faculty:me.name||me.username||'Staff',createdAt:new Date().toISOString()};
      db.classSchedules.push(item); save(db); return send(res,201,{ok:true,message:'Class arrangement saved.',schedule:item});
    }
    if(req.method==='POST'&&p==='/api/notices'){
      if(!requireRole(me,['faculty','hod','admin']))return send(res,403,{ok:false,message:'Staff access required.'});
      const b=await body(req);if(!b.title||!b.body)return send(res,400,{ok:false,message:'Title and notice are required.'});
      const n={id:id('NT'),title:cleanName(b.title),body:cleanName(b.body),date:nowDate(),author:me.name};db.notices.unshift(n);save(db);return send(res,201,{ok:true,notice:n});
    }
    send(res,404,{ok:false,message:'Not found'});
  }catch(e){console.error(e);send(res,500,{ok:false,message:'Server error.'});}
}

const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/'))return api(req,res);
  let requestPath=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);
  if(requestPath==='/')requestPath='/index.html';
  const fp=path.normalize(path.join(PUBLIC,requestPath));
  if(!fp.startsWith(PUBLIC+path.sep))return res.end('Forbidden');
  fs.readFile(fp,(err,data)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found')}const ext=path.extname(fp).toLowerCase();const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-store'});res.end(data);});
});
server.listen(PORT,()=>console.log(`EduFlow v5 running at http://localhost:${PORT}`));
