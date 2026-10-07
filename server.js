const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data.json');

const defaultData = {
  students: [{ id:'S1001', name:'Kowshik Sai Eduru', roll:'23CSE001', branch:'CSE', year:3, section:'A', mobile:'9999999999', password:'student123', approved:true, attendance:{DBMS:82, OS:76, SE:91, CN:88} }],
  faculty: [{ username:'faculty', password:'faculty123', name:'Demo Faculty', department:'CSE' }],
  hods: [{ username:'hod', password:'hod123', name:'Demo HOD', department:'CSE' }],
  admins: [{ username:'admin', password:'admin123', name:'System Admin' }],
  assignments: [
    {id:'A1001', title:'DBMS Normalization Assignment', subject:'DBMS', due:'2026-10-15', faculty:'Demo Faculty', description:'Prepare notes and examples for 1NF, 2NF and 3NF.'},
    {id:'A1002', title:'Operating Systems Record', subject:'OS', due:'2026-10-20', faculty:'Demo Faculty', description:'Complete Unit-3 record work.'}
  ],
  submissions: [],
  notes: [{id:'N1', subject:'DBMS', title:'Unit 3 Notes', type:'PDF'}, {id:'N2', subject:'OS', title:'Deadlocks Video', type:'VIDEO'}],
  otp: {}
};

function load(){
  if(!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify(defaultData,null,2));
  return JSON.parse(fs.readFileSync(DATA,'utf8'));
}
function save(d){fs.writeFileSync(DATA, JSON.stringify(d,null,2));}
let db=load();

function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj));}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})})}
function id(prefix){return prefix+crypto.randomBytes(4).toString('hex').toUpperCase()}
function token(){return crypto.randomBytes(24).toString('hex')}
function publicStudent(s){const {mobile,password,...rest}=s; return rest}

const sessions=new Map();
function auth(req){const h=req.headers.authorization||''; const t=h.startsWith('Bearer ')?h.slice(7):''; return sessions.get(t)||null;}

async function api(req,res){
  const url=new URL(req.url,`http://${req.headers.host}`); const p=url.pathname;
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});return res.end()}
  try{
    // Student LOGIN uses roll number + password. No OTP/CAPTCHA on login.
    if(req.method==='POST'&&p==='/api/student/login'){
      const b=await body(req); const s=db.students.find(x=>x.roll===String(b.roll));
      if(!s || s.password!==String(b.password)) return send(res,401,{ok:false,message:'Invalid roll number or password.'});
      if(!s.approved) return send(res,403,{ok:false,message:'In-charge approval is pending.'});
      const t=token(); sessions.set(t,{role:'student',id:s.id}); return send(res,200,{ok:true,token:t,user:publicStudent(s)});
    }
    // OTP is used ONLY during new student registration.
    if(req.method==='POST'&&p==='/api/registration/request-otp'){
      const b=await body(req); const mobile=String(b.mobile||'');
      if(!/^[0-9]{10}$/.test(mobile)) return send(res,400,{ok:false,message:'Enter a valid 10-digit mobile number.'});
      if(db.students.some(x=>x.mobile===mobile)) return send(res,409,{ok:false,message:'Mobile number is already registered.'});
      const code='123456'; db.otp['reg:'+mobile]={code,expires:Date.now()+5*60*1000}; save(db);
      return send(res,200,{ok:true,message:'Registration OTP sent (demo mode).',demoOtp:code});
    }
    if(req.method==='POST'&&p==='/api/students/register'){
      const b=await body(req); const mobile=String(b.mobile||''); const rec=db.otp['reg:'+mobile];
      if(!rec||rec.code!==String(b.otp)||rec.expires<Date.now()) return send(res,401,{ok:false,message:'Invalid or expired registration OTP.'});
      if(db.students.some(x=>x.roll===String(b.roll)||x.mobile===mobile))return send(res,409,{ok:false,message:'Roll number or mobile already registered.'});
      if(!b.password || String(b.password).length<6)return send(res,400,{ok:false,message:'Password must be at least 6 characters.'});
      const s={id:id('S'),name:b.name,roll:b.roll,branch:b.branch,year:Number(b.year),section:b.section,mobile, password:String(b.password),email:b.email||'',approved:false,attendance:{}};db.students.push(s);delete db.otp['reg:'+mobile];save(db);return send(res,201,{ok:true,message:'Registration submitted for in-charge approval.',student:publicStudent(s)});
    }
    if(req.method==='POST'&&p==='/api/staff/login'){
      const b=await body(req); const type=String(b.role||'faculty'); const list=type==='faculty'?db.faculty:type==='hod'?db.hods:db.admins;
      const u=list.find(x=>x.username===b.username&&x.password===b.password); if(!u) return send(res,401,{ok:false,message:'Invalid credentials.'});
      const t=token(); sessions.set(t,{role:type,username:u.username,name:u.name}); return send(res,200,{ok:true,token:t,user:{name:u.name,role:type,department:u.department}});
    }
    const me=auth(req);
    if(req.method==='GET'&&p==='/api/me'){
      if(!me) return send(res,401,{ok:false});
      if(me.role==='student'){const s=db.students.find(x=>x.id===me.id); return send(res,200,{ok:true,user:publicStudent(s),role:me.role});}
      return send(res,200,{ok:true,user:me,role:me.role});
    }
    if(req.method==='GET'&&p==='/api/dashboard'){
      if(!me) return send(res,401,{ok:false});
      if(me.role==='student'){
        const s=db.students.find(x=>x.id===me.id); const subs=db.submissions.filter(x=>x.studentId===s.id);
        return send(res,200,{ok:true,attendance:s.attendance,assignments:db.assignments,submissions:subs,notes:db.notes});
      }
      return send(res,200,{ok:true,students:db.students.map(publicStudent),assignments:db.assignments,submissions:db.submissions});
    }
    if(req.method==='POST'&&p==='/api/assignments'){
      if(!me||!['faculty','hod','admin'].includes(me.role)) return send(res,403,{ok:false,message:'Staff access required.'});
      const b=await body(req); const a={id:id('A'),title:b.title,subject:b.subject,due:b.due,faculty:me.name||'Admin',description:b.description||''}; db.assignments.push(a);save(db);return send(res,201,{ok:true,assignment:a});
    }
    if(req.method==='POST'&&p==='/api/submissions'){
      if(!me||me.role!=='student') return send(res,403,{ok:false,message:'Student access required.'});
      const b=await body(req); const a=db.assignments.find(x=>x.id===b.assignmentId); if(!a)return send(res,404,{ok:false,message:'Assignment not found.'});
      const sub={id:id('SUB'),assignmentId:a.id,studentId:me.id,fileName:b.fileName||'submission.pdf',submittedAt:new Date().toISOString(),status:new Date().toISOString().slice(0,10)>a.due?'Late':'Submitted'};
      db.submissions=db.submissions.filter(x=>!(x.assignmentId===a.id&&x.studentId===me.id));db.submissions.push(sub);save(db);return send(res,201,{ok:true,submission:sub});
    }
    if(req.method==='POST'&&p==='/api/integration/attendance'){
      if(!me||!['admin','hod'].includes(me.role)) return send(res,403,{ok:false,message:'Only HOD/Admin can sync attendance.'});
      const b=await body(req); const s=db.students.find(x=>x.id===b.studentId||x.roll===b.roll); if(!s)return send(res,404,{ok:false,message:'Student not found.'});
      s.attendance=Object.assign(s.attendance,b.attendance||{});save(db);return send(res,200,{ok:true,message:'Attendance synchronized.',student:publicStudent(s)});
    }
    if(req.method==='POST'&&p==='/api/students/approve'){
      if(!me||!['admin','hod'].includes(me.role))return send(res,403,{ok:false}); const b=await body(req);const s=db.students.find(x=>x.id===b.studentId);if(!s)return send(res,404,{ok:false});s.approved=true;save(db);return send(res,200,{ok:true,student:publicStudent(s)});
    }
    send(res,404,{ok:false,message:'Not found'});
  }catch(e){send(res,500,{ok:false,message:e.message})}
}

const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')) return api(req,res);
  let file=req.url==='/'?'/index.html':req.url; file=path.normalize(file).replace(/^\.\.(\/|\\)/,''); const fp=path.join(ROOT,'public',file);
  if(!fp.startsWith(path.join(ROOT,'public')))return send(res,403,{message:'Forbidden'});
  fs.readFile(fp,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}const ext=path.extname(fp);const ct=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream';res.writeHead(200,{'Content-Type':ct});res.end(data)})
});
server.listen(PORT,()=>console.log(`EduFlow running at http://localhost:${PORT}`));
