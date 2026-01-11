
import Database from 'better-sqlite3';
const db = new Database('./data/watest.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const schema = {};

for (const table of tables) {
    if (table.name === 'sqlite_sequence') continue;
    const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
    schema[table.name] = columns.map(c => ({
        name: c.name,
        type: c.type,
        notnull: c.notnull,
        dflt_value: c.dflt_value
    }));
}

console.log(JSON.stringify(schema, null, 2));
