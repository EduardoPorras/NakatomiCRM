// Idempotent local setup. No credentials are printed or included in client configs.
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const local = path.join(root, '.local');
const bridgeFile = path.resolve(root, '../lairot-arm-local/.data/mcp-bridge-key');
mkdirSync(path.dirname(bridgeFile), { recursive: true });
try { writeFileSync(bridgeFile, randomBytes(32).toString('hex'), {flag:'wx',mode:0o600}); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
chmodSync(bridgeFile, 0o600);
const base = 'http://127.0.0.1:4330';
const headers = {Authorization: `Bearer ${readFileSync(path.join(local,'admin-api-key'),'utf8').trim()}`, 'Content-Type': 'application/json'};
async function request(endpoint, options={}) {
  const response = await fetch(base+endpoint, { ...options, headers: {...headers, ...options.headers} });
  if (!response.ok) throw new Error(`MCP local setup ${endpoint}: HTTP ${response.status}`);
  return response.json();
}
const workspace = await request('/workspace');
// Explicit minimum scopes: CRM work is allowed; key management, sending, connectors,
// approvals and deletion are not. pulse_* uses contacts/tasks/activities/deals/notes.
const scopes = ['workspace:read','contacts:read','contacts:write','companies:read','companies:write',
  'deals:read','deals:write','pipelines:read','tasks:read','tasks:write',
  'activities:read','activities:write','notes:read','notes:write','timeline:read','custom_fields:read'];
const agentFile = path.join(local, 'agent-api-key');
if (existsSync(agentFile)) {
  await request('/workspace', { headers: { Authorization: `Bearer ${readFileSync(agentFile,'utf8').trim()}` } });
} else {
  const result = await request('/workspace/api-keys', { method:'POST', body:JSON.stringify({
    name:'LAIROT Maestro · agentes locales', role:'member', scopes,
  }) });
  writeFileSync(agentFile, result.key, {mode:0o600,flag:'wx'});
  writeFileSync(path.join(local,'agent-key-info.json'), JSON.stringify({id:result.id,workspaceId:workspace.id,scopes},null,2),{mode:0o600});
}
chmodSync(agentFile,0o600);
const envFile = path.join(local,'app.env');
let env = readFileSync(envFile,'utf8');
for (const [name,value] of Object.entries({ PULSE_API_URL:'http://host.docker.internal:4320',
  PULSE_API_HOST:'127.0.0.1:4320',PULSE_API_KEY_FILE:'/run/secrets/pulse-key',PULSE_WORKSPACE_ID:workspace.id })) {
  env = env.replace(new RegExp(`^${name}=.*\\n?`,'m'),'');
  env = env.trimEnd()+`\n${name}=${value}\n`;
}
writeFileSync(envFile,env,{mode:0o600});
console.log(JSON.stringify({configured:true,workspace:workspace.name,workspaceId:workspace.id,agentKey:'private file',bridge:'loopback only',restartRequired:true}));
