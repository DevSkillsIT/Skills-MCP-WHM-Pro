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

async function readResource(uri, whmService, sshManager) {
  const { formatServerStatus, formatServerConfig, formatServicesStatus } = require('./formatters/whm-formatters');

  switch (uri) {
    case 'whm://server/config': {
      const data = await whmService.getServerStatus();
      return { uri, mimeType: 'text/markdown', text: formatServerConfig(data) };
    }
    case 'whm://server/status': {
      const status = await whmService.getServerStatus();

      // O leitor tolerante ja cobre os headers malformados do WHM.
      // O SSH continua como segunda rede de seguranca.
      let servicesBlock;
      try {
        servicesBlock = formatServicesStatus(await whmService.getServiceStatus());
      } catch (apiError) {
        let recovered = null;
        if (sshManager) {
          try {
            const sshResult = await sshManager._executeCommand('whmapi1 servicestatus --output=json');
            const parsed = JSON.parse(sshResult.output);
            recovered = { services: parsed?.data?.service || [], timestamp: new Date().toISOString() };
          } catch (_) { /* SSH tambem indisponivel */ }
        }

        if (recovered) {
          servicesBlock = formatServicesStatus(recovered)
            + '\n\n_Coletado via SSH (a API do WHM falhou nesta chamada)._';
        } else {
          // NUNCA devolver lista vazia aqui: um leitor entenderia "nenhum
          // servico parado" quando na verdade nao houve medicao alguma.
          servicesBlock = [
            '## Servicos: DADOS INDISPONIVEIS',
            '',
            `Nao foi possivel medir o estado dos servicos: ${apiError.message}`,
            '',
            '**Isto NAO significa que os servicos estao ok, nem que estao parados — significa que nao houve leitura.**',
            'Nao afirme nada sobre servicos com base nesta secao.'
          ].join('\n');
        }
      }

      const md = formatServerStatus(status) + '\n\n---\n\n' + servicesBlock;
      return { uri, mimeType: 'text/markdown', text: md };
    }
    default:
      throw new Error(`Resource desconhecido: "${uri}". URIs disponiveis: whm://server/config, whm://server/status`);
  }
}

module.exports = { WHM_RESOURCES, listResources, readResource };
