import pg from 'pg';

/** `schema` must already be validated by loadConfig; it is interpolated as an identifier. */
export function createPool(databaseUrl: string, schema: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  pool.on('connect', (client) => {
    client
      .query(`SET search_path TO "${schema}", public`)
      .catch((err) => console.error('Failed to set search_path', err));
  });
  return pool;
}
