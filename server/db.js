import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { typeDefinitions } from './catalog.js'

const file = process.env.DATABASE_PATH || './data/stretch-check.db'
fs.mkdirSync(path.dirname(file), { recursive: true })
export const db = new DatabaseSync(file)
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')

export function setup() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, line_user_id TEXT UNIQUE NOT NULL, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_used_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stretch_types (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, body_part TEXT NOT NULL, description TEXT NOT NULL, active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS stretches (id INTEGER PRIMARY KEY, name TEXT NOT NULL, body_part TEXT NOT NULL, tags TEXT DEFAULT '[]', video_url TEXT, thumbnail_url TEXT, duration_seconds INTEGER DEFAULT 30, difficulty TEXT DEFAULT 'やさしい', caution TEXT DEFAULT '痛みのない範囲で行ってください。', published INTEGER DEFAULT 1, priority INTEGER DEFAULT 100);
    CREATE TABLE IF NOT EXISTS stretch_type_stretches (stretch_type_id INTEGER REFERENCES stretch_types(id) ON DELETE CASCADE, stretch_id INTEGER REFERENCES stretches(id) ON DELETE CASCADE, position INTEGER, PRIMARY KEY(stretch_type_id, stretch_id));
    CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), status TEXT DEFAULT 'in_progress', main_body_part TEXT, stretch_type_id INTEGER REFERENCES stretch_types(id), is_unsafe INTEGER DEFAULT 0, started_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, seven_day_result TEXT);
    CREATE TABLE IF NOT EXISTS assessment_answers (assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE, question_id TEXT, answer TEXT, PRIMARY KEY(assessment_id, question_id));
    CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), assessment_id INTEGER REFERENCES assessments(id), stretch_id INTEGER REFERENCES stretches(id), event_type TEXT NOT NULL, event_key TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS followup_outbox (id INTEGER PRIMARY KEY, user_id INTEGER, assessment_id INTEGER, kind TEXT, due_at TEXT, status TEXT DEFAULT 'pending', UNIQUE(assessment_id, kind));
  `)
  const migrations = [
    ['users','consent_at','TEXT'],['users','blocked_at','TEXT'],
    ['assessments','ruleset_version','INTEGER DEFAULT 1'],['assessments','question_version','INTEGER DEFAULT 1'],['assessments','excluded_reason','TEXT'],
    ['followup_outbox','scheduled_at','TEXT'],['followup_outbox','sent_at','TEXT'],['followup_outbox','canceled_at','TEXT'],['followup_outbox','attempts','INTEGER DEFAULT 0'],['followup_outbox','last_error','TEXT'],['followup_outbox','idempotency_key','TEXT']
  ]
  for (const [table,column,type] of migrations) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`) } catch (e) { if (!String(e).includes('duplicate column')) throw e } }
  seed()
}

export function seed() {
  const addType = db.prepare('INSERT OR IGNORE INTO stretch_types(slug,name,body_part,description) VALUES(?,?,?,?)')
  typeDefinitions.forEach(t => addType.run(...t))
  const count = db.prepare('SELECT count(*) n FROM stretches').get().n
  if (!count) {
    const addStretch = db.prepare('INSERT INTO stretches(name,body_part,tags,video_url,thumbnail_url,duration_seconds,priority) VALUES(?,?,?,?,?,?,?)')
    const stretches = Array.from({ length: 30 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0'); const part = ['首','肩','背中','腰・お尻','股関節','脚'][i % 6]
      return [`Sample Stretch ${n}`, part, JSON.stringify(['サンプル', part]), `https://www.youtube.com/results?search_query=Sample+Stretch+${n}`, '', 30 + (i % 2) * 15, i + 1]
    })
    stretches.forEach(s => addStretch.run(...s))
    const types = db.prepare('SELECT id FROM stretch_types ORDER BY id').all()
    const items = db.prepare('SELECT id FROM stretches ORDER BY id').all()
    const link = db.prepare('INSERT OR IGNORE INTO stretch_type_stretches VALUES(?,?,?)')
    types.forEach((t, i) => [0,1,2].forEach((offset, p) => link.run(t.id, items[(i * 3 + offset) % items.length].id, p + 1)))
  }
}

export function getMenu(typeId) {
  const direct = db.prepare(`SELECT s.* FROM stretches s JOIN stretch_type_stretches x ON x.stretch_id=s.id WHERE x.stretch_type_id=? AND s.published=1 ORDER BY x.position,s.priority LIMIT 5`).all(typeId)
  if (direct.length >= 3) return direct
  const used = direct.map(x=>x.id); const fill = db.prepare(`SELECT * FROM stretches WHERE published=1 AND id NOT IN (${used.map(()=>'?').join(',')||'NULL'}) ORDER BY priority,id LIMIT ?`).all(...used, 3-direct.length)
  return [...direct,...fill]
}
