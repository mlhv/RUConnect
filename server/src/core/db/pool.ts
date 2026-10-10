import pg from 'pg';

/** `schema` must already be validated by loadConfig; it is interpolated as an identifier. */
export function createPool(databaseUrl: string, schema: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  // An error on an idle client (e.g. the server dropping the connection) would otherwise crash the process.
  pool.on('error', (err) => console.error('Idle database client error', err));
  pool.on('connect', (client) => {
    // If the path cannot be set, kill this connection so the pool never serves it on the wrong search_path.
    client.query(`SET search_path TO "${schema}", public`).catch((err) => {
      console.error('Failed to set search_path; discarding connection', err);
      client.end().catch(() => {});
    });
  });
  return pool;
}
