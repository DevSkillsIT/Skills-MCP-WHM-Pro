/**
 * MCP Resources — Dados estaticos do servidor WHM/cPanel
 * SPEC-WHM-ENHANCE-001 / F07
 *
 * Resources MCP sao contexto passivo (read-only) carregados pela aplicacao/usuario.
 * URIs: whm://server/config, whm://server/status
 */

const WHM_RESOURCES = [
  {
    uri: 'whm://server/config',
    name: 'Configuracao WHM/cPanel',
    description: 'Configuracao do servidor WHM/cPanel — versao, hostname, IP e dados estaticos da maquina. Acesso somente-leitura via protocolo MCP do WHM.',
    mimeType: 'text/markdown',
    annotations: { audience: ['assistant'], priority: 0.5 }
  },
  {
    uri: 'whm://server/status',
    name: 'Status WHM/cPanel',
    description: 'Status operacional do servidor WHM/cPanel — carga, uptime, servicos e daemons ativos. Acesso somente-leitura via protocolo MCP do WHM.',
    mimeType: 'text/markdown',
    annotations: { audience: ['assistant'], priority: 0.7 }
  }
];

function listResources() {
  return WHM_RESOURCES;
}

async function readResource(uri, whmService) {
  const { formatServerStatus, formatServicesStatus } = require('./formatters/whm-formatters');

  switch (uri) {
    case 'whm://server/config': {
      const data = await whmService.getServerStatus();
      return { uri, mimeType: 'text/markdown', text: formatServerStatus(data) };
    }
    case 'whm://server/status': {
      const [status, services] = await Promise.all([
        whmService.getServerStatus(),
        whmService.getServiceStatus()
      ]);
      const md = formatServerStatus(status) + '\n\n---\n\n' + formatServicesStatus(services);
      return { uri, mimeType: 'text/markdown', text: md };
    }
    default:
      throw new Error(`Resource desconhecido: "${uri}". URIs disponiveis: whm://server/config, whm://server/status`);
  }
}

module.exports = { WHM_RESOURCES, listResources, readResource };
