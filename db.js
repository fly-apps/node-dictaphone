import pg from 'pg'

let db = null

export async function query(query, params) {
  // if the db is not connected, connect
  if (!db) {
    db = new pg.Client({ connectionString: process.env.DATABASE_URL })

    await db.connect()

    await db.query("CREATE TABLE IF NOT EXISTS clips ( \
      id SERIAL PRIMARY KEY, \
      name TEXT NOT NULL, \
      text TEXT \
    )")

    db.on('end', err => {
      console.error('Database connection ended', err);
      process.exit(1)
    })
  }

  // execute the query, call the callback with the results
  return db.query(query, params)
}
