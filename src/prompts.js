// prompts.js - Prompts profissionais para WHM/cPanel MCP Server
// Skills IT Soluções em Tecnologia
// 15 prompts: 7 para gestor, 8 para analista técnico

/**
 * Lista completa de prompts disponíveis no WHM MCP
 * Formato: compacto + detalhado (WhatsApp/Teams friendly)
 */

const WHM_PROMPTS = [
  // ============================================
  // PROMPTS PARA GESTOR (7)
  // ============================================
  {
    name: 'whm_account_health_summary',
    description: 'Resumo executivo de saude das contas de hospedagem WHM/cPanel com alertas criticos. Publico: gestor. Retorna dashboard de contas ativas, suspensas e problemas do servidor WHM.',
    arguments: [
      {
        name: 'filter_suspended',
        description: 'Filtrar apenas contas suspensas (true/false). Opcional.',
        required: false
      }
    ]
  },
  {
    name: 'whm_resource_usage_trends',
    description: 'Tendencias de uso de recursos e capacidade no WHM/cPanel. Publico: gestor. Retorna projecoes de disco, banda e CPU do servidor WHM com alertas.',
    arguments: [
      {
        name: 'period_days',
        description: 'Periodo em dias para analise (padrao: 7). Opcional.',
        required: false
      }
    ]
  },
  {
    name: 'whm_security_posture',
    description: 'Postura de seguranca do servidor WHM/cPanel com vulnerabilidades identificadas. Publico: gestor. Retorna scorecard de SSL, firewall e patches do WHM.',
    arguments: [
      {
        name: 'check_type',
        description: 'Tipo de verificacao: ssl, firewall, updates, all (padrao: all). Opcional.',
        required: false
      }
    ]
  },
  {
    name: 'whm_ssl_certificate_inventory',
    description: 'Inventario de certificados SSL e seguranca no WHM/cPanel com alertas de expiracao. Publico: gestor. Retorna status de AutoSSL e certificados do servidor WHM.',
    arguments: [
      {
        name: 'expiring_days',
        description: 'Alertar certificados expirando em X dias (padrao: 30). Opcional.',
        required: false
      }
    ]
  },
  {
    name: 'whm_backup_coverage',
    description: 'Cobertura de backups e copias de seguranca no WHM/cPanel com identificacao de contas desprotegidas. Publico: gestor. Retorna relatorio de restauracao e snapshots do WHM.',
    arguments: [
      {
        name: 'account_name',
        description: 'Nome da conta para analise especifica. Opcional, se omitido analisa todas.',
        required: false
      }
    ]
  },
  {
    name: 'whm_dns_zone_health',
    description: 'Saude de zonas DNS e apontamentos no WHM/cPanel com verificacao de propagacao. Publico: gestor. Retorna health check de registros e nameservers do WHM.',
    arguments: [
      {
        name: 'domain',
        description: 'Dominio especifico para analise DNS. Opcional, se omitido analisa todas as zonas.',
        required: false
      }
    ]
  },
  {
    name: 'whm_email_deliverability',
    description: 'Analise de entregabilidade de correio eletronico no WHM/cPanel com SPF/DKIM/DMARC. Publico: gestor. Retorna scorecard de MX, blacklists e autenticacao do WHM.',
    arguments: [
      {
        name: 'domain',
        description: 'Dominio para analise de entregabilidade. Opcional, se omitido analisa todos.',
        required: false
      }
    ]
  },

  // ============================================
  // PROMPTS PARA ANALISTA (8)
  // ============================================
  {
    name: 'whm_account_quick_lookup',
    description: 'Conta de hospedagem no WHM/cPanel — busca rapida por usuario, dominio ou IP. Publico: analista. Retorna info card compacto da conta no servidor WHM.',
    arguments: [
      {
        name: 'search_term',
        description: 'Termo de busca: usuario, dominio ou IP. Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_dns_troubleshooting',
    description: 'Troubleshoot de registros DNS e apontamentos no WHM/cPanel com verificacao de propagacao e nameservers. Publico: analista. Retorna diagnostico completo do WHM.',
    arguments: [
      {
        name: 'domain',
        description: 'Dominio para diagnosticar DNS. Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_email_setup_guide',
    description: 'Guia passo-a-passo para configuracao de correio e caixa postal no WHM/cPanel. Publico: analista. Retorna tutorial IMAP/SMTP com portas e configuracoes do WHM.',
    arguments: [
      {
        name: 'email_address',
        description: 'Endereco de email para configurar (ex: user@dominio.com). Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_ssl_installation_guide',
    description: 'Guia de instalacao de certificado SSL e seguranca HTTPS no WHM/cPanel. Publico: analista. Retorna tutorial de AutoSSL e instalacao manual no servidor WHM.',
    arguments: [
      {
        name: 'domain',
        description: 'Dominio para instalar certificado SSL. Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_website_down_investigation',
    description: 'Investigacao de site fora do ar no WHM/cPanel com diagnostico completo de conectividade, DNS e servicos. Publico: analista. Retorna runbook de troubleshooting do WHM.',
    arguments: [
      {
        name: 'domain',
        description: 'Dominio do site fora do ar para investigacao. Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_disk_usage_alert',
    description: 'Alerta de uso de disco e armazenamento no WHM/cPanel com analise de consumo por conta e diretorios. Publico: analista. Retorna recomendacoes de limpeza no WHM.',
    arguments: [
      {
        name: 'account_name',
        description: 'Nome da conta cPanel para analise de disco. Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_domain_migration_checklist',
    description: 'Checklist completo para migracao de dominio e hospedagem entre servidores WHM/cPanel. Publico: analista. Retorna guia de transferencia com validacoes do WHM.',
    arguments: [
      {
        name: 'domain_from',
        description: 'Dominio de origem da migracao. Obrigatorio.',
        required: true
      },
      {
        name: 'domain_to',
        description: 'Dominio de destino no novo servidor. Obrigatorio.',
        required: true
      }
    ]
  },
  {
    name: 'whm_backup_restore_guide',
    description: 'Guia de restauracao de backup e copias de seguranca no WHM/cPanel. Publico: analista. Retorna runbook com metodos de restore e troubleshooting do WHM.',
    arguments: [
      {
        name: 'account_name',
        description: 'Nome da conta cPanel a restaurar. Obrigatorio.',
        required: true
      },
      {
        name: 'backup_date',
        description: 'Data do backup no formato YYYY-MM-DD. Opcional, padrao: mais recente.',
        required: false
      }
    ]
  }
];

/**
 * Obtém o texto do prompt baseado no nome e argumentos
 * Implementa lógica multi-step com passos compactos para WhatsApp/Teams
 */
async function getPromptText(name, args, whmClient) {
  const filter_suspended = args?.filter_suspended === 'true' || args?.filter_suspended === true;
  const period_days = args?.period_days || 7;
  const check_type = args?.check_type || 'all';
  const expiring_days = args?.expiring_days || 30;
  const account_name = args?.account_name || args?.username;
  const domain = args?.domain || args?.zone;
  const search_term = args?.search_term || args?.query;
  const email_address = args?.email_address || 'usuario@dominio.com';
  const domain_from = args?.domain_from || 'origem';
  const domain_to = args?.domain_to || 'destino';
  const backup_date = args?.backup_date || 'mais recente';

  switch (name) {
    // ============================================
    // PROMPTS GESTOR
    // ============================================

    case 'whm_account_health_summary':
      return {
        description: `Resumo de saúde de contas${filter_suspended ? ' (apenas suspensas)' : ''}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `📊 **RESUMO EXECUTIVO - SAÚDE DAS CONTAS${filter_suspended ? ' (SUSPENSAS)' : ''}**

**Análise Geral:**

✅ **Status de Contas:**
- Total de contas ativas: X
- Contas suspensas: Y
- Contas com problemas: Z

⚠️ **Alertas Críticos:**
- Contas excedendo quota de disco
- Contas com uso excessivo de CPU
- Contas com emails em blacklist

📈 **Uso de Recursos:**
- Uso médio de disco: X GB
- Uso médio de banda: Y GB/mês
- Contas no TOP 10 de consumo

🚨 **Problemas Identificados:**
- Sites fora do ar
- Certificados SSL expirados/expirando
- Contas com backup atrasado

🎯 **Ações Recomendadas:**
- Contas para suspensão (violação de TOS)
- Upgrades de plano recomendados
- Limpeza de arquivos temporários

**Formato:** Dashboard executivo compacto`
            }
          }
        ]
      };

    case 'whm_resource_usage_trends':
      return {
        description: `Tendências de uso de recursos (${period_days} dias)`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `📈 **TENDÊNCIAS DE USO DE RECURSOS (${period_days} dias)**

**Análise de Capacidade:**

💾 **Disco:**
- Uso atual total: X GB / Y GB (Z%)
- Crescimento no período: +X GB
- Previsão de esgotamento: W dias

🌐 **Banda:**
- Transferência total no período: X TB
- Média diária: Y GB/dia
- TOP 5 contas consumidoras

⚙️ **CPU/RAM:**
- Uso médio de CPU: X%
- Picos de uso: Y% (quando?)
- Processos problemáticos identificados

📊 **Tendências:**
- Crescimento de disco: +X% vs. período anterior
- Tendência de banda: Aumentando/Estável/Diminuindo
- Contas com crescimento acelerado

⚠️ **Alertas de Capacidade:**
- Servidor atingirá 80% disco em: X dias
- Contas para upgrade de quota
- Necessidade de expansão de storage

🎯 **Planejamento:**
- Capacidade adicional necessária
- Contas candidatas para migração
- Investimento recomendado

**Formato:** Relatório de tendências com projeções`
            }
          }
        ]
      };

    case 'whm_security_posture':
      return {
        description: `Postura de segurança - Verificação: ${check_type}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🔒 **POSTURA DE SEGURANÇA - ${check_type.toUpperCase()}**

**Análise de Segurança:**

${check_type === 'all' || check_type === 'ssl' ? `
🔐 **SSL/TLS:**
- Certificados expirados: X
- Certificados expirando (<30 dias): Y
- Domínios sem SSL: Z
- Ciphers seguros configurados: Sim/Não
` : ''}

${check_type === 'all' || check_type === 'firewall' ? `
🛡️ **Firewall (CSF/ConfigServer):**
- Status: Ativo/Inativo
- Regras configuradas: X
- IPs bloqueados: Y
- Tentativas de invasão (últimas 24h): Z
` : ''}

${check_type === 'all' || check_type === 'updates' ? `
🔄 **Updates e Patches:**
- cPanel/WHM atualizado: Sim/Não
- Versão atual: X.Y.Z
- Updates disponíveis: W
- Packages desatualizados: X
` : ''}

🚨 **Vulnerabilidades Identificadas:**
- Críticas: X (CORRIGIR URGENTE)
- Altas: Y (Atenção necessária)
- Médias: Z

📋 **Compliance:**
- Two-Factor Auth habilitado: Sim/Não
- Políticas de senha fortes: Sim/Não
- Backups criptografados: Sim/Não
- Logs de auditoria ativos: Sim/Não

🎯 **Ações Corretivas:**
1. Instalação de SSL pendente: X domínios
2. Atualização de software: Y packages
3. Hardening recomendado: Z itens

**Formato:** Security scorecard executivo`
            }
          }
        ]
      };

    case 'whm_ssl_certificate_inventory':
      return {
        description: `Inventário SSL (expirando em ${expiring_days} dias)`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🔐 **INVENTÁRIO DE CERTIFICADOS SSL**
**Alerta:** Expirando em ${expiring_days} dias

**Status de Certificados:**

✅ **Certificados Válidos:**
- Total de domínios com SSL: X
- Certificados Let's Encrypt: Y
- Certificados comerciais: Z

⚠️ **Alertas de Expiração:**
- Expirando nos próximos ${expiring_days} dias: X domínios
- Lista de domínios críticos:
  1. domain1.com - Expira em X dias
  2. domain2.com - Expira em Y dias
  3. domain3.com - Expira em Z dias

🚨 **Certificados Expirados:**
- Total expirado: X
- Impacto: Sites com aviso de segurança
- Ação urgente necessária

🔄 **Auto-Renovação:**
- AutoSSL habilitado: Sim/Não
- Domínios com auto-renovação: X
- Domínios SEM auto-renovação: Y

📊 **Por Tipo:**
- Let's Encrypt (gratuito): X domínios
- Wildcard: Y domínios
- EV (Extended Validation): Z domínios

🎯 **Ações Necessárias:**
- Renovar manualmente: X certificados
- Habilitar AutoSSL: Y domínios
- Investigar falhas de renovação: Z casos

**Formato:** Inventário com priorização de ações`
            }
          }
        ]
      };

    case 'whm_backup_coverage':
      return {
        description: account_name ? `Cobertura de backup - ${account_name}` : 'Cobertura global de backups',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `💾 **COBERTURA DE BACKUPS${account_name ? `: ${account_name}` : ' (GLOBAL)'}**

**Análise de Proteção:**

✅ **Contas com Backup:**
- Total de contas: X
- Contas com backup configurado: Y (Z%)
- Último backup bem-sucedido: Data/hora

📅 **Frequência de Backup:**
- Diário: X contas
- Semanal: Y contas
- Mensal: Z contas

⚠️ **Contas SEM Backup:**
- Total sem backup: X
- Lista de contas em risco:
  1. account1
  2. account2
  3. account3

💾 **Espaço de Backup:**
- Storage total usado: X GB
- Localização: /backup (local) ou remoto
- Dias de retenção: Y dias

🚨 **Problemas Identificados:**
- Backups falhados (últimas 24h): X
- Contas com backup desatualizado (>7 dias): Y
- Espaço insuficiente para backup: Sim/Não

📊 **Estatísticas:**
- Tamanho médio de backup por conta: X MB
- Tempo médio de backup: Y min
- Taxa de compressão: Z%

🎯 **Recomendações:**
- Habilitar backup para: X contas
- Aumentar frequência de backup: Y contas
- Migrar backups para storage remoto: Sim/Não

**Formato:** Relatório de compliance de backup`
            }
          }
        ]
      };

    case 'whm_dns_zone_health':
      return {
        description: domain ? `Saúde DNS - ${domain}` : 'Saúde de todas as zonas DNS',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🌐 **SAÚDE DE ZONAS DNS${domain ? `: ${domain}` : ' (GLOBAL)'}**

**Análise de DNS:**

✅ **Status de Propagação:**
- Zonas DNS ativas: X
- Propagação completa: Y (Z%)
- Nameservers corretos: Sim/Não

📋 **Registros Críticos:**
- Registros A: X
- Registros MX: Y (Email)
- Registros TXT (SPF/DKIM): Z
- Registros CNAME: W

⚠️ **Problemas Identificados:**
- Registros MX inválidos: X domínios
- SPF mal configurado: Y domínios
- DNSSEC não configurado: Z domínios
- TTL muito alto (>24h): W registros

🔍 **Verificação de Propagação:**
- Propagado em todos os nameservers: Sim/Não
- Tempo desde última alteração: X horas
- Nameservers respondendo: Y/Z

🚨 **Alertas:**
- Zonas com erros de sintaxe: X
- Domínios apontando para IP errado: Y
- Registros duplicados/conflitantes: Z

🎯 **Ações Corretivas:**
- Corrigir registros MX: X domínios
- Adicionar SPF/DKIM: Y domínios
- Reduzir TTL para migração: Z domínios

**Formato:** Health check de DNS com troubleshooting`
            }
          }
        ]
      };

    case 'whm_email_deliverability':
      return {
        description: domain ? `Entregabilidade de email - ${domain}` : 'Análise global de entregabilidade',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `📧 **ANÁLISE DE ENTREGABILIDADE DE EMAIL${domain ? `: ${domain}` : ' (GLOBAL)'}**

**Status de Autenticação:**

🔐 **SPF (Sender Policy Framework):**
- Configurado: Sim/Não
- Sintaxe válida: Sim/Não
- Inclui todos os IPs de envio: Sim/Não
- Registro SPF: \`v=spf1 ...\`

🔑 **DKIM (DomainKeys Identified Mail):**
- Habilitado: Sim/Não
- Chave publicada em DNS: Sim/Não
- Seletor: default._domainkey
- Verificação de assinatura: OK/FALHA

🛡️ **DMARC (Domain-based Message Authentication):**
- Configurado: Sim/Não
- Política: none/quarantine/reject
- RUA (relatórios): Configurado/Não configurado
- Registro DMARC: \`v=DMARC1; p=...\`

🚨 **Blacklists:**
- IP do servidor em blacklist: X listas
- Domínio em blacklist: Y listas
- Listas críticas (Spamhaus, Barracuda): OK/BLOQUEADO

📊 **Estatísticas de Entrega:**
- Taxa de rejeição: X%
- Emails em quarentena: Y
- Bounce rate: Z%

⚠️ **Problemas Identificados:**
- rDNS (Reverse DNS) incorreto: Sim/Não
- TLS/SSL para SMTP: Habilitado/Desabilitado
- Autenticação SMTP ausente: X contas
- Rate limiting ativo: Sim/Não

🎯 **Melhorias Recomendadas:**
1. Configurar DMARC com política reject
2. Remover IP de blacklist: X listas
3. Habilitar DKIM para todos os domínios
4. Configurar rDNS correto

**Formato:** Scorecard de entregabilidade com ações`
            }
          }
        ]
      };

    // ============================================
    // PROMPTS ANALISTA
    // ============================================

    case 'whm_account_quick_lookup':
      return {
        description: `Busca rápida: ${search_term}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🔍 **BUSCA RÁPIDA DE CONTA**
**Termo:** ${search_term}

**Informações Encontradas:**

👤 **Conta cPanel:**
- Usuário: ${search_term}
- Domínio principal: example.com
- Email de contato: admin@example.com

📊 **Uso de Recursos:**
- Disco: X MB / Y MB (Z%)
- Banda (mês atual): W GB
- Inodes: A / B

🌐 **Domínios Configurados:**
- Domínio principal: example.com
- Addon domains: X
- Subdomínios: Y
- Parked domains: Z

📧 **Email:**
- Contas de email: X
- Forwarders: Y
- Lista de emails: Z

⚠️ **Status:**
- Conta ativa/suspensa
- Último login: Data/hora
- IP dedicado: Sim/Não
- SSL instalado: Sim/Não

🎯 **Ações Rápidas:**
- Resetar senha
- Suspender/Reativar conta
- Acessar cPanel como usuário

**Formato:** Info card compacto para WhatsApp`
            }
          }
        ]
      };

    case 'whm_dns_troubleshooting':
      return {
        description: `Troubleshoot DNS - ${domain}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🔧 **TROUBLESHOOTING DNS**
**Domínio:** ${domain}

**Diagnóstico Completo:**

🔍 **1. Verificação de Nameservers:**
\`\`\`
dig ${domain} NS +short
\`\`\`
- Nameservers configurados: ns1.example.com, ns2.example.com
- Propagação completa: Sim/Não
- Nameservers respondendo: X/Y

🌐 **2. Resolução de IP:**
\`\`\`
dig ${domain} A +short
\`\`\`
- IP resolvido: X.X.X.X
- IP correto (servidor WHM): Sim/Não
- TTL: X segundos

📧 **3. Registros MX (Email):**
\`\`\`
dig ${domain} MX +short
\`\`\`
- MX principal: mail.${domain} (prioridade 0)
- Aponta para IP correto: Sim/Não

📋 **4. Registros TXT (SPF/DKIM):**
\`\`\`
dig ${domain} TXT +short
\`\`\`
- SPF presente: Sim/Não
- DKIM configurado: Sim/Não

🚨 **Problemas Encontrados:**
1. [CRÍTICO] Registro A aponta para IP incorreto
2. [AVISO] Nameserver ns2 não responde
3. [INFO] TTL muito alto para migração

🎯 **Solução Passo-a-Passo:**
1. Corrigir registro A no DNS Manager
2. Verificar nameserver ns2.example.com
3. Aguardar propagação (até X horas)
4. Validar com: \`dig ${domain} +trace\`

**Formato:** Troubleshooting técnico executável`
            }
          }
        ]
      };

    case 'whm_email_setup_guide':
      return {
        description: `Configurar email - ${email_address}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `📧 **GUIA DE CONFIGURAÇÃO DE EMAIL**
**Email:** ${email_address}

**PASSO 1: Criar Conta de Email no cPanel**

1. Login no cPanel da conta
2. Seção "Email" > "Email Accounts"
3. Clicar em "Create"
4. Preencher:
   - Email: ${email_address.split('@')[0]}
   - Password: (gerar senha forte)
   - Quota: 250 MB (ou ilimitado)
5. Clicar em "Create"

**PASSO 2: Configurações para Cliente de Email**

📱 **IMAP (Recomendado - sincroniza em todos os dispositivos):**
- Servidor de entrada (IMAP): mail.${email_address.split('@')[1]}
- Porta: 993
- Segurança: SSL/TLS
- Usuário: ${email_address}
- Senha: [a senha criada]

📤 **SMTP (Envio):**
- Servidor de saída (SMTP): mail.${email_address.split('@')[1]}
- Porta: 465 (SSL) ou 587 (TLS)
- Segurança: SSL/TLS
- Autenticação: Sim
- Usuário: ${email_address}
- Senha: [a mesma senha]

**PASSO 3: Configuração Manual (se necessário)**

🖥️ **Outlook/Thunderbird:**
- Tipo de conta: IMAP
- Servidor: mail.${email_address.split('@')[1]}
- Portas: 993 (IMAP) / 465 (SMTP)

📱 **Celular (Android/iOS):**
- Adicionar conta > Outra
- Tipo: IMAP
- Mesmas configurações acima

**PASSO 4: Testar Configuração**

✅ Enviar email de teste
✅ Receber email de teste
✅ Verificar pastas sincronizadas

🎯 **Troubleshooting Comum:**
- Erro de autenticação → Verificar senha
- Não conecta → Verificar firewall (portas 993, 465, 587)
- Emails não chegam → Verificar SPF/DKIM

**Formato:** Tutorial passo-a-passo ilustrado`
            }
          }
        ]
      };

    case 'whm_ssl_installation_guide':
      return {
        description: `Instalar SSL - ${domain}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🔐 **GUIA DE INSTALAÇÃO DE SSL**
**Domínio:** ${domain}

**MÉTODO 1: AutoSSL (Let's Encrypt - Gratuito) [RECOMENDADO]**

📋 **Passo-a-Passo:**

1. **Verificar Pré-requisitos:**
   - Domínio resolvendo para o IP do servidor: ✅/❌
   - Porta 80 aberta no firewall: ✅/❌
   - AutoSSL habilitado no WHM: ✅/❌

2. **Instalação Automática:**
   - WHM > SSL/TLS > Manage AutoSSL
   - Localizar domínio: ${domain}
   - Clicar em "Run AutoSSL"
   - Aguardar processamento (1-2 min)

3. **Verificação:**
   - Acessar: https://${domain}
   - Cadeado verde no navegador: ✅
   - Certificado válido até: [data de expiração]

**MÉTODO 2: SSL Comercial (Manual)**

📋 **Passo-a-Passo:**

1. **Gerar CSR (Certificate Signing Request):**
   - WHM > SSL/TLS > Generate SSL Certificate and Signing Request
   - Preencher:
     - Domain: ${domain}
     - Organization: Nome da Empresa
     - Country: BR
   - Copiar CSR gerado

2. **Comprar Certificado:**
   - Enviar CSR para autoridade certificadora
   - Aguardar emissão (alguns minutos a horas)
   - Baixar certificado + bundle

3. **Instalar Certificado:**
   - WHM > SSL/TLS > Install SSL Certificate on a Domain
   - Domínio: ${domain}
   - Certificate: [colar certificado]
   - Private Key: [colar chave privada]
   - CA Bundle: [colar bundle]
   - Clicar em "Install"

**VERIFICAÇÃO FINAL:**

✅ Testar HTTPS: https://${domain}
✅ Verificar SSL com: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}
✅ Force HTTPS redirect (.htaccess):
\`\`\`
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
\`\`\`

🎯 **Troubleshooting:**
- Erro "Domain control validation failed" → Verificar DNS
- Certificado não aparece → Limpar cache do navegador
- Mixed content warnings → Atualizar URLs http:// para https://

**Formato:** Tutorial técnico com comandos`
            }
          }
        ]
      };

    case 'whm_website_down_investigation':
      return {
        description: `Investigar site fora - ${domain}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `🚨 **INVESTIGAÇÃO - SITE FORA DO AR**
**Domínio:** ${domain}

**DIAGNÓSTICO COMPLETO:**

🔍 **1. Verificação de Conectividade:**
\`\`\`
ping ${domain}
\`\`\`
- Servidor responde: Sim/Não
- Pacotes perdidos: X%
- Latência: Y ms

🌐 **2. Resolução DNS:**
\`\`\`
dig ${domain} A +short
\`\`\`
- IP resolvido: X.X.X.X
- IP correto: Sim/Não
- Tempo de propagação: OK/PENDENTE

🖥️ **3. Status do Servidor Web:**
\`\`\`
curl -I http://${domain}
\`\`\`
- HTTP Status Code: XXX
- Apache/Nginx respondendo: Sim/Não
- Tempo de resposta: X ms

📂 **4. Verificação de Arquivos:**
- DocumentRoot: /home/usuario/public_html
- Arquivos presentes: Sim/Não
- Permissões corretas (755/644): Sim/Não
- .htaccess válido: Sim/Não

💾 **5. Uso de Recursos da Conta:**
- Quota de disco: X% usado
- Conta suspensa: Sim/Não
- Limite de processos: OK/EXCEDIDO

🗄️ **6. Banco de Dados (se aplicável):**
- MySQL rodando: Sim/Não
- Conexão ao DB: OK/FALHA
- Erro comum: "Error establishing database connection"

📋 **7. Logs de Erro:**
\`\`\`
tail -n 50 /home/usuario/logs/error_log
\`\`\`
- Erros recentes: [listar últimos 5 erros]

🚨 **PROBLEMAS IDENTIFICADOS:**

1. [CRÍTICO] HTTP 500 - Internal Server Error
   - Causa provável: .htaccess com erro de sintaxe
   - Linha problemática: RewriteRule inválida

2. [AVISO] Uso de CPU alto
   - Processo responsável: php-fpm
   - Ação: Investigar scripts pesados

**SOLUÇÃO PASSO-A-PASSO:**

✅ **Imediata (Restaurar acesso):**
1. Renomear .htaccess → .htaccess.bak
2. Verificar site: http://${domain}
3. Se funcionar, corrigir .htaccess

✅ **Investigação (Causa raiz):**
1. Analisar error_log completo
2. Verificar últimas mudanças em arquivos
3. Testar com PHP error reporting habilitado

✅ **Preventiva:**
1. Implementar monitoramento (UptimeRobot)
2. Backup automático configurado
3. Documentar mudanças em produção

**Formato:** Runbook de troubleshooting técnico`
            }
          }
        ]
      };

    case 'whm_disk_usage_alert':
      return {
        description: `Alerta de disco - ${account_name}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `⚠️ **ALERTA DE USO DE DISCO**
**Conta:** ${account_name}

**Status de Consumo:**

💾 **Uso Total:**
- Quota: X GB
- Usado: Y GB (Z%)
- Disponível: W GB

📊 **Breakdown por Tipo:**
- Arquivos web: X GB (Y%)
- Emails: A GB (B%)
- Bancos de dados: C GB (D%)
- Logs: E GB (F%)
- Backups locais: G GB (H%)

📈 **Tendência de Crescimento:**
- Crescimento diário: +X MB/dia
- Previsão de esgotamento: W dias
- Comparação com mês anterior: +Y%

🔝 **TOP 10 Diretórios Maiores:**
1. /public_html/uploads - X GB
2. /mail/example.com - Y GB
3. /public_html/wp-content - Z GB
4. [continuar lista...]

📧 **Uso de Email:**
- Caixas de email: X contas
- Maior caixa: usuario@domain.com (Y GB)
- Emails antigos (>1 ano): Z GB

🗄️ **Bancos de Dados:**
- Total de databases: X
- Maior database: dbname (Y MB)
- Tabelas fragmentadas: Z

🎯 **Ações de Limpeza Recomendadas:**

1. **Imediata (liberar X GB):**
   - Limpar logs antigos: /logs/ → Y GB
   - Remover backups locais: /backups/ → Z GB
   - Esvaziar lixeira de emails → W GB

2. **Curto Prazo (otimizar Y GB):**
   - Comprimir imagens antigas: /uploads/ → X GB
   - Arquivar emails antigos (>6 meses)
   - Otimizar tabelas MySQL (OPTIMIZE TABLE)

3. **Longo Prazo:**
   - Implementar política de limpeza automática
   - Upgrade de plano se uso legítimo
   - Migrar backups para storage externo

🔧 **Comandos Úteis:**
\`\`\`bash
# Encontrar maiores arquivos
du -h /home/${account_name}/ | sort -rh | head -20

# Limpar cache (se WordPress)
wp cache flush --path=/home/${account_name}/public_html

# Otimizar MySQL
mysqlcheck -o dbname
\`\`\`

**Formato:** Alerta executivo com ações prioritizadas`
            }
          }
        ]
      };

    case 'whm_domain_migration_checklist':
      return {
        description: `Checklist de migração - ${domain_from} → ${domain_to}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `📦 **CHECKLIST DE MIGRAÇÃO DE DOMÍNIO**
**Origem:** ${domain_from}
**Destino:** ${domain_to}

**PRÉ-MIGRAÇÃO (PREPARAÇÃO):**

✅ **1. Auditoria de Conteúdo:**
- [ ] Backup completo do servidor origem
- [ ] Listar todos os domínios/subdomínios
- [ ] Inventário de contas de email
- [ ] Mapear bancos de dados
- [ ] Documentar configurações especiais (.htaccess, cron)

✅ **2. Infraestrutura no Destino:**
- [ ] Criar conta cPanel em ${domain_to}
- [ ] Alocar recursos suficientes (disco, RAM)
- [ ] Configurar PHP/MySQL nas mesmas versões
- [ ] Preparar SSL (AutoSSL ou comercial)

✅ **3. Comunicação:**
- [ ] Notificar cliente sobre janela de migração
- [ ] Agendar horário de baixo tráfego
- [ ] Preparar rollback plan

**DURANTE A MIGRAÇÃO:**

🔄 **4. Transferência de Arquivos:**
\`\`\`bash
# No servidor destino:
rsync -avz --progress usuario@${domain_from}:/home/usuario/ /home/novo_usuario/
\`\`\`
- [ ] public_html migrado
- [ ] Permissões preservadas (755/644)
- [ ] Ownership correto

🗄️ **5. Migração de Bancos de Dados:**
\`\`\`bash
# Exportar no origem:
mysqldump -u user -p dbname > dbname.sql

# Importar no destino:
mysql -u user -p new_dbname < dbname.sql
\`\`\`
- [ ] Todos os bancos exportados/importados
- [ ] Atualizar credenciais (config.php, wp-config.php)

📧 **6. Migração de Emails:**
- [ ] Criar todas as contas de email no destino
- [ ] Migrar emails (IMAP sync ou rsync de /mail/)
- [ ] Testar envio/recebimento

🌐 **7. Configuração de DNS:**
- [ ] Reduzir TTL para 300s (5 min) - 24h ANTES
- [ ] Atualizar registro A para IP de ${domain_to}
- [ ] Atualizar MX records se necessário
- [ ] Configurar SPF/DKIM no novo servidor

**PÓS-MIGRAÇÃO:**

✅ **8. Testes de Validação:**
- [ ] Site carrega corretamente: https://${domain_from}
- [ ] Formulários funcionam (contact form)
- [ ] Login de admin funciona
- [ ] Checkout/pagamento (se ecommerce)
- [ ] Emails enviam e recebem
- [ ] SSL ativo e válido

📊 **9. Monitoramento (primeiras 48h):**
- [ ] Verificar logs de erro
- [ ] Monitorar performance (tempo de carregamento)
- [ ] Validar propagação DNS global
- [ ] Acompanhar tickets de suporte

🔙 **10. Rollback Plan (se necessário):**
- [ ] Reverter DNS para servidor origem
- [ ] Aguardar propagação
- [ ] Investigar problemas antes de nova tentativa

**LIMPEZA (7 dias após migração):**

- [ ] Aumentar TTL de volta para 86400s (24h)
- [ ] Remover arquivos temporários de migração
- [ ] Documentar configurações específicas
- [ ] Arquivar backups do servidor origem
- [ ] Desativar servidor origem (após 30 dias)

🎯 **ATENÇÕES ESPECIAIS:**

⚠️ **WordPress:**
- [ ] Atualizar wp-config.php com novas credenciais de DB
- [ ] Executar search-replace em URLs (se mudou domínio)
- [ ] Limpar cache (plugins, CDN)
- [ ] Regenerar permalinks

⚠️ **E-commerce (WooCommerce/Magento):**
- [ ] Testar gateway de pagamento
- [ ] Validar integração de envio
- [ ] Verificar carrinho e checkout

⚠️ **APIs/Integrações:**
- [ ] Atualizar webhooks (PayPal, Stripe, etc.)
- [ ] Atualizar IPs autorizados em APIs externas
- [ ] Testar integrações críticas

**Formato:** Checklist executável com validações`
            }
          }
        ]
      };

    case 'whm_backup_restore_guide':
      return {
        description: `Restaurar backup - ${account_name} (${backup_date})`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `💾 **GUIA DE RESTAURAÇÃO DE BACKUP**
**Conta:** ${account_name}
**Backup:** ${backup_date}

**MÉTODO 1: Restauração via WHM (Completa)**

📋 **Passo-a-Passo:**

1. **Localizar Backup:**
   - WHM > Backup > Backup Restoration
   - Selecionar data: ${backup_date}
   - Buscar conta: ${account_name}
   - Verificar disponibilidade: ✅/❌

2. **Restaurar Conta Completa:**
   - Clicar em "Restore" ao lado de ${account_name}
   - Opções de restauração:
     - [ ] Home Directory (arquivos)
     - [ ] MySQL Databases
     - [ ] Email Forwarders & Filters
     - [ ] DNS Zones
   - Marcar todas (ou específicas)
   - Clicar em "Restore"

3. **Aguardar Processamento:**
   - Tempo estimado: 5-30 min (depende do tamanho)
   - Acompanhar logs: /usr/local/cpanel/logs/cpbackup/

4. **Validação:**
   - Acessar site: verificar conteúdo restaurado
   - Testar login cPanel
   - Verificar emails funcionando
   - Validar bancos de dados

**MÉTODO 2: Restauração Parcial (Arquivos Específicos)**

📂 **Via cPanel:**

1. **Acessar Backup Manager:**
   - Login cPanel da conta
   - File Manager > Backup Wizard

2. **Restaurar Arquivos:**
   - Select Restore → Home Directory
   - Escolher backup: ${backup_date}
   - Selecionar arquivos/pastas específicos
   - Clicar em "Restore"

3. **Restaurar Banco de Dados:**
   - cPanel > Backup Wizard
   - Restore → MySQL Database
   - Selecionar database específico
   - Fazer upload do arquivo .sql.gz

**MÉTODO 3: Restauração Manual (SSH)**

🖥️ **Via Linha de Comando:**

1. **Localizar Arquivo de Backup:**
\`\`\`bash
# Backups geralmente em:
ls -lh /backup/*/accounts/${account_name}*

# Ou localização customizada:
find /backup* -name "${account_name}*" -mtime -30
\`\`\`

2. **Extrair Backup:**
\`\`\`bash
# Backup cPanel (formato .tar.gz):
cd /home
tar -xzvf /backup/path/to/${account_name}.tar.gz

# Ou usar script cPanel:
/scripts/restorepkg ${account_name}
\`\`\`

3. **Restaurar Banco de Dados Específico:**
\`\`\`bash
# Extrair SQL do backup:
tar -xzvf /backup/${account_name}.tar.gz ${account_name}/mysql/database.sql

# Importar:
mysql -u ${account_name}_user -p ${account_name}_dbname < database.sql
\`\`\`

**TROUBLESHOOTING COMUM:**

🚨 **Problemas e Soluções:**

❌ **"Backup not found"**
- Verificar retenção de backup (WHM > Backup Configuration)
- Procurar em localizações alternativas
- Contatar suporte se backup deveria existir

❌ **"Disk quota exceeded"**
- Aumentar temporariamente quota da conta
- Limpar arquivos antigos antes de restaurar
- Restaurar parcialmente

❌ **"Database already exists"**
- Renomear database existente (backup de segurança)
- Ou dropar database: \`DROP DATABASE dbname;\`
- Recriar e importar

❌ **"Permission denied"**
- Verificar ownership: \`chown -R ${account_name}:${account_name} /home/${account_name}\`
- Corrigir permissões: \`find /home/${account_name}/public_html -type d -exec chmod 755 {} \\;\`

**VALIDAÇÃO PÓS-RESTORE:**

✅ **Checklist de Testes:**
- [ ] Site carrega sem erros
- [ ] Imagens e CSS carregam
- [ ] Formulários funcionam
- [ ] Login de admin OK
- [ ] Bancos de dados acessíveis
- [ ] Emails enviando/recebendo
- [ ] Cron jobs ativos
- [ ] SSL funcionando

📊 **Verificar Integridade:**
\`\`\`bash
# Contar arquivos restaurados:
find /home/${account_name}/public_html -type f | wc -l

# Verificar tamanho total:
du -sh /home/${account_name}/

# Testar conexão MySQL:
mysql -u ${account_name}_user -p -e "SHOW DATABASES;"
\`\`\`

🎯 **DOCUMENTAÇÃO:**
- Registrar data/hora da restauração
- Anotar quais componentes foram restaurados
- Documentar problemas encontrados
- Comunicar cliente sobre restauração completa

**Formato:** Runbook de restore com troubleshooting`
            }
          }
        ]
      };

    default:
      throw new Error(`Prompt desconhecido: ${name}`);
  }
}

/**
 * Handler para listar prompts (MCP protocol)
 */
function handleListPrompts() {
  return {
    prompts: WHM_PROMPTS
  };
}

/**
 * Handler para obter prompt específico (MCP protocol)
 */
async function handleGetPrompt(name, args, whmClient) {
  const prompt = WHM_PROMPTS.find(p => p.name === name);

  if (!prompt) {
    throw new Error(`Prompt não encontrado: ${name}`);
  }

  return await getPromptText(name, args, whmClient);
}

/**
 * Exporta funções em formato CommonJS
 */
module.exports = {
  WHM_PROMPTS,
  handleWHMPrompt: handleGetPrompt,
  handleListPrompts,
  handleGetPrompt
};
