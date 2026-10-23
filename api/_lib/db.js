import pg from 'pg';

// Tall og datoer skal komme ut som vanlige JS-verdier, ikke strenger/Date-objekter
// i lokal tidssone (som gir feil dato rundt midnatt).
pg.types.setTypeParser(20, (v) => Number(v)); // int8 (COUNT, SUM av heltall)
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric
pg.types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD'

let pool = null;
let devDb = null;

// Lokal utvikling: dev-serveren setter inn en PGlite-database i stedet for Postgres.
export function useDevDatabase(db) {
  devDb = db;
}

function getPool() {
  if (!pool) {
    const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
    if (!url) {
      const err = new Error('DATABASE_URL er ikke satt.');
      err.status = 503;
      err.expose = 'Databasen er ikke koblet til ennå. Se README.md for oppsett.';
      throw err;
    }
    pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

function wrap(runner) {
  const q = async (text, params = []) => (await runner.query(text, params)).rows;
  return {
    q,
    one: async (text, params) => (await q(text, params))[0] ?? null,
    exec: (text) => (runner.exec ? runner.exec(text) : runner.query(text)),
  };
}

export async function q(text, params = []) {
  const runner = devDb ?? getPool();
  return (await runner.query(text, params)).rows;
}

export async function one(text, params = []) {
  return (await q(text, params))[0] ?? null;
}

export async function transaction(fn) {
  if (devDb) return devDb.transaction((tx) => fn(wrap(tx)));
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
