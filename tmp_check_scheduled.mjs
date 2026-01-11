import 'dotenv/config';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH || './data/watest.db';
const db = new Database(dbPath, { readonly: true });

const sql = "SELECT id,status,scheduled_at, datetime(scheduled_at) AS sched_dt, datetime('now') AS now_dt FROM campaigns WHERE status='scheduled' ORDER BY id DESC";
console.table(db.prepare(sql).all());
