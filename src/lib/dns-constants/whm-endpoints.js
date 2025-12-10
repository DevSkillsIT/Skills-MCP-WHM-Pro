/**
 * WHM_API_ENDPOINTS - Mapeamento COMPLETO de endpoints WHM API
 *
 * ESTRUTURA:
 * {
 *   CATEGORIA: {
 *     operacao: {
 *       endpoint: "/json-api/endpoint",
 *       method: "GET|POST",
 *       description: "Descrição",
 *       requiredParams: [],
 *       optionalParams: [],
 *       successIndicator: "caminho para verificar sucesso"
 *     }
 *   }
 * }
 */

const WHM_API_ENDPOINTS = {
  DNS: {
    listZones: {
      endpoint: '/json-api/listzones',
      method: 'GET',
      description: 'Lista todas as zonas DNS do servidor',
      requiredParams: [],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.zone'
    },

    dumpZone: {
      endpoint: '/json-api/dumpzone',
      method: 'GET',
      description: 'Retorna dump completo de uma zona DNS',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.zone[0]'
    },

    addRecord: {
      endpoint: '/json-api/addzonerecord',
      method: 'POST',
      description: 'Adiciona registro DNS a uma zona',
      requiredParams: ['domain', 'type', 'name'],
      optionalParams: ['address', 'cname', 'exchange', 'preference', 'txtdata', 'nsdname', 'ptrdname', 'ttl'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    editRecord: {
      endpoint: '/json-api/editzonerecord',
      method: 'POST',
      description: 'Edita registro DNS existente',
      requiredParams: ['domain', 'line'],
      optionalParams: ['address', 'cname', 'exchange', 'preference', 'txtdata', 'ttl'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    deleteRecord: {
      endpoint: '/json-api/removezonerecord',
      method: 'POST',
      description: 'Remove registro DNS de uma zona',
      requiredParams: ['domain', 'line'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    resetZone: {
      endpoint: '/json-api/resetzone',
      method: 'POST',
      description: 'Reseta zona DNS para configuração padrão',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data',
      warning: 'OPERAÇÃO DESTRUTIVA - Remove todos os registros customizados'
    },

    listMX: {
      endpoint: '/json-api/listmxs',
      method: 'GET',
      description: 'Lista registros MX de um domínio',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.mx'
    },

    saveMX: {
      endpoint: '/json-api/savemxs',
      method: 'POST',
      description: 'Salva/adiciona registro MX',
      requiredParams: ['domain', 'exchange'],
      optionalParams: ['priority', 'alwaysaccept'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    checkAliasAvailable: {
      endpoint: '/json-api/isaliasavailable',
      method: 'GET',
      description: 'Verifica se registro ALIAS está disponível',
      requiredParams: ['zone', 'name'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    }
  },

  DOMAIN: {
    getUserData: {
      endpoint: '/json-api/domainuserdata',
      method: 'GET',
      description: 'Obtém dados do usuário de um domínio',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    getAllInfo: {
      endpoint: '/json-api/get_domain_info',
      method: 'GET',
      description: 'Retorna informações de todos os domínios (paginado)',
      requiredParams: [],
      optionalParams: ['limit', 'offset', 'filter'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    getOwner: {
      endpoint: '/json-api/getdomainowner',
      method: 'GET',
      description: 'Obtém proprietário de um domínio',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.owner'
    },

    createAlias: {
      endpoint: '/json-api/park',
      method: 'POST',
      description: 'Cria domínio alias (parked domain)',
      requiredParams: ['domain', 'username'],
      optionalParams: ['target_domain'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    createSubdomain: {
      endpoint: '/json-api/addsubdomain',
      method: 'POST',
      description: 'Cria subdomínio',
      requiredParams: ['subdomain', 'domain', 'username'],
      optionalParams: ['document_root'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    delete: {
      endpoint: '/json-api/killdns', // ou deleteaddon/deleteparked dependendo do tipo
      method: 'POST',
      description: 'Deleta domínio (addon/parked/subdomain)',
      requiredParams: ['domain', 'username', 'type'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data',
      warning: 'OPERAÇÃO DESTRUTIVA - Remove domínio permanentemente'
    },

    resolve: {
      endpoint: '/json-api/resolvedomainname',
      method: 'GET',
      description: 'Resolve nome de domínio para IP',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    checkAuthority: {
      endpoint: '/json-api/haslocalauthority',
      method: 'GET',
      description: 'Verifica se servidor é autoritativo para domínio',
      requiredParams: ['domain'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    getDSRecords: {
      endpoint: '/json-api/get_ds_records',
      method: 'POST',
      description: 'Obtém registros DS (DNSSEC) de domínios',
      requiredParams: ['domains'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    updateUserdomains: {
      endpoint: '/json-api/updateuserdomains',
      method: 'POST',
      description: 'Atualiza arquivo /etc/userdomains',
      requiredParams: [],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data',
      warning: 'OPERAÇÃO DE SISTEMA - Afeta configuração global'
    }
  },

  ACCOUNT: {
    list: {
      endpoint: '/json-api/listaccts',
      method: 'GET',
      description: 'Lista todas as contas de hospedagem',
      requiredParams: [],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.acct'
    },

    create: {
      endpoint: '/json-api/createacct',
      method: 'POST',
      description: 'Cria nova conta de hospedagem',
      requiredParams: ['username', 'domain', 'password'],
      optionalParams: ['email', 'package', 'quota', 'ip'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data',
      warning: 'OPERAÇÃO DE CRIAÇÃO - Valide parâmetros cuidadosamente'
    },

    suspend: {
      endpoint: '/json-api/suspendacct',
      method: 'POST',
      description: 'Suspende conta de hospedagem',
      requiredParams: ['username'],
      optionalParams: ['reason'],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    unsuspend: {
      endpoint: '/json-api/unsuspendacct',
      method: 'POST',
      description: 'Reativa conta suspensa',
      requiredParams: ['username'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    terminate: {
      endpoint: '/json-api/removeacct',
      method: 'POST',
      description: 'Remove conta permanentemente',
      requiredParams: ['username'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data',
      warning: 'OPERAÇÃO DESTRUTIVA - Remove conta e todos os dados permanentemente'
    },

    getSummary: {
      endpoint: '/json-api/accountsummary',
      method: 'GET',
      description: 'Obtém resumo de uma conta',
      requiredParams: ['username'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.acct'
    },

    listDomains: {
      endpoint: '/json-api/listdomains',
      method: 'GET',
      description: 'Lista domínios de uma conta',
      requiredParams: ['username'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.domains'
    }
  },

  SYSTEM: {
    serverStatus: {
      endpoint: '/json-api/loadavg',
      method: 'GET',
      description: 'Obtém status do servidor (CPU, memória, carga)',
      requiredParams: [],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data'
    },

    serviceStatus: {
      endpoint: '/json-api/servicestatus',
      method: 'GET',
      description: 'Status dos serviços do servidor',
      requiredParams: [],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data.service'
    },

    restartService: {
      endpoint: '/json-api/restartservice',
      method: 'POST',
      description: 'Reinicia serviço específico',
      requiredParams: ['service'],
      optionalParams: [],
      successIndicator: 'metadata.result === 1',
      returnPath: 'data',
      warning: 'OPERAÇÃO CRÍTICA - Pode afetar disponibilidade do serviço'
    }
  }
};

/**
 * Obtém informações de um endpoint
 * @param {string} category - Categoria (DNS, DOMAIN, ACCOUNT, SYSTEM)
 * @param {string} operation - Operação
 * @returns {object|null} Informações do endpoint
 */
function getEndpointInfo(category, operation) {
  if (!category || !operation) {
    return null;
  }

  const cat = WHM_API_ENDPOINTS[category.toUpperCase()];
  return cat ? cat[operation] : null;
}

/**
 * Valida parâmetros de uma operação
 * @param {string} category - Categoria
 * @param {string} operation - Operação
 * @param {object} params - Parâmetros fornecidos
 * @returns {object} Resultado da validação
 */
function validateEndpointParams(category, operation, params) {
  const endpoint = getEndpointInfo(category, operation);

  if (!endpoint) {
    return {
      valid: false,
      error: `Endpoint não encontrado: ${category}.${operation}`
    };
  }

  const missing = endpoint.requiredParams.filter(param => !(param in params));

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Parâmetros obrigatórios faltando: ${missing.join(', ')}`
    };
  }

  return { valid: true };
}

module.exports = {
  WHM_API_ENDPOINTS,
  getEndpointInfo,
  validateEndpointParams
};
