// Gives the end-to-end server a scratch copy of the app config and a data folder
// of its own, so tests that add apps and save keys never touch config/.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const work = 'tests/e2e/.work';
const data = 'tests/e2e/.data';

rmSync(work, { recursive: true, force: true });
rmSync(data, { recursive: true, force: true });
mkdirSync(`${work}/apps`, { recursive: true });
mkdirSync(data, { recursive: true });

cpSync('config/apps', `${work}/apps`, { recursive: true });
cpSync('config/shortcuts.yml', `${work}/shortcuts.yml`);
writeFileSync(`${data}/prices.csv`, 'Date,Price\n2026-07,2410.5\n2026-08,2455.1\n2026-09,2501.9\n');
