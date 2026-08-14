import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/creator-signal-release.yml', import.meta.url), 'utf8');

const requiredFragments = [
  'outputs: type=docker,dest=release-staging/shlink-web-client-${{ matrix.artifact }}.tar',
  'run: docker load --input release-staging/shlink-web-client-${{ matrix.artifact }}.tar',
  'output-file: release-staging/shlink-web-client-${{ needs.validate.outputs.version }}-${{ matrix.artifact }}.spdx.json',
  'path: release-staging/',
  'docker load --input "release-artifacts/creator-signal-shlink-web-client-$artifact/shlink-web-client-$artifact.tar"',
  'release-artifacts/creator-signal-shlink-web-client-amd64/*.spdx.json',
  'release-artifacts/creator-signal-shlink-web-client-arm64/*.spdx.json',
  '--repo "$GITHUB_REPOSITORY"',
];

for (const fragment of requiredFragments) {
  assert.ok(workflow.includes(fragment), `Release artifact path contract is missing: ${fragment}`);
}

assert.doesNotMatch(
  workflow,
  /(?:dest|output-file|path):\s*\/tmp\//,
  'Release artifacts must be staged under the repository, not an absolute runner path',
);

console.log('Creator Signal release artifact path contract verified.');
