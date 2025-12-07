/**
 * MCP Server WHM/cPanel - Entrypoint HTTP
 * Implementa AC01 (Health Check) e endpoints MCP
 *
 * Skills IT Solucoes em Tecnologia
 * Porta: 3200
 */

require('dotenv').config();

const express = require('express');
const logger = require('./lib/logger');
const authMiddleware = require('./middleware/auth');
const { httpMetricsMiddleware, getMetrics, getMetricsContentType } = require('./lib/metrics');
const MCPHandler = require('./mcp-handler');

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
// Autenticacao (CC-01)
// Aplicar em todos os endpoints apos este ponto
// ============================================

app.use(authMiddleware);

// ============================================
// Handler MCP (AC02)
// ============================================

const mcpHandler = new MCPHandler();

app.post('/mcp', async (req, res) => {
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
