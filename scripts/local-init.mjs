// Initialize the isolated evaluation instance. Never print credentials.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const base = 'http://127.0.0.1:4330';
const health = await fetch(`${base}/health`);
if (!health.ok) throw new Error(`Health check failed: ${health.status}`);

if (!existsSync('.local/admin-api-key')) {
  const owner = JSON.parse(readFileSync('.local/owner.json', 'utf8'));
  let output;
  try {
    output = execFileSync('docker', [
      'compose', '-f', 'compose.local.yml', 'exec', '-T', 'app',
      'python', '-m', 'scripts.seed',
      '--email', owner.email, '--password', owner.password,
      '--workspace-name', owner.workspace_name,
      '--workspace-slug', owner.workspace_slug,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error('Local workspace initialization failed; credentials were not logged.');
  }
  const key = output.match(/api key:\s*(nk_\S+)/)?.[1];
  if (!key) throw new Error('Initialization returned no API key.');
  writeFileSync('.local/admin-api-key', key, { mode: 0o600 });
}

const adminKey = readFileSync('.local/admin-api-key', 'utf8').trim();
if (!existsSync('.local/dashboard-key')) {
  const result = await fetch(`${base}/workspace/api-keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Panel local de evaluación', role: 'readonly', scopes: ['*:read'] }),
  });
  if (!result.ok) throw new Error(`Dashboard key creation failed: ${result.status}`);
  const access = await result.json();
  writeFileSync('.local/dashboard-key', access.key, { mode: 0o600 });
}

const readKey = readFileSync('.local/dashboard-key', 'utf8').trim();
const headers = { Authorization: `Bearer ${readKey}` };
const workspace = await fetch(`${base}/workspace`, { headers });
if (!workspace.ok) throw new Error(`Workspace read failed: ${workspace.status}`);
const ws = await workspace.json();
const pipelineResponse = await fetch(`${base}/pipelines`, { headers });
if (!pipelineResponse.ok) throw new Error(`Pipeline read failed: ${pipelineResponse.status}`);
const pipelines = await pipelineResponse.json();
console.log(JSON.stringify({ workspace: ws.name, slug: ws.slug, pipelines: pipelines.length, stages: pipelines[0]?.stages.length, dashboard: `${base}/dashboard` }));
