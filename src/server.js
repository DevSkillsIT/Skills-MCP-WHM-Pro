/**
 * MCP Server WHM/cPanel - Entrypoint HTTP
 * Implementa AC01 (Health Check) e endpoints MCP
 *
 * Skills IT Solucoes em Tecnologia
 * Porta: 3200
 */

require('dotenv').config();

const express = require('express');
const { randomUUID } = require('crypto');
const logger = require('./lib/logger');
const authMiddleware = require('./middleware/auth');
const { httpMetricsMiddleware, getMetrics, getMetricsContentType } = require('./lib/metrics');
const MCPHandler = require('./mcp-handler');

// ============================================
// Streamable HTTP Session Management (Gemini)
// ============================================
const mcpSessions = new Map();

// Cleanup expired sessions every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of mcpSessions.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      mcpSessions.delete(sessionId);
      logger.debug('Session expired', { sessionId });
    }
  }
}, 60000);

// Criar aplicacao Express
const app = express();

// Versao do MCP
const VERSION = '1.0.0';
const SERVICE_NAME = 'mcp-whm-cpanel';

// ============================================
// Middleware Global
// ============================================

// Parse JSON body
app.use(express.json({ limit: '10mb' }));

// Metricas Prometheus
app.use(httpMetricsMiddleware);

// Log de requisicoes
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logResponse(req, res, duration);
  });

  next();
});

// ============================================
// Health Check (AC01)
// NAO requer autenticacao
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: SERVICE_NAME,
    version: VERSION,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// Metricas Prometheus (AC16)
// NAO requer autenticacao
// ============================================

app.get('/metrics', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', getMetricsContentType());
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).send('Error generating metrics');
  }
});

// ============================================
// OAuth Discovery (para LibreChat/MCP 2024-11-05)
// Responde 404 indicando que OAuth NAO e necessario
// Isso permite que clientes MCP usem autenticacao via header
// ============================================

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.status(404).json({ error: 'OAuth not required', message: 'Use x-api-key header' });
});

app.get('/.well-known/oauth-protected-resource/*', (req, res) => {
  res.status(404).json({ error: 'OAuth not required', message: 'Use x-api-key header' });
});

// ============================================
// Autenticacao (CC-01)
// Aplicar em todos os endpoints apos este ponto
// ============================================

app.use(authMiddleware);

// ============================================
// Handler MCP (AC02)
// Suporta Streamable HTTP Transport (Claude + Gemini)
// GET = SSE, POST = JSON-RPC, DELETE = Session termination
// ============================================

const mcpHandler = new MCPHandler();

// GET /mcp - SSE endpoint for server-to-client notifications (Gemini requirement)
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || randomUUID();

  logger.info('SSE connection opened', { sessionId });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Mcp-Session-Id', sessionId);
  res.flushHeaders();

  // Register session
  mcpSessions.set(sessionId, { createdAt: Date.now(), res });

  // Send initial endpoint event
  res.write('event: endpoint\ndata: /mcp\n\n');

  // Keepalive every 30 seconds
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(':keepalive\n\n');
    }
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(keepAlive);
    mcpSessions.delete(sessionId);
    logger.info('SSE connection closed', { sessionId });
  });
});

// DELETE /mcp - Session termination (Gemini requirement)
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && mcpSessions.has(sessionId)) {
    mcpSessions.delete(sessionId);
    logger.info('Session terminated', { sessionId });
  }

  res.status(200).json({ status: 'session_terminated', sessionId });
});

// POST /mcp - JSON-RPC handler (works for both Claude and Gemini)
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || randomUUID();

  // Set session header for Streamable HTTP
  res.setHeader('Mcp-Session-Id', sessionId);

  // Register/update session
  if (!mcpSessions.has(sessionId)) {
    mcpSessions.set(sessionId, { createdAt: Date.now() });
  }

  try {
    logger.logRequest(req);

    const result = await mcpHandler.handleRequest(req.body);

    res.json(result);
  } catch (error) {
    logger.error('MCP Error', { error: error.message });

    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: error.message
      }
    });
  }
});

// ============================================
// 404 Handler
// ============================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    suggestion: 'Use GET /health or POST /mcp'
  });
});

// ============================================
// Error Handler
// ============================================

app.use((err, req, res, next) => {
  logger.error('Unhandled Error', { error: err.message, stack: err.stack });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.MCP_PORT || 3200;

// Nao iniciar servidor se estiver em modo de teste
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} v${VERSION} running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`MCP endpoint: http://localhost:${PORT}/mcp`);
    logger.info(`Metrics: http://localhost:${PORT}/metrics`);
  });
}

// Exportar app para testes
module.exports = app;
