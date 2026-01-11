# Database Schema (SQLite) - Source of Truth

This document reflects the live schema in `DB_PATH` (from `.env`) or the default
`./data/watest.db`. It is derived from `sqlite_master` and PRAGMA output and
contains no data.

## Purpose
- Store contacts, vehicles, opt-outs, campaigns, per-recipient tracking, and message logs.
- Support outbound campaign sends and inbound opt-out handling.

## Current DB location
- `DB_PATH` in `.env`: `./data/watest.db`
- Fallback when `DB_PATH` is not set: `./data/watest.db`
- The DB file is not versioned in Git.

## Schema overview
Tables (including internal):
- `contacts`
- `vehicles`
- `opt_outs`
- `campaigns`
- `campaign_recipients`
- `messages`
- `sqlite_sequence` (SQLite internal AUTOINCREMENT tracker)

Views: none

Triggers:
- `trg_contacts_updated_at` on `contacts`
- `trg_vehicles_updated_at` on `vehicles`
- `trg_campaigns_updated_at` on `campaigns`

## Table summary
- `contacts`: master contact records (phone, name, status, timestamps).
- `vehicles`: vehicle details linked to contacts.
- `opt_outs`: opt-out registry by phone.
- `campaigns`: campaign definitions and lifecycle state.
- `campaign_recipients`: per-recipient tracking for campaigns.
- `messages`: inbound/outbound message log.
- `sqlite_sequence`: internal AUTOINCREMENT tracker.

## sqlite_master objects (raw SQL)
Raw sqlite_master entries (tables, indexes, triggers, views) are captured in:
- `docs/_schema_snapshots/schema-local.json`
- `docs/_schema_snapshots/schema-local.norm.json`
Views: none.

## ERD (text)
- `contacts (id)` 1:N `vehicles.contact_id` (ON DELETE CASCADE)
- `contacts (id)` 1:N `campaign_recipients.contact_id` (ON DELETE CASCADE)
- `campaigns (id)` 1:N `campaign_recipients.campaign_id` (ON DELETE CASCADE)
- `contacts (id)` 1:N `messages.contact_id` (ON DELETE SET NULL)
- `campaigns (id)` 1:N `messages.campaign_id` (ON DELETE SET NULL)
- `opt_outs` is independent (unique `phone`, no FK)
- `sqlite_sequence` is internal

ASCII diagram:
```
contacts (id) ----< vehicles.contact_id
contacts (id) ----< campaign_recipients.contact_id
campaigns (id) ---< campaign_recipients.campaign_id
contacts (id) ----< messages.contact_id (SET NULL)
campaigns (id) ---< messages.campaign_id (SET NULL)
opt_outs (phone unique, no FK)
sqlite_sequence (internal)
```

## Tables

### contacts
Usage: master list of contacts with status and timestamps.

Columns:
| Column     | Type    | Null | Default            | Key    |
|-----------|---------|------|--------------------|--------|
| id        | INTEGER | no   | NULL               | PK     |
| phone     | TEXT    | no   | NULL               | UNIQUE |
| name      | TEXT    | yes  | NULL               |        |
| status    | TEXT    | no   | 'active'           |        |
| created_at| TEXT    | no   | datetime('now')    |        |
| updated_at| TEXT    | no   | datetime('now')    |        |

Indexes:
- `idx_contacts_phone` (unique: no, columns: phone)
- `idx_contacts_status` (unique: no, columns: status)
- `idx_contacts_created_at` (unique: no, columns: created_at)
- `sqlite_autoindex_contacts_1` (unique: yes, columns: phone)

Foreign keys: none

Trigger:
- `trg_contacts_updated_at` updates `updated_at` after UPDATE.

### vehicles
Usage: vehicle records linked to contacts.

Columns:
| Column     | Type    | Null | Default            | Key |
|-----------|---------|------|--------------------|-----|
| id        | INTEGER | no   | NULL               | PK  |
| contact_id| INTEGER | no   | NULL               |     |
| make      | TEXT    | no   | NULL               |     |
| model     | TEXT    | no   | NULL               |     |
| year      | INTEGER | no   | NULL               |     |
| price     | REAL    | yes  | NULL               |     |
| link      | TEXT    | yes  | NULL               |     |
| created_at| TEXT    | no   | datetime('now')    |     |
| updated_at| TEXT    | no   | datetime('now')    |     |

Indexes:
- `idx_vehicles_contact_id` (unique: no, columns: contact_id)
- `idx_vehicles_make` (unique: no, columns: make)
- `idx_vehicles_year` (unique: no, columns: year)

Foreign keys:
- `contact_id` -> `contacts.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

Trigger:
- `trg_vehicles_updated_at` updates `updated_at` after UPDATE.

### opt_outs
Usage: opt-out registry by phone.

Columns:
| Column      | Type    | Null | Default            | Key    |
|------------|---------|------|--------------------|--------|
| id         | INTEGER | no   | NULL               | PK     |
| phone      | TEXT    | no   | NULL               | UNIQUE |
| opted_out_at| TEXT   | no   | datetime('now')    |        |
| reason     | TEXT    | yes  | NULL               |        |

Indexes:
- `idx_opt_outs_phone` (unique: no, columns: phone)
- `sqlite_autoindex_opt_outs_1` (unique: yes, columns: phone)

Foreign keys: none

### campaigns
Usage: campaign definitions and lifecycle tracking.

Columns:
| Column          | Type    | Null | Default                 | Key |
|----------------|---------|------|-------------------------|-----|
| id             | INTEGER | no   | NULL                    | PK  |
| name           | TEXT    | no   | NULL                    |     |
| status         | TEXT    | no   | 'draft'                 |     |
| message_template| TEXT   | yes  | NULL                    |     |
| started_at     | TEXT    | yes  | NULL                    |     |
| completed_at   | TEXT    | yes  | NULL                    |     |
| total_recipients| INTEGER| yes  | 0                       |     |
| sent_count     | INTEGER | yes  | 0                       |     |
| created_at     | TEXT    | no   | datetime('now')         |     |
| type           | TEXT    | no   | 'twilio_template'       |     |
| scheduled_at   | TEXT    | yes  | NULL                    |     |
| updated_at     | TEXT    | no   | '2026-01-11 00:01:16'    |     |
| content_sid    | TEXT    | yes  | NULL                    |     |
| filters        | TEXT    | yes  | NULL                    |     |
| paused_at      | TEXT    | yes  | NULL                    |     |
| failed_at      | TEXT    | yes  | NULL                    |     |
| error_message  | TEXT    | yes  | NULL                    |     |

Indexes:
- `idx_campaigns_status` (unique: no, columns: status)
- `idx_campaigns_created_at` (unique: no, columns: created_at)
- `idx_campaigns_type` (unique: no, columns: type)
- `idx_campaigns_scheduled_at` (unique: no, columns: scheduled_at)

Foreign keys: none

Trigger:
- `trg_campaigns_updated_at` updates `updated_at` after UPDATE.
Note: the `updated_at` default is a fixed timestamp in this DB file; the trigger keeps it current on updates.

### campaign_recipients
Usage: per-recipient delivery tracking for each campaign.

Columns:
| Column      | Type    | Null | Default            | Key |
|------------|---------|------|--------------------|-----|
| id         | INTEGER | no   | NULL               | PK  |
| campaign_id| INTEGER | no   | NULL               |     |
| contact_id | INTEGER | no   | NULL               |     |
| phone      | TEXT    | no   | NULL               |     |
| status     | TEXT    | no   | 'pending'          |     |
| message_sid| TEXT    | yes  | NULL               |     |
| sent_at    | TEXT    | yes  | NULL               |     |
| error_message| TEXT  | yes  | NULL               |     |
| created_at | TEXT    | no   | datetime('now')    |     |

Indexes:
- `idx_campaign_recipients_campaign_id` (unique: no, columns: campaign_id)
- `idx_campaign_recipients_contact_id` (unique: no, columns: contact_id)
- `idx_campaign_recipients_status` (unique: no, columns: status)

Foreign keys:
- `campaign_id` -> `campaigns.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)
- `contact_id` -> `contacts.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

### messages
Usage: unified inbound/outbound message log.

Columns:
| Column     | Type    | Null | Default            | Key    |
|-----------|---------|------|--------------------|--------|
| id        | INTEGER | no   | NULL               | PK     |
| direction | TEXT    | no   | NULL               |        |
| contact_id| INTEGER | yes  | NULL               |        |
| campaign_id| INTEGER| yes  | NULL               |        |
| phone     | TEXT    | no   | NULL               |        |
| body      | TEXT    | yes  | NULL               |        |
| message_sid| TEXT   | yes  | NULL               | UNIQUE |
| status    | TEXT    | yes  | NULL               |        |
| created_at| TEXT    | no   | datetime('now')    |        |

Indexes:
- `idx_messages_direction` (unique: no, columns: direction)
- `idx_messages_contact_id` (unique: no, columns: contact_id)
- `idx_messages_campaign_id` (unique: no, columns: campaign_id)
- `idx_messages_created_at` (unique: no, columns: created_at)
- `idx_messages_message_sid` (unique: no, columns: message_sid)
- `sqlite_autoindex_messages_1` (unique: yes, columns: message_sid)

Foreign keys:
- `contact_id` -> `contacts.id` (ON DELETE SET NULL, ON UPDATE NO ACTION)
- `campaign_id` -> `campaigns.id` (ON DELETE SET NULL, ON UPDATE NO ACTION)

### sqlite_sequence
Usage: internal SQLite table for AUTOINCREMENT tracking.

Columns:
| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| name   |      | yes  | NULL    |     |
| seq    |      | yes  | NULL    |     |

Indexes: none

## Operation in VPS
- Recommended `DB_PATH`: `/app/data/watest.db`
- Mount `/app/data` as a persistent volume in Easypanel so the DB survives redeploys.
- Do not commit `watest.db`: it contains user data and will drift across environments.

## Sync y commits
Goal: keep this document aligned with the live DB schema and capture snapshots for diffing.

Snapshot files (read-only, local):
- `docs/_schema_snapshots/schema-local.json` (raw, includes sqlite_master SQL, dbPath redacted when absolute)
- `docs/_schema_snapshots/schema-local.norm.json` (same content without dbPath)

Regenerate snapshots (PowerShell, read-only):
```powershell
@'
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split(/\r?\n/) : [];
let dbPath = './data/watest.db';
for (const line of env) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/^DB_PATH\s*=\s*(.+)$/);
  if (m) { dbPath = m[1].trim(); break; }
}
const resolved = path.resolve(dbPath);
if (!fs.existsSync(resolved)) { console.error(`DB file not found: ${dbPath}`); process.exit(1); }
const dbPathSnapshot = path.isAbsolute(dbPath) ? '<absolute path redacted>' : dbPath;
const db = new Database(resolved, { readonly: true, fileMustExist: true });
const master = db.prepare("SELECT name, type, tbl_name, sql FROM sqlite_master WHERE type IN ('table','view','trigger','index') ORDER BY type, name").all();
const tables = master.filter((m) => m.type === 'table').map((m) => m.name);
const tablesInfo = {};
for (const table of tables) {
  const columns = db.prepare('PRAGMA table_info(' + table + ')').all();
  const foreignKeys = db.prepare('PRAGMA foreign_key_list(' + table + ')').all();
  const indexList = db.prepare('PRAGMA index_list(' + table + ')').all();
  const indexes = indexList.map((idx) => {
    const indexInfo = db.prepare('PRAGMA index_info(' + idx.name + ')').all();
    return { name: idx.name, unique: idx.unique, origin: idx.origin, partial: idx.partial, columns: indexInfo.map((i) => i.name) };
  });
  tablesInfo[table] = { columns, foreignKeys, indexes };
}
const schema = { dbPath: dbPathSnapshot, sqliteMaster: master, tables: tablesInfo };
const normalized = { sqliteMaster: master, tables: tablesInfo };
const outDir = path.join('docs', '_schema_snapshots');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'schema-local.json'), JSON.stringify(schema, null, 2));
fs.writeFileSync(path.join(outDir, 'schema-local.norm.json'), JSON.stringify(normalized, null, 2));
'@ | node
```

How to validate (read-only):
```bash
node -e "const fs=require('fs');const path=require('path');const Database=require('better-sqlite3');const env=fs.existsSync('.env')?fs.readFileSync('.env','utf8').split(/\\r?\\n/):[];let dbPath='./data/watest.db';for(const line of env){const t=line.trim();if(!t||t.startsWith('#')) continue;const m=t.match(/^DB_PATH\\s*=\\s*(.+)$/);if(m){dbPath=m[1].trim();break;}}const resolved=path.resolve(dbPath);const db=new Database(resolved,{readonly:true,fileMustExist:true});const tables=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();for(const t of tables){const cols=db.prepare(\"PRAGMA table_info(\" + t.name + \")\").all();console.log(t.name);for(const c of cols){console.log(\"  - \" + c.name + \" (\" + c.type + \")\");} }"
```

Checklist before push/deploy:
- Regenerate snapshots and review diffs against the previous snapshot.
- If comparing against VPS, generate a VPS snapshot and diff `schema-local.norm.json` vs the VPS snapshot.
- Run the read-only introspection above and compare with `docs/db.md`.
- If there is schema drift, update `docs/db.md` first; handle migrations separately.
- Confirm `DB_PATH` and the volume mount in Easypanel.
- Verify foreign keys are enabled (`PRAGMA foreign_keys = ON`).
