import { createApp } from './core/app';
import { loadConfig, loadEnvFile } from './core/config';
import { createDeps } from './core/deps';

loadEnvFile();
const config = loadConfig();
const app = createApp(createDeps(config));

app.listen(config.port, () => {
  const mode = config.mock ? 'mock data' : `schema ${config.dbSchema}`;
  console.log(`RUConnect server on http://localhost:${config.port} (${mode})`);
});
