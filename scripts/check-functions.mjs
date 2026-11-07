/** Run after `vercel build --prod` to verify the emitted Node ESM graph boots. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadFunction(name) {
  const directory = resolve(`.vercel/output/functions/api/${name}.func`);
  const config = JSON.parse(await readFile(resolve(directory, '.vc-config.json'), 'utf8'));
  return import(pathToFileURL(resolve(directory, config.handler)).href);
}

const [portfolio, admin, governance] = await Promise.all([
  loadFunction('portfolio'),
  loadFunction('admin'),
  loadFunction('governance'),
]);
const anonymous = await admin.GET(new Request('https://ap-count.vercel.app/api/admin'));
assert.equal(anonymous.status, 200);
assert.deepEqual(await anonymous.json(), { canEdit: false, role: 'visitor', canManageAdmins: false });
const privateHistory = await governance.GET(new Request('https://ap-count.vercel.app/api/governance'));
assert.equal(privateHistory.status, 401);
const privateMutation = await governance.POST(new Request('https://ap-count.vercel.app/api/governance', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ revision: 'initial', action: 'grant-admin', email: 'untrusted@example.test' }),
}));
assert.equal(privateMutation.status, 401);
const rejected = await portfolio.PUT(new Request('https://ap-count.vercel.app/api/portfolio', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ revision: 'initial', portfolios: [] }),
}));
assert.equal(rejected.status, 401);
assert.equal((await rejected.json()).code, 'unauthorized');
console.log('Compiled Vercel functions boot; anonymous access is read-only.');
