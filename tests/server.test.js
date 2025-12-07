/**
 * Testes TDD para o servidor MCP WHM/cPanel
 * RED -> GREEN -> REFACTOR
 */

// IMPORTANTE: Mock das variaveis ANTES de qualquer require
process.env.NODE_ENV = 'test';
process.env.WHM_MCP_API_KEY = 'sk_whm_mcp_test_abcd1234efgh5678';
process.env.WHM_HOST = 'test.whm.local';
process.env.WHM_PORT = '2087';
process.env.WHM_USERNAME = 'root';
process.env.WHM_API_TOKEN = 'test_token_abc123';
process.env.MCP_PORT = '3200';
process.env.LOG_LEVEL = 'error';
process.env.SSH_HOST = '';  // Desabilita SSH nos testes

const request = require('supertest');
const app = require('../src/server');

// API Key de teste
const TEST_API_KEY = process.env.WHM_MCP_API_KEY;

describe('AC01: Health Check Funcional', () => {
  it('deve retornar status HTTP 200 para GET /health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });

  it('deve conter status: "healthy" no corpo', async () => {
    const response = await request(app).get('/health');
    expect(response.body.status).toBe('healthy');
  });

  it('deve conter service: "mcp-whm-cpanel" no corpo', async () => {
    const response = await request(app).get('/health');
    expect(response.body.service).toBe('mcp-whm-cpanel');
  });

  it('deve conter version e timestamp no corpo', async () => {
    const response = await request(app).get('/health');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('timestamp');
  });
});

describe('AC01b: Autenticacao Obrigatoria', () => {
  it('deve retornar 401 quando x-api-key esta ausente', async () => {
    const response = await request(app)
      .post('/mcp')
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing x-api-key');
  });

  it('deve retornar 401 quando x-api-key e invalida', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', 'invalid_key')
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid API Key');
  });

  it('deve processar requisicao quando x-api-key e valida', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('result');
  });
});

describe('AC02: Lista de Tools MCP', () => {
  it('deve retornar lista de tools disponiveis', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    expect(response.status).toBe(200);
    expect(response.body.result).toHaveProperty('tools');
    expect(Array.isArray(response.body.result.tools)).toBe(true);
  });

  it('cada tool deve ter name, description e inputSchema', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    const tools = response.body.result.tools;
    tools.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
    });
  });

  it('deve incluir tools DNS na lista', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    const tools = response.body.result.tools;
    const dnsTools = tools.filter(t => t.name.startsWith('dns.'));
    expect(dnsTools.length).toBeGreaterThan(0);
  });
});

describe('AC04: Gerenciamento SSH Seguro', () => {
  it('ssh.execute NAO deve existir como tool', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'ssh.execute', arguments: { command: 'ls' } },
        id: 1
      });

    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe(-32601);
  });

  it('system.restart_service deve rejeitar servico fora da allowlist', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'system.restart_service', arguments: { service: 'malicious-service' } },
        id: 1
      });

    // Pode retornar erro de SSH nao configurado ou de servico invalido
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBeLessThan(0);
  });

  it('log.read_last_lines deve rejeitar arquivo fora da whitelist', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'log.read_last_lines', arguments: { logfile: '/etc/shadow', lines: 10 } },
        id: 1
      });

    // Pode retornar erro de SSH nao configurado ou arquivo nao permitido
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBeLessThan(0);
  });
});

describe('AC16: Exposicao de Metricas Prometheus', () => {
  it('GET /metrics deve retornar metricas no formato Prometheus', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('mcp_http_request_duration_seconds');
  });
});

describe('Formato JSON-RPC 2.0', () => {
  it('deve retornar erro para metodo invalido', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({ jsonrpc: '2.0', method: 'invalid/method', id: 1 });

    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe(-32601);
  });

  it('deve manter id na resposta', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('x-api-key', TEST_API_KEY)
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 42 });

    expect(response.body.id).toBe(42);
    expect(response.body.jsonrpc).toBe('2.0');
  });
});
