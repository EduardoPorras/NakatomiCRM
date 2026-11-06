#!/usr/bin/env node
/** Reproducible protocol QA. Native writes go only to an isolated QA workspace.
 * Optional --bridge-write-test creates one pending proposal in account qa-fusion.
 * No secrets are logged. Requires running local Nakatomi + LAIROT Maestro.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const pulse = path.resolve(root, '../lairot-arm-local');
const requirePulse = createRequire(path.join(pulse, 'package.json'));
const { Client } = await import(requirePulse.resolve('@modelcontextprotocol/sdk/client/index.js'));
const { StreamableHTTPClientTransport } = await import(requirePulse.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js'));
const { StdioClientTransport } = await import(requirePulse.resolve('@modelcontextprotocol/sdk/client/stdio.js'));
const qaFile = path.join(root, '.local/qa-api-key');
if (!existsSync(qaFile)) {
  let output;
  try { output = execFileSync('docker', ['compose', '-f', 'compose.local.yml', 'exec', '-T', 'app',
    'python', '-m', 'scripts.seed', '--email', 'qa-mcp@local.invalid', '--password', randomBytes(32).toString('hex'),
    '--workspace-name', 'QA MCP · aislado', '--workspace-slug', 'qa-mcp-isolated'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw new Error('No se pudo crear el workspace QA; la salida privada no se ha mostrado.'); }
  const key = output.match(/api key:\s*(nk_\S+)/)?.[1];
  if (!key) throw new Error('El workspace QA no devolvió una credencial. No se mostró la salida privada.');
  writeFileSync(qaFile, key, { mode: 0o600 });
}
const clients = [];
const checks = [];
const ok = (name) => { checks.push(name); console.log('PASS', name); };
function parsed(result) {
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent?.result ?? result.structuredContent ?? JSON.parse(result.content.find(c => c.type === 'text').text);
}
async function connect(file) {
  const client = new Client({ name: 'qa-lairot-protocol', version: '1.0' });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:4330/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${readFileSync(file, 'utf8').trim()}` } },
  }));
  return client;
}
try {
  const unauthenticated = await fetch('http://127.0.0.1:4330/mcp', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'qa-denied', version: '1' } } }) });
  assert.equal(unauthenticated.status, 401);
  ok('MCP sin credencial rechazado');
  const main = await connect(path.join(root, '.local/agent-api-key'));
  const tools = await main.listTools();
  assert.equal(tools.tools.filter(t => t.name.startsWith('pulse_')).length, 5);
  assert.ok(!tools.tools.some(t => t.name === 'pulse_approve'));
  ok(`MCP nativo initialize/list: ${tools.tools.length} herramientas, cinco Pulse`);
  const qa = await connect(qaFile);
  const contactArgs = { first_name: 'MCP', last_name: 'QA aislado', email: 'mcp-qa@local.invalid', data: { test: true }, external_id: 'qa-mcp-protocol', idempotency_key: 'qa-mcp-contact-v1' };
  const created = parsed(await qa.callTool({ name: 'create_contact', arguments: contactArgs }));
  const repeat = parsed(await qa.callTool({ name: 'create_contact', arguments: contactArgs }));
  assert.equal(created.id, repeat.id);
  const read = parsed(await qa.callTool({ name: 'get_contact', arguments: { contact_id: created.id } }));
  assert.equal(read.email, contactArgs.email);
  const task = parsed(await qa.callTool({ name: 'create_task', arguments: { title: 'QA MCP · revisar contexto', description: 'Prueba aislada ficticia; no contactar', entity_type: 'contact', entity_id: created.id, idempotency_key: 'qa-mcp-task-v1' } }));
  const tasks = parsed(await qa.callTool({ name: 'list_tasks', arguments: {} }));
  assert.ok(tasks.some(t => t.id === task.id));
  const resource = await qa.readResource({ uri: `crm://contact/${created.id}` });
  assert.equal(JSON.parse(resource.contents[0].text).id, created.id);
  ok('Contacto nativo create/read/idempotencia; tarea create/read; recurso contacto');
  const denied = await qa.callTool({ name: 'pulse_context', arguments: {} });
  assert.equal(denied.isError, true); assert.match(denied.content[0].text, /workspace/);
  const readonly = await connect(path.join(root, '.local/dashboard-key'));
  const deniedWrite = await readonly.callTool({ name: 'pulse_propose_followup', arguments: { pulse_contact_id: 'not-called', request_id: 'qa-denied', title: 'test', reason: 'test', draft: 'test' } });
  assert.equal(deniedWrite.isError, true); assert.match(deniedWrite.content[0].text, /scope/);
  ok('Pulse bloquea otro workspace y escritura con clave readonly');
  const stdio = new Client({ name: 'qa-stdio', version: '1.0' }); clients.push(stdio);
  await stdio.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(pulse, 'scripts/mcp-local.mjs')], env: { ...process.env, NAKATOMI_API_KEY_FILE: qaFile }, stderr: 'pipe' }));
  assert.equal((await stdio.listTools()).tools.length, tools.tools.length);
  assert.equal(parsed(await stdio.callTool({ name: 'get_contact', arguments: { contact_id: created.id } })).id, created.id);
  assert.ok((await stdio.listResourceTemplates()).resourceTemplates.some(t => t.uriTemplate === 'crm://contact/{contact_id}'));
  assert.equal(JSON.parse((await stdio.readResource({ uri: `crm://contact/${created.id}` })).contents[0].text).id, created.id);
  assert.ok(Array.isArray((await stdio.listPrompts()).prompts));
  ok('Stdio initialize/list/call/templates/read/prompts');
  const context = parsed(await main.callTool({ name: 'pulse_context', arguments: {} }));
  assert.equal(context.account.id, 'lairot');
  if (context.contacts.length) {
    const journey = parsed(await main.callTool({ name: 'pulse_journey', arguments: { pulse_contact_id: context.contacts[0].id } }));
    assert.ok(Array.isArray(journey.events)); assert.ok(!('token' in journey.contact));
  }
  const campaigns = parsed(await main.callTool({ name: 'pulse_campaigns', arguments: { model: 'last' } }));
  assert.equal(campaigns.account.id, 'lairot'); assert.equal(campaigns.filter.model, 'last');
  parsed(await main.callTool({ name: 'pulse_proposals', arguments: {} }));
  ok('Bridge real: contexto, recorrido, campañas, propuestas');
  if (process.argv.includes('--human-readback')) {
    const qaContext = parsed(await main.callTool({ name: 'pulse_context', arguments: { account_id: 'qa-fusion' } }));
    const lucia = qaContext.contacts.find(c => c.name === 'Lucía QA Fusión · ficticia');
    assert.ok(lucia?.nakatomiId, 'Falta el contacto ficticio de la prueba UI/MCP');
    const native = parsed(await main.callTool({ name: 'get_contact', arguments: { contact_id: lucia.nakatomiId } }));
    const company = parsed(await main.callTool({ name: 'get_company', arguments: { company_id: native.company_id } }));
    assert.equal(company.name, 'Empresa QA · creada desde la interfaz');
    assert.equal(native.data.pulse_status, 'En conversación');
    const nativeTasks = parsed(await main.callTool({ name: 'list_tasks', arguments: {} }));
    const originalTask = nativeTasks.find(t => t.entity_id === native.id && t.title === 'QA Fusión · revisar recorrido de Lucía');
    assert.equal(originalTask?.status, 'done');
    const proposals = parsed(await main.callTool({ name: 'pulse_proposals', arguments: { account_id: 'qa-fusion' } }));
    const proposal = proposals.proposals.find(p => p.contactId === lucia.id && p.rule === 'agent-qa-fusion-proposal-v1');
    assert.equal(proposal?.status, 'Aprobada');
    const draft = 'Revisión humana QA: comprobar el contacto compartido entre MCP e interfaz y registrar el resultado. Sin envío de correo.';
    assert.equal(proposal.draft, draft);
    const pulseTask = proposals.tasks.find(t => t.id === 'task-' + proposal.id);
    assert.equal(pulseTask?.draft, draft);
    assert.equal(nativeTasks.find(t => t.data?.pulse_task_id === pulseTask.id)?.description, draft);
    const journey = parsed(await main.callTool({ name: 'pulse_journey', arguments: { account_id: 'qa-fusion', pulse_contact_id: lucia.id } }));
    assert.equal(journey.contact.company, company.name);
    assert.equal(journey.contact.status, native.data.pulse_status);
    ok('Cambios humanos UI → MCP: empresa, estado, tarea terminada, propuesta aprobada, borrador y tarea compartidos');
  }
  if (process.argv.includes('--bridge-write-test')) {
    const contextQA = parsed(await main.callTool({ name: 'pulse_context', arguments: { account_id: 'qa-fusion' } }));
    const contact = contextQA.contacts.find(c => c.test && !['Ganado', 'Perdido'].includes(c.status));
    assert.ok(contact, 'La cuenta qa-fusion necesita un contacto ficticio abierto');
    const args = { account_id: 'qa-fusion', pulse_contact_id: contact.id, request_id: `qa-${randomUUID()}`, title: 'QA MCP · propuesta pendiente', reason: 'Prueba reproducible de integración con contacto ficticio.', draft: 'Revisar la prueba local. No enviar correo ni reservar.' };
    const proposal = parsed(await main.callTool({ name: 'pulse_propose_followup', arguments: args }));
    assert.equal(proposal.proposal.status, 'Pendiente'); assert.equal(proposal.sent, false);
    const replay = parsed(await main.callTool({ name: 'pulse_propose_followup', arguments: args }));
    assert.equal(replay.proposal.id, proposal.proposal.id); assert.equal(replay.replayed, true);
    const conflict = await main.callTool({ name: 'pulse_propose_followup', arguments: { ...args, title: 'Contenido cambiado' } });
    assert.equal(conflict.isError, true); assert.match(conflict.content[0].text, /409/);
    const ui = await fetch('http://127.0.0.1:4320/api/state').then(r => r.json());
    assert.ok(ui.proposals.some(p => p.id === proposal.proposal.id));
    assert.ok(ui.audit.some(a => a.entityId === proposal.proposal.id));
    ok('Propuesta QA pendiente: idempotencia, conflicto, readback UI y auditoría');
  }
  console.log(JSON.stringify({ passed: checks.length, nativeTools: tools.tools.length, productionModified: false }));
} finally {
  await Promise.allSettled(clients.map(c => c.close()));
}
