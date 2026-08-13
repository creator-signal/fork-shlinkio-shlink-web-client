import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();

const filesUnder = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await filesUnder(path)));
    } else {
      result.push(path);
    }
  }
  return result;
};

const forbiddenBuildValues = [
  'X-Api-Key',
  '/run/secrets/provider',
  'SHLINK_INTERNAL_URL',
  'SHLINK_API_KEY',
  'OIDC_CLIENT_SECRET',
  'SESSION_SECRET',
  'servers.json',
  'creator-signal-browser-secret-sentinel',
];
const forbiddenSourcePatterns = [
  /localStorageConfig[\s\S]*states:\s*\[[^\]]*servers/,
  /\/server\/create/,
  /\/manage-servers/,
  /servers\.json/,
  /forwardCredentials/,
];

const failures = [];
for (const file of await filesUnder(join(root, 'build'))) {
  if (!['.html', '.js', '.css', '.json', '.map'].includes(extname(file))) {
    continue;
  }
  const contents = await readFile(file, 'utf8');
  for (const forbidden of forbiddenBuildValues) {
    if (contents.includes(forbidden)) {
      failures.push(`${relative(root, file)} contains ${forbidden}`);
    }
  }
}

const browserSources = (await filesUnder(join(root, 'src'))).filter((file) => /\.(?:ts|tsx)$/.test(file));
const combinedSource = (await Promise.all(browserSources.map((file) => readFile(file, 'utf8')))).join('\n');
for (const pattern of forbiddenSourcePatterns) {
  if (pattern.test(combinedSource)) {
    failures.push(`browser source matches forbidden pattern ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Browser credential and persistence boundary verified.');
}
