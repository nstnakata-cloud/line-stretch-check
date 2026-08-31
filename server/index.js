import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, setup, getMenu } from './db.js'
import { questions, classify, applicableQuestions } from './catalog.js'
import { validLineSignature, pushLine } from './line.js'

setup()
const app = express()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf } }))

const admin = (req, res, next) => process.env.ADMIN_TOKEN && req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}` ? res.status(401).json({ message: '管理者認証が必要です。' }) : next()
const safe = fn => async (req, res) => { try { await fn(req, res) } catch (e) { console.error(e); res.status(500).json({ message: 'うまく保存できませんでした。少し待ってもう一度お試しください。' }) } }

app.get('/api/config', (_req,res) => res.json({ liffId: process.env.LIFF_ID || '', questions }))
app.get('/api/health', (_req,res) => { try { const dbOk=db.prepare('SELECT 1 ok').get().ok===1;res.json({status:dbOk?'ok':'degraded',database:dbOk?'ok':'error',time:new Date().toISOString()}) } catch { res.status(503).json({status:'unavailable'}) } })
app.post('/api/assessments/start', safe((req,res) => {
  const lineId = String(req.body.lineUserId || `guest-${req.ip}`).slice(0,200)
  db.prepare('INSERT INTO users(line_user_id) VALUES(?) ON CONFLICT(line_user_id) DO UPDATE SET last_used_at=CURRENT_TIMESTAMP').run(lineId)
  const user = db.prepare('SELECT * FROM users WHERE line_user_id=?').get(lineId)
  if (req.body.consent) db.prepare('UPDATE users SET consent_at=COALESCE(consent_at,CURRENT_TIMESTAMP) WHERE id=?').run(user.id)
  if (!user.consent_at && !req.body.consent) return res.status(400).json({ message:'内容をご確認のうえ、同意してから始めてください。' })
  const draft = db.prepare("SELECT id FROM assessments WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1").get(user.id)
  const id = draft?.id || Number(db.prepare('INSERT INTO assessments(user_id) VALUES(?)').run(user.id).lastInsertRowid)
  const answers = Object.fromEntries(db.prepare('SELECT question_id,answer FROM assessment_answers WHERE assessment_id=?').all(id).map(x => [x.question_id,x.answer]))
  res.json({ assessmentId:id, answers })
}))
app.put('/api/assessments/:id/answer', safe((req,res) => {
  if (!req.body.questionId || !req.body.answer) return res.status(400).json({ message:'回答を選んでください。' })
  db.prepare('INSERT INTO assessment_answers VALUES(?,?,?) ON CONFLICT(assessment_id,question_id) DO UPDATE SET answer=excluded.answer').run(req.params.id,req.body.questionId,req.body.answer)
  res.json({ ok:true })
}))
app.post('/api/assessments/:id/complete', safe((req,res) => {
  const a = db.prepare('SELECT * FROM assessments WHERE id=?').get(req.params.id)
  if (!a) return res.status(404).json({ message:'チェックが見つかりません。' })
  if (a.status === 'completed') return res.json(resultFor(a.id))
  const answers = Object.fromEntries(db.prepare('SELECT question_id,answer FROM assessment_answers WHERE assessment_id=?').all(a.id).map(x=>[x.question_id,x.answer]))
  if (applicableQuestions(answers).some(q => !answers[q.id])) return res.status(400).json({ message:'未回答の質問があります。' })
  const outcome = classify(answers)
  let typeId = null
  if (!outcome.unsafe) typeId = db.prepare('SELECT id FROM stretch_types WHERE slug=? AND active=1').get(outcome.slug)?.id
  if (!outcome.unsafe && !typeId) return res.status(422).json({ message:'メニューを準備中です。時間をおいてもう一度お試しください。' })
  db.prepare("UPDATE assessments SET status=?,main_body_part=?,stretch_type_id=?,is_unsafe=?,excluded_reason=?,ruleset_version=1,question_version=1,completed_at=CURRENT_TIMESTAMP WHERE id=?").run(outcome.unsafe?'excluded':'completed',answers.body_part,typeId,outcome.unsafe?1:0,outcome.reason||null,a.id)
  db.prepare("INSERT OR IGNORE INTO activity_logs(user_id,assessment_id,event_type,event_key) VALUES(?,?,'assessment_completed',?)").run(a.user_id,a.id,`complete-${a.id}`)
  db.prepare("UPDATE followup_outbox SET status='canceled',canceled_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'").run(a.user_id)
  if (!outcome.unsafe) [['day1','+1 day'],['day3','+3 day'],['day7','+7 day']].forEach(([kind,delay]) => db.prepare("INSERT OR IGNORE INTO followup_outbox(user_id,assessment_id,kind,due_at,scheduled_at,idempotency_key) VALUES(?,?,?,datetime('now',?),datetime('now',?),?)").run(a.user_id,a.id,kind,delay,delay,`${a.id}-${kind}`))
  res.json(resultFor(a.id))
}))

function resultFor(id) {
  const assessment = db.prepare('SELECT a.*,t.name type_name,t.description FROM assessments a LEFT JOIN stretch_types t ON t.id=a.stretch_type_id WHERE a.id=?').get(id)
  return { assessment, menu: assessment?.stretch_type_id ? getMenu(assessment.stretch_type_id) : [] }
}
app.get('/api/assessments/:id', safe((req,res)=>res.json(resultFor(req.params.id))))
app.post('/api/assessments/:id/link-line', safe((req,res)=>{
  const lineUserId=String(req.body.lineUserId||'').slice(0,200);if(!lineUserId)return res.status(400).json({message:'LINEとの接続を確認できませんでした。'})
  const assessment=db.prepare("SELECT *,datetime(started_at,'+48 hours') deadline FROM assessments WHERE id=?").get(req.params.id);if(!assessment)return res.status(404).json({message:'チェックが見つかりません。'});if(new Date(assessment.deadline+'Z')<new Date())return res.status(410).json({message:'紐付け期限を過ぎています。もう一度チェックしてください。'})
  db.prepare('INSERT OR IGNORE INTO users(line_user_id,consent_at) VALUES(?,CURRENT_TIMESTAMP)').run(lineUserId);const target=db.prepare('SELECT * FROM users WHERE line_user_id=?').get(lineUserId)
  db.prepare('UPDATE assessments SET user_id=? WHERE id=?').run(target.id,assessment.id);db.prepare('UPDATE activity_logs SET user_id=? WHERE assessment_id=?').run(target.id,assessment.id);db.prepare('UPDATE followup_outbox SET user_id=? WHERE assessment_id=?').run(target.id,assessment.id);res.json({ok:true})
}))
app.post('/api/activity', safe((req,res) => {
  const a=db.prepare('SELECT * FROM assessments WHERE id=?').get(req.body.assessmentId); if(!a)return res.status(404).json({message:'チェックが見つかりません。'})
  const key=req.body.eventKey||`${req.body.eventType}-${a.id}-${req.body.stretchId||'all'}-${new Date().toISOString().slice(0,10)}`
  db.prepare('INSERT OR IGNORE INTO activity_logs(user_id,assessment_id,stretch_id,event_type,event_key) VALUES(?,?,?,?,?)').run(a.user_id,a.id,req.body.stretchId||null,req.body.eventType,key)
  res.json({ok:true})
}))
app.post('/api/assessments/:id/seven-day', safe((req,res)=>{
  const allowed=['かなり楽','少し楽','変わらない','悪化した']; if(!allowed.includes(req.body.result))return res.status(400).json({message:'選択肢から回答してください。'})
  db.prepare('UPDATE assessments SET seven_day_result=? WHERE id=?').run(req.body.result,req.params.id); res.json({ action:req.body.result==='悪化した'?'safety':req.body.result==='変わらない'?'recheck':'continue' })
}))

app.get('/api/admin/dashboard', admin, safe((_req,res)=>res.json({
  funnel: db.prepare(`SELECT count(DISTINCT CASE WHEN event_type='assessment_completed' THEN assessment_id END) completed,count(DISTINCT CASE WHEN event_type='video_click' THEN assessment_id END) video_clicks,count(DISTINCT CASE WHEN event_type='completed_stretch' THEN assessment_id END) exercised FROM activity_logs`).get(),
  users: db.prepare('SELECT count(*) total FROM users').get().total,
  quality: db.prepare(`SELECT count(*) assessments,sum(is_unsafe) excluded,round(100.0*sum(is_unsafe)/max(count(*),1),1) excluded_rate,round(100.0*sum(CASE WHEN u.line_user_id LIKE 'guest-%' THEN 1 ELSE 0 END)/max(count(*),1),1) guest_rate FROM assessments a JOIN users u ON u.id=a.user_id`).get(),
  types: db.prepare('SELECT t.name,count(a.id) count FROM stretch_types t LEFT JOIN assessments a ON a.stretch_type_id=t.id GROUP BY t.id ORDER BY count DESC').all(),
  recent: db.prepare('SELECT a.id,a.main_body_part,t.name type_name,a.completed_at,a.is_unsafe FROM assessments a LEFT JOIN stretch_types t ON t.id=a.stretch_type_id ORDER BY a.id DESC LIMIT 30').all()
})))
app.get('/api/admin/stretches', admin, safe((_req,res)=>res.json(db.prepare('SELECT * FROM stretches ORDER BY priority,id').all())))
app.post('/api/admin/stretches', admin, safe((req,res)=>{const x=req.body;const info=db.prepare('INSERT INTO stretches(name,body_part,tags,video_url,thumbnail_url,duration_seconds,difficulty,caution,published,priority) VALUES(?,?,?,?,?,?,?,?,?,?)').run(x.name,x.body_part,JSON.stringify(x.tags||[]),x.video_url||'',x.thumbnail_url||'',x.duration_seconds||30,x.difficulty||'やさしい',x.caution||'痛みのない範囲で行ってください。',x.published===false?0:1,x.priority||100);res.status(201).json({id:Number(info.lastInsertRowid)})}))
app.put('/api/admin/stretches/:id', admin, safe((req,res)=>{const x=req.body;if(!x.published){const short=db.prepare(`SELECT t.name FROM stretch_types t JOIN stretch_type_stretches x ON x.stretch_type_id=t.id WHERE x.stretch_id=? AND (SELECT count(*) FROM stretch_type_stretches x2 JOIN stretches s2 ON s2.id=x2.stretch_id WHERE x2.stretch_type_id=t.id AND s2.published=1 AND s2.id<>?)<3`).get(req.params.id,req.params.id);if(short)return res.status(422).json({message:`「${short.name}」の公開動画が3本未満になるため停止できません。先に代替動画を紐付けてください。`})}db.prepare('UPDATE stretches SET name=?,body_part=?,video_url=?,duration_seconds=?,published=?,priority=? WHERE id=?').run(x.name,x.body_part,x.video_url||'',x.duration_seconds||30,x.published?1:0,x.priority||100,req.params.id);res.json({ok:true})}))
app.delete('/api/admin/stretches/:id', admin, safe((req,res)=>{const short=db.prepare(`SELECT t.name FROM stretch_types t JOIN stretch_type_stretches x ON x.stretch_type_id=t.id WHERE x.stretch_id=? AND (SELECT count(*) FROM stretch_type_stretches x2 JOIN stretches s2 ON s2.id=x2.stretch_id WHERE x2.stretch_type_id=t.id AND s2.published=1 AND s2.id<>?)<3`).get(req.params.id,req.params.id);if(short)return res.status(422).json({message:`「${short.name}」の公開動画が3本未満になるため削除できません。`});db.prepare('DELETE FROM stretches WHERE id=?').run(req.params.id);res.json({ok:true})}))
app.get('/api/admin/types', admin, safe((_req,res)=>res.json(db.prepare('SELECT t.*,sum(CASE WHEN s.published=1 THEN 1 ELSE 0 END) published_stretches FROM stretch_types t LEFT JOIN stretch_type_stretches x ON x.stretch_type_id=t.id LEFT JOIN stretches s ON s.id=x.stretch_id GROUP BY t.id ORDER BY t.body_part,t.name').all())))
app.put('/api/admin/types/:id/menu', admin, safe((req,res)=>{const tx=db.prepare('DELETE FROM stretch_type_stretches WHERE stretch_type_id=?');tx.run(req.params.id);const add=db.prepare('INSERT INTO stretch_type_stretches VALUES(?,?,?)');(req.body.stretchIds||[]).slice(0,5).forEach((id,i)=>add.run(req.params.id,id,i+1));res.json({ok:true})}))

app.post('/api/line/webhook', safe(async(req,res)=>{ if(!validLineSignature(req.rawBody,req.headers['x-line-signature']))return res.status(401).end(); for(const event of req.body.events||[]){if(event.type==='postback'){const p=new URLSearchParams(event.postback.data);const assessmentId=p.get('assessment_id');const action=p.get('action');const a=db.prepare('SELECT * FROM assessments WHERE id=?').get(assessmentId);if(a)db.prepare('INSERT OR IGNORE INTO activity_logs(user_id,assessment_id,event_type,event_key) VALUES(?,?,?,?)').run(a.user_id,a.id,`followup_${action}`,`postback-${event.replyToken}`);if(action==='stop'||action==='worse'||action==='pain')db.prepare("UPDATE followup_outbox SET status='canceled',canceled_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'").run(a?.user_id)}} res.json({ok:true}) }))
app.post('/api/jobs/followups', safe(async(req,res)=>{
  if(req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).end()
  const hour=Number(new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',hour12:false}).format(new Date())); if(hour<9||hour>=21)return res.json({processed:0,deferred:true})
  const jobs=db.prepare("SELECT o.*,u.line_user_id,t.name FROM followup_outbox o JOIN users u ON u.id=o.user_id LEFT JOIN assessments a ON a.id=o.assessment_id LEFT JOIN stretch_types t ON t.id=a.stretch_type_id WHERE o.status='pending' AND o.canceled_at IS NULL AND u.blocked_at IS NULL AND o.due_at<=datetime('now') LIMIT 100").all()
  for(const j of jobs){const choices=j.kind==='day1'?[['やった','done'],['まだ','not_yet'],['合わなかった','not_fit']]:j.kind==='day3'?[['ラクになった','better'],['変わらない','same'],['つらい','worse']]:[['もう一度チェック','recheck'],['別の部位もみる','other'],['続けるコツ','continue']];const text=j.kind==='day1'?'昨日の3本、1本でも試せましたか？ まだでも大丈夫です。':j.kind==='day3'?'この3日で、体の感じはどうですか？':'1週間おつかれさまでした。今の状態を教えてください。';const actions=choices.map(([label,action])=>({type:'postback',label,data:`action=${action}&assessment_id=${j.assessment_id}&step=${j.kind}`}));actions.push({type:'postback',label:'通知を止める',data:`action=stop&assessment_id=${j.assessment_id}&step=${j.kind}`});try{await pushLine(j.line_user_id,[{type:'template',altText:text,template:{type:'buttons',text,actions}}]);db.prepare("UPDATE followup_outbox SET status='sent',sent_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=?").run(j.id)}catch(e){db.prepare("UPDATE followup_outbox SET attempts=attempts+1,last_error=? WHERE id=?").run(String(e.message),j.id);if(String(e.message).includes('403')){db.prepare('UPDATE users SET blocked_at=CURRENT_TIMESTAMP WHERE id=?').run(j.user_id);db.prepare("UPDATE followup_outbox SET status='canceled',canceled_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'").run(j.user_id)}}}
  res.json({processed:jobs.length})
}))

app.use(express.static(path.join(root,'dist')))
app.get('/*splat', (req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(root,'dist','index.html')))
app.use((_req,res)=>res.status(404).json({message:'ページが見つかりません。'}))
const server=app.listen(process.env.PORT||8787,()=>console.log(`Stretch Check API: http://localhost:${process.env.PORT||8787}`))
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}))
