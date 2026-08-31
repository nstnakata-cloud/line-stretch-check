import { db, setup } from './db.js'

setup()
const production = process.env.NODE_ENV === 'production'
const required = ['APP_URL','LIFF_ID','LINE_CHANNEL_ACCESS_TOKEN','LINE_CHANNEL_SECRET','ADMIN_TOKEN','CRON_SECRET']
const problems = [], warnings = []
for (const key of required) if (!process.env[key]) (production ? problems : warnings).push(`${key} が未設定です`)
for (const key of ['ADMIN_TOKEN','CRON_SECRET']) if (process.env[key] && process.env[key].length < 24) problems.push(`${key} は24文字以上にしてください`)
if (process.env.APP_URL && !/^https:\/\//.test(process.env.APP_URL) && production) problems.push('本番APP_URLはHTTPSが必要です')
const typeGaps = db.prepare(`SELECT t.name,count(CASE WHEN s.published=1 THEN 1 END) count FROM stretch_types t LEFT JOIN stretch_type_stretches x ON x.stretch_type_id=t.id LEFT JOIN stretches s ON s.id=x.stretch_id GROUP BY t.id HAVING count<3`).all()
if (typeGaps.length) problems.push(`公開動画が3本未満のタイプ: ${typeGaps.map(x=>x.name).join('、')}`)
const badVideos = db.prepare(`SELECT id,name FROM stretches WHERE published=1 AND (video_url IS NULL OR video_url='' OR video_url NOT LIKE 'https://%')`).all()
if (badVideos.length) problems.push(`動画URLが無効: ${badVideos.map(x=>`${x.id}:${x.name}`).join('、')}`)
const samples = db.prepare(`SELECT count(*) n FROM stretches WHERE published=1 AND name LIKE 'Sample Stretch %'`).get().n
if (samples) warnings.push(`サンプル動画が${samples}本残っています。本番公開前に差し替えてください`)
console.log(JSON.stringify({ok:problems.length===0,problems,warnings,counts:{types:db.prepare('SELECT count(*) n FROM stretch_types WHERE active=1').get().n,publishedStretches:db.prepare('SELECT count(*) n FROM stretches WHERE published=1').get().n}},null,2))
db.close()
if (problems.length) process.exitCode=1
