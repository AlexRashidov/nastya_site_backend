const sqlite3 = require('sqlite3').verbose()

const db = new sqlite3.Database('./reviews.db')

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      rating INTEGER NOT NULL,
      approved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
})

module.exports = db
