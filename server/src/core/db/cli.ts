import { loadConfig, loadEnvFile } from '../config';
import { loadSeed } from '../seed';
import { assertNamedSchema, migrate, reset, seedDb } from './migrate';
import { createPool } from './pool';

const command = process.argv[2];
const COMMANDS = ['setup', 'migrate', 'seed', 'reset'];
if (!COMMANDS.includes(command)) {
  console.error(`Usage: cli.ts <${COMMANDS.join('|')}>`);
  process.exit(1);
}

loadEnvFile();
// Database commands always need a real database, whatever MOCK says.
let pool: ReturnType<typeof createPool> | undefined;

try {
  const config = loadConfig({ ...process.env, MOCK: '0' });
  assertNamedSchema(config.dbSchema);
  pool = createPool(config.databaseUrl!, config.dbSchema);
  if (command === 'reset') {
    await reset(pool, config.dbSchema);
    console.log(`Dropped schema ${config.dbSchema}`);
  }
  if (command !== 'seed') {
    const applied = await migrate(pool, config.dbSchema);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations');
  }
  if (command !== 'migrate') {
    const seed = loadSeed();
    await seedDb(pool, config.dbSchema, seed.buildings, seed.events);
    console.log(`Seeded ${seed.buildings.length} buildings and ${seed.events.length} events into ${config.dbSchema}`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
