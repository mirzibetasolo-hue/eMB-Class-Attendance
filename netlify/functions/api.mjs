import { getDatabase } from '@netlify/database';
import { randomBytes, randomUUID, pbkdf2Sync, createHash, timingSafeEqual } from 'node:crypto';

const db=getDatabase();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const fail=(error,status=400)=>json({error},status);
const id=()=>randomUUID(), now=()=>Date.now();
const clean=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const hash=v=>{const salt=randomBytes(16).toString('hex');return `${salt}:${pbkdf2Sync(v,salt,150000,32,'sha256').toString('hex')}`};
const verify=(v,s)=>{if(typeof s!=='string')return false;const [salt,h]=s.split(':');if(!salt||!h||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(h))return false;return timingSafeEqual(Buffer.from(pbkdf2Sync(v,salt,150000,32,'sha256')),Buffer.from(h,'hex'))};
const digest=v=>createHash('sha256').update(v).digest('hex');
const cookie=(req)=>req.headers.get('cookie')?.match(/(?:^|;\s*)attendance_session=([^;]+)/)?.[1]||'';
async function actor(req){const token=cookie(req);if(!token)return null;const rows=await db.sql`SELECT u.id,u.name,u.username,u.role FROM auth_sessions a JOIN users u ON u.id=a.user_id WHERE a.token_hash=${digest(token)} AND a.expires_at>${now()} LIMIT 1`;return rows[0]||null}
async function sessionCookie(userId){const token=randomBytes(32).toString('hex');await db.sql`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(${id()},${userId},${digest(token)},${now()+7*86400000})`;return `attendance_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`}
const input=async req=>{try{return await req.json()}catch{return null}};
function authorized(req){const origin=req.headers.get('origin');return (!origin||origin===new URL(req.url).origin)&&req.headers.get('sec-fetch-site')!=='cross-site'}
const first=rows=>rows[0]||null;
const number=v=>Number(v);
async function allowedSubject(a,subjectId){if(!a||a.role==='student')return null;const r=await db.sql`SELECT * FROM subjects WHERE id=${subjectId} AND (${a.role==='admin'} OR teacher_id=${a.id}) LIMIT 1`;return first(r)}

export default async function handler(req){
 try{
  const url=new URL(req.url),route=url.searchParams.get('path')||url.pathname.split('/api/')[1]||'';
  const method=req.method;
  if(!['GET','HEAD'].includes(method)&&!authorized(req))return fail('Invalid origin',403);
  const a=await actor(req);
  if(route==='auth'){
   if(method==='GET'){const count=first(await db.sql`SELECT count(*)::int AS n FROM users`);return json({user:a,setup:!count?.n})}
   if(method==='DELETE'){const token=cookie(req);if(token)await db.sql`DELETE FROM auth_sessions WHERE token_hash=${digest(token)}`;return json({ok:true},200,{'set-cookie':'attendance_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'})}
   if(method==='POST'){
    const p=await input(req);if(!p)return fail('Invalid request');const username=clean(p.username,100).toLowerCase(),password=clean(p.password,200);
    if(!username||password.length<10)return fail('Enter a username and a password of at least 10 characters');
    if(p.action==='setup'){const name=clean(p.name,100);if(!name)return fail('Enter your name');const count=first(await db.sql`SELECT count(*)::int AS n FROM users`);if(count?.n)return fail('Setup is complete',403);
     const uid=id();await db.sql`INSERT INTO users(id,username,name,role,password_hash,created_at) VALUES(${uid},${username},${name},'admin',${hash(password)},${now()})`;return json({ok:true},200,{'set-cookie':await sessionCookie(uid)})}
    if(p.action==='login'){const user=first(await db.sql`SELECT id,password_hash FROM users WHERE username=${username} LIMIT 1`);if(!user||!verify(password,user.password_hash))return fail('Invalid username or password',401);return json({ok:true},200,{'set-cookie':await sessionCookie(user.id)})}
    return fail('Unknown action')
   }
  }
  if(!a)return fail('Sign in required',401);
  if(route==='data'&&method==='GET'){
   let subjects;
   if(a.role==='admin')subjects=await db.sql`SELECT id,code,description,semester,teacher_id AS "teacherId",created_at AS "createdAt" FROM subjects ORDER BY created_at DESC`;
   else if(a.role==='teacher')subjects=await db.sql`SELECT id,code,description,semester,teacher_id AS "teacherId",created_at AS "createdAt" FROM subjects WHERE teacher_id=${a.id} ORDER BY created_at DESC`;
   else subjects=await db.sql`SELECT s.id,s.code,s.description,s.semester,s.teacher_id AS "teacherId",s.created_at AS "createdAt" FROM subjects s JOIN enrollments e ON e.subject_id=s.id WHERE e.student_id=${a.id} ORDER BY s.created_at DESC`;
   const ids=subjects.map(x=>x.id);if(!ids.length)return json({user:a,subjects:[],sessions:[],rosters:[],records:[]});
   const roster=await db.sql`SELECT e.subject_id AS "subjectId",u.id AS "studentId",u.name,u.username,e.position FROM enrollments e JOIN users u ON e.student_id=u.id WHERE e.subject_id=ANY(${ids}::text[]) ORDER BY e.position`;
   const sessions=await db.sql`SELECT id,subject_id AS "subjectId",starts_at AS "startsAt",ends_at AS "endsAt",created_at AS "createdAt" FROM class_sessions WHERE subject_id=ANY(${ids}::text[]) ORDER BY starts_at DESC`;
   let records=[];if(sessions.length){const sessionIds=sessions.map(x=>x.id);records=await db.sql`SELECT id,session_id AS "sessionId",student_id AS "studentId",status,score,checked_at AS "checkedAt",recorded_at AS "recordedAt",source FROM attendance WHERE session_id=ANY(${sessionIds}::text[])`}
   const n=x=>({...x,startsAt:number(x.startsAt),endsAt:number(x.endsAt),createdAt:number(x.createdAt)});
   return json({user:a,subjects,sessions:sessions.map(n),rosters:a.role==='student'?roster.filter(r=>r.studentId===a.id):roster,records:(a.role==='student'?records.filter(r=>r.studentId===a.id):records).map(r=>({...r,checkedAt:r.checkedAt===null?null:number(r.checkedAt),recordedAt:number(r.recordedAt)}))})
  }
  if(method!=='POST')return fail('Not found',404);
  const p=await input(req);if(!p)return fail('Invalid request');
  if(route==='users'){if(a.role!=='admin')return fail('Administrator access required',403);const username=clean(p.username,100).toLowerCase(),name=clean(p.name,100),password=clean(p.password,200),role=p.role==='admin'?'admin':'teacher';if(!username||!name||password.length<10)return fail('Name, username and a password of at least 10 characters are required');await db.sql`INSERT INTO users(id,username,name,role,password_hash,created_at) VALUES(${id()},${username},${name},${role},${hash(password)},${now()})`;return json({ok:true})}
  if(route==='subjects'){if(a.role==='student')return fail('Teacher access required',403);const code=clean(p.code,30).toUpperCase(),description=clean(p.description,200),semester=clean(p.semester,80);if(!code||!description||!semester)return fail('Code, description and semester are required');const sid=id();await db.sql`INSERT INTO subjects(id,code,description,semester,teacher_id,created_at) VALUES(${sid},${code},${description},${semester},${a.id},${now()})`;return json({id:sid})}
  if(route==='import'){
   const subjectId=clean(p.subjectId,80),subject=await allowedSubject(a,subjectId);if(!subject)return fail('Subject not found',404);
   const rows=Array.isArray(p.rows)?p.rows:[];if(!rows.length||rows.length>300)return fail('Import 1 to 300 students at a time');
   const start=Number(first(await db.sql`SELECT count(*)::int AS n FROM enrollments WHERE subject_id=${subjectId}`)?.n||0),imported=[];
   for(let i=0;i<rows.length;i++){const studentId=clean(rows[i]?.studentId,50),name=clean(rows[i]?.name,100);if(!studentId||!name)continue;const username=studentId.toLowerCase();let user=first(await db.sql`SELECT id,name,role FROM users WHERE username=${username}`),temporaryPassword;
    if(user&&user.role!=='student')continue;
    if(!user){temporaryPassword=randomBytes(12).toString('base64url');const uid=id();const created=await db.sql`INSERT INTO users(id,username,name,role,password_hash,created_at) VALUES(${uid},${username},${name},'student',${hash(temporaryPassword)},${now()}) ON CONFLICT(username) DO NOTHING RETURNING id,name,role`;user=first(created);if(!user)continue}
    const inserted=await db.sql`INSERT INTO enrollments(id,subject_id,student_id,position) VALUES(${id()},${subjectId},${user.id},${start+i}) ON CONFLICT(subject_id,student_id) DO NOTHING RETURNING id`;
    if(inserted.length)imported.push({studentId,name:user.name,username,...(temporaryPassword?{temporaryPassword}:{})})
   }return json({imported})
  }
  if(route==='sessions'){
   const subjectId=clean(p.subjectId,80),subject=await allowedSubject(a,subjectId);if(!subject)return fail('Subject not found',404);
   const startsAt=Number(p.startsAt),endsAt=Number(p.endsAt),code=clean(p.code,100);
   if(!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt||endsAt-startsAt>86400000||code.length<6)return fail('Set valid start/end times and a check-in password of at least 6 characters');
   const sid=id();await db.sql`INSERT INTO class_sessions(id,subject_id,starts_at,ends_at,code_hash,created_at) VALUES(${sid},${subjectId},${startsAt},${endsAt},${hash(code)},${now()})`;return json({id:sid})
  }
  if(route==='checkin'){
   if(a.role!=='student')return fail('Student sign-in required',403);
   const sessionId=clean(p.sessionId,80),code=clean(p.code,100),session=first(await db.sql`SELECT * FROM class_sessions WHERE id=${sessionId}`);if(!session)return fail('Class session not found',404);
   const enrolled=first(await db.sql`SELECT id FROM enrollments WHERE subject_id=${session.subject_id} AND student_id=${a.id}`);if(!enrolled)return fail('You are not enrolled in this subject',403);
   if(!verify(code,session.code_hash))return fail('Incorrect check-in password',403);
   const t=now();if(t<number(session.starts_at)||t>=number(session.ends_at))return fail('Check-in is outside class time',409);
   const status=t<=number(session.starts_at)+1800000?'present':'late',score=status==='present'?100:50;
   const inserted=await db.sql`INSERT INTO attendance(id,session_id,student_id,status,score,checked_at,recorded_at,source) VALUES(${id()},${sessionId},${a.id},${status},${score},${t},${t},'online') ON CONFLICT(session_id,student_id) DO NOTHING RETURNING id`;
   if(!inserted.length)return fail('You have already checked in for this class',409);return json({status,score})
  }
  if(route==='attendance'){
   const sessionId=clean(p.sessionId,80),studentId=clean(p.studentId,80),status=p.status,reason=clean(p.reason,200)||'Teacher correction';if(!['present','late','escape','absent'].includes(status))return fail('Invalid status');
   const session=first(await db.sql`SELECT subject_id FROM class_sessions WHERE id=${sessionId}`);if(!session)return fail('Session not found',404);
   if(!await allowedSubject(a,session.subject_id))return fail('Access denied',403);
   const enrolled=first(await db.sql`SELECT id FROM enrollments WHERE subject_id=${session.subject_id} AND student_id=${studentId}`);if(!enrolled)return fail('Student not enrolled',404);
   const score=status==='present'?100:status==='absent'?0:50;
   const prev=first(await db.sql`SELECT id,status,score FROM attendance WHERE session_id=${sessionId} AND student_id=${studentId}`);
   if(prev){await db.sql`UPDATE attendance SET status=${status},score=${score},source='teacher' WHERE id=${prev.id}`;await db.sql`INSERT INTO audit(id,attendance_id,actor_id,previous,next,reason,at) VALUES(${id()},${prev.id},${a.id},${JSON.stringify({status:prev.status,score:prev.score})},${JSON.stringify({status,score})},${reason},${now()})`}
   else{const rid=id();await db.sql`INSERT INTO attendance(id,session_id,student_id,status,score,checked_at,recorded_at,source) VALUES(${rid},${sessionId},${studentId},${status},${score},NULL,${now()},'teacher')`;await db.sql`INSERT INTO audit(id,attendance_id,actor_id,previous,next,reason,at) VALUES(${id()},${rid},${a.id},NULL,${JSON.stringify({status,score})},${reason},${now()})`}
   return json({ok:true})
  }
  return fail('Not found',404)
 }catch(e){if(e?.code==='23505')return fail('Already exists',409);console.error('Attendance API error',e);return fail('Service temporarily unavailable',503)}
}
export const config={path:'/api/*'};
