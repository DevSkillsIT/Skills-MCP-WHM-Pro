/**
 * DNS_RECORD_TYPES - Dicionário COMPLETO de tipos DNS
 *
 * ESTRUTURA para cada tipo:
 * {
 *   name: "A",
 *   fullName: "IPv4 Address",
 *   description: "Descrição completa",
 *   useCases: ["caso1", "caso2"],
 *   validationPattern: "regex",
 *   exampleValue: "exemplo",
 *   requiredFields: ["campo1"],
 *   optionalFields: ["campo2"]
 * }
 */

const DNS_RECORD_TYPES = {
  A: {
    name: 'A',
    fullName: 'IPv4 Address',
    description: 'Mapeia um nome de domínio para um endereço IPv4',
    useCases: [
      'Website hosting',
      'Mail servers',
      'API endpoints',
      'Servidores de aplicação'
    ],
    validationPattern: '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
    exampleValue: '192.168.1.1',
    requiredFields: ['address'],
    optionalFields: ['ttl']
  },

  AAAA: {
    name: 'AAAA',
    fullName: 'IPv6 Address',
    description: 'Mapeia um nome de domínio para um endereço IPv6',
    useCases: [
      'Suporte IPv6 para websites',
      'Serviços modernos de rede',
      'Compatibilidade dual-stack'
    ],
    validationPattern: '^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4})$',
    exampleValue: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    requiredFields: ['address'],
    optionalFields: ['ttl']
  },

  CNAME: {
    name: 'CNAME',
    fullName: 'Canonical Name',
    description: 'Cria um alias (apelido) para outro nome de domínio',
    useCases: [
      'Subdomain aliasing (www -> root)',
      'CDN configuration',
      'Load balancer endpoints',
      'Redirecionamento de subdomínios'
    ],
    validationPattern: '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.?$',
    exampleValue: 'example.com.',
    requiredFields: ['cname'],
    optionalFields: ['ttl'],
    restrictions: 'CNAME não pode coexistir com outros registros no mesmo nome'
  },

  MX: {
    name: 'MX',
    fullName: 'Mail Exchange',
    description: 'Especifica servidores de email para o domínio',
    useCases: [
      'Configuração de email',
      'Google Workspace / Microsoft 365',
      'Servidores de email personalizados',
      'Redundância de email'
    ],
    validationPattern: '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.?$',
    exampleValue: 'mail.example.com.',
    requiredFields: ['exchange'],
    optionalFields: ['priority', 'ttl'],
    additionalInfo: 'Prioridade menor = maior preferência (0-65535)'
  },

  TXT: {
    name: 'TXT',
    fullName: 'Text Record',
    description: 'Armazena texto arbitrário, usado para verificações e configurações',
    useCases: [
      'SPF (Sender Policy Framework)',
      'DKIM (DomainKeys Identified Mail)',
      'DMARC (Domain-based Message Authentication)',
      'Site verification (Google, Microsoft)',
      'Domain ownership proof'
    ],
    validationPattern: '.*', // Qualquer texto
    exampleValue: 'v=spf1 include:_spf.google.com ~all',
    requiredFields: ['txtdata'],
    optionalFields: ['ttl'],
    maxLength: 255 // Por string (podem existir múltiplas strings)
  },

  NS: {
    name: 'NS',
    fullName: 'Name Server',
    description: 'Especifica servidores DNS autoritativos para o domínio',
    useCases: [
      'Delegação de subdomínios',
      'Configuração de DNS primário',
      'DNS redundante'
    ],
    validationPattern: '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.?$',
    exampleValue: 'ns1.example.com.',
    requiredFields: ['nsdname'],
    optionalFields: ['ttl'],
    critical: true
  },

  SOA: {
    name: 'SOA',
    fullName: 'Start of Authority',
    description: 'Define informações autoritativas sobre a zona DNS',
    useCases: [
      'Zona DNS primária',
      'Configuração de serial number',
      'Timers de refresh/retry'
    ],
    exampleValue: 'ns1.example.com. admin.example.com. 2025120901 3600 1800 604800 86400',
    requiredFields: ['mname', 'rname', 'serial', 'refresh', 'retry', 'expire', 'minimum'],
    optionalFields: ['ttl'],
    critical: true,
    automaticManagement: 'Geralmente gerenciado automaticamente pelo servidor DNS'
  },

  PTR: {
    name: 'PTR',
    fullName: 'Pointer Record',
    description: 'Mapeia endereço IP para nome de domínio (reverse DNS)',
    useCases: [
      'Reverse DNS lookup',
      'Verificação de email servers',
      'Troubleshooting de rede'
    ],
    validationPattern: '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.?$',
    exampleValue: 'mail.example.com.',
    requiredFields: ['ptrdname'],
    optionalFields: ['ttl']
  },

  SRV: {
    name: 'SRV',
    fullName: 'Service Record',
    description: 'Define localização de serviços específicos',
    useCases: [
      'SIP/VoIP configuration',
      'XMPP/Jabber',
      'Minecraft servers',
      'Active Directory',
      'LDAP services'
    ],
    exampleValue: '_sip._tcp.example.com. 10 60 5060 sipserver.example.com.',
    requiredFields: ['target', 'port'],
    optionalFields: ['priority', 'weight', 'ttl'],
    format: '_service._proto.name. TTL priority weight port target.',
    additionalInfo: 'Priority: 0-65535, Weight: 0-65535, Port: 0-65535'
  },

  CAA: {
    name: 'CAA',
    fullName: 'Certification Authority Authorization',
    description: 'Especifica quais CAs podem emitir certificados SSL para o domínio',
    useCases: [
      'Controle de emissão de certificados SSL',
      'Segurança adicional para HTTPS',
      'Prevenção de certificados não autorizados'
    ],
    exampleValue: '0 issue "letsencrypt.org"',
    requiredFields: ['flags', 'tag', 'value'],
    optionalFields: ['ttl'],
    tags: ['issue', 'issuewild', 'iodef'],
    additionalInfo: 'Flags: 0 (não crítico) ou 128 (crítico)'
  }
};

/**
 * Obtém informações sobre um tipo de registro
 * @param {string} type - Tipo de registro DNS
 * @returns {object|null} Informações do tipo ou null
 */
function getRecordTypeInfo(type) {
  if (!type) {
    return null;
  }

  const normalized = type.toUpperCase();
  return DNS_RECORD_TYPES[normalized] || null;
}

/**
 * Lista todos os tipos de registro suportados
 * @returns {Array} Array com nomes dos tipos
 */
function getSupportedRecordTypes() {
  return Object.keys(DNS_RECORD_TYPES);
}

/**
 * Valida se um tipo de registro é suportado
 * @param {string} type - Tipo de registro
 * @returns {boolean} true se suportado
 */
function isValidRecordType(type) {
  if (!type) {
    return false;
  }

  const normalized = type.toUpperCase();
  return DNS_RECORD_TYPES.hasOwnProperty(normalized);
}

/**
 * Obtém campos obrigatórios para um tipo de registro
 * @param {string} type - Tipo de registro
 * @returns {Array} Campos obrigatórios
 */
function getRequiredFields(type) {
  const info = getRecordTypeInfo(type);
  return info ? info.requiredFields : [];
}

module.exports = {
  DNS_RECORD_TYPES,
  getRecordTypeInfo,
  getSupportedRecordTypes,
  isValidRecordType,
  getRequiredFields
};
