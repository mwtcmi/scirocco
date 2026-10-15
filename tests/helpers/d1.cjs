const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the Worker's real parameterized SQL against SQLite, including atomic batches.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '../../leaderboard/schema.sql'), 'utf8');
  sqlite.exec(schema);
  const db = {
    prepare(sql) {
      const make = values => ({
        bind: (...next) => make(next),
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
        execute() { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
        async run() { return this.execute(); }
      });
      return make([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return { db, sqlite, schema, close: () => sqlite.close() };
}
module.exports = { database };
