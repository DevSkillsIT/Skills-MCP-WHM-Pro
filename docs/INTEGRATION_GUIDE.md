# Guia de Integração - Módulos de Suporte WHM-cPanel

**Data:** 7 de Dezembro de 2025
**Versão:** 1.0.0
**Status:** Pronto para Integração

---

## Visão Geral

Este guia descreve como integrar os 6 módulos de suporte nos handlers de tools existentes do MCP WHM-cPanel.

---

## 1. Importação dos Módulos

### Padrão de Importação

```javascript
// No início do seu arquivo de handler
const aclValidator = require('../lib/acl-validator');
const pathValidator = require('../lib/path-validator');
const lockManager = require('../lib/lock-manager');
const txnLog = require('../lib/transaction-log');
const errorMapper = require('../lib/error-mapper');
const nsec3Handler = require('../lib/nsec3-async-handler');
const logger = require('../lib/logger');
```

---

## 2. Integração por Tipo de Operação

### A. Operações de Autorização (ACL Validator)

**Quando usar:** Em TODAS as tools que acessam dados de usuários

```javascript
async function handleDomainList(token, username) {
  // 1. Validar autorização
  const acl = aclValidator.validateUserAccess(token, username);
  if (!acl.allowed) {
    logger.warn('Unauthorized domain access attempt', { username });
    return {
      status: 'error',
      code: 'UNAUTHORIZED',
      message: acl.reason
    };
  }

  // 2. Continuar com operação autorizada
  // ... resto do código ...
}
```

### B. Operações com Caminhos de Arquivo (Path Validator)

**Quando usar:** Em operações que acessam document_root ou diretórios do usuário

```javascript
async function handleFileOperation(username, documentRoot, filePath) {
  // 1. Validar document_root base
  const pathValidation = pathValidator.validateDocumentRoot(documentRoot, username);
  if (!pathValidation.valid) {
    logger.error('Invalid document root', { username, error: pathValidation.error });
    return {
      status: 'error',
      code: 'INVALID_PATH',
      message: pathValidation.error
    };
  }

  // 2. Usar caminho sanitizado
  const safePath = pathValidation.sanitized;

  // 3. Verificar se um diretório é restrito
  const dirName = path.basename(documentRoot);
  if (pathValidator.isRestrictedDir(dirName)) {
    return {
      status: 'error',
      code: 'ACCESS_DENIED',
      message: `Diretório ${dirName} não pode ser acessado`
    };
  }

  // 4. Continuar com operação segura
  // ... resto do código ...
}
```

### C. Operações Concorrentes (Lock Manager)

**Quando usar:** Em operações que modificam domínios, contas ou configurações

```javascript
async function handleDomainCreate(username, domain, config) {
  const resourceId = `domain:${domain}`;

  // 1. Tentar adquirir lock
  const lockResult = lockManager.acquireLock(resourceId, 30000);
  if (!lockResult.acquired) {
    logger.warn('Failed to acquire lock', { domain, error: lockResult.error });
    return {
      status: 'error',
      code: 'RESOURCE_BUSY',
      message: lockResult.error
    };
  }

  const lockId = lockResult.lockId;

  try {
    // 2. Executar operação com lock
    const result = await createDomain(username, domain, config);

    // 3. Liberar lock
    lockManager.releaseLock(resourceId);

    return {
      status: 'success',
      data: result
    };

  } catch (error) {
    // Liberar lock em caso de erro
    lockManager.releaseLock(resourceId);

    const mappedError = errorMapper.mapWhmError(error);
    logger.error('Domain creation failed', { domain, error: mappedError });

    return {
      status: 'error',
      code: mappedError.type,
      message: mappedError.message,
      retry: mappedError.retry
    };
  }
}
```

### D. Operações com Backup/Rollback (Transaction Log)

**Quando usar:** Em operações críticas que precisam suportar reversão

```javascript
async function handleDomainUpdate(username, domain, newConfig) {
  // 1. Iniciar transação com backup
  const txn = txnLog.beginTransaction({
    type: 'domain_update',
    domain,
    username,
    previousConfig: await getCurrentConfig(domain),
    newConfig
  });

  try {
    // 2. Executar atualização
    const result = await updateDomain(domain, newConfig);

    // 3. Confirmar transação
    const commitResult = txnLog.commitTransaction(txn.transactionId);
    if (!commitResult.error) {
      logger.info('Domain updated successfully', { domain, txnId: txn.transactionId });
      return { status: 'success', data: result };
    }

  } catch (error) {
    // 4. Em caso de erro, reverter
    const rollbackResult = txnLog.rollbackTransaction(txn.transactionId);

    if (!rollbackResult.error) {
      logger.info('Transaction rolled back', {
        domain,
        txnId: txn.transactionId,
        backup: rollbackResult.backup
      });

      // Restaurar estado anterior
      await restoreDomain(rollbackResult.backup.previousConfig);
    }

    const mappedError = errorMapper.mapWhmError(error);
    return {
      status: 'error',
      code: mappedError.type,
      message: 'Falha na atualização, estado anterior restaurado'
    };
  }
}
```

### E. Tratamento de Erros (Error Mapper)

**Quando usar:** Em todo tratamento de erros da API

```javascript
async function handleApiCall(operation) {
  try {
    const result = await executeOperation(operation);
    return { status: 'success', data: result };

  } catch (error) {
    // Mapear erro para tipo estruturado
    const mappedError = errorMapper.mapWhmError(error);

    logger.error('Operation failed', {
      operation,
      errorType: mappedError.type,
      severity: mappedError.severity
    });

    // Decidir se deve fazer retry automático
    if (errorMapper.isRecoverable(mappedError)) {
      const maxRetries = mappedError.retry.maxRetries;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const backoff = errorMapper.getRetryBackoff(mappedError, attempt);

        logger.info('Retrying operation', {
          operation,
          attempt: attempt + 1,
          delayMs: backoff
        });

        // Aguardar backoff
        await new Promise(resolve => setTimeout(resolve, backoff));

        try {
          const result = await executeOperation(operation);
          return { status: 'success', data: result };
        } catch (retryError) {
          // Continuar no loop
        }
      }
    }

    // Se não recuperável ou esgotou tentativas, retornar erro
    return {
      status: 'error',
      code: mappedError.type,
      message: mappedError.message,
      severity: mappedError.severity,
      canRetry: errorMapper.isRecoverable(mappedError)
    };
  }
}
```

### F. Operações Assíncronas Longas (NSEC3 Async Handler)

**Quando usar:** Em operações que demoram mais de alguns segundos (NSEC3, sincronização, etc)

```javascript
async function handleNsec3Recalculate(username, domains) {
  // 1. Calcular timeout baseado em número de domínios
  const timeout = nsec3Handler.calculateNsec3Timeout(domains);

  logger.info('NSEC3 recalculation started', {
    domainCount: domains.length,
    timeoutMs: timeout
  });

  // 2. Iniciar operação assíncrona
  const operation = nsec3Handler.startAsyncOperation(
    null, // gera novo ID
    'recalculate',
    domains
  );

  // 3. Retornar operationId ao cliente (para polling posterior)
  return {
    status: 'started',
    operationId: operation.operationId,
    timeout: operation.timeout,
    message: 'NSEC3 recalculation in progress'
  };
}

// Cliente faz polling para obter progresso
async function checkNsec3Progress(operationId) {
  const status = nsec3Handler.getOperationStatus(operationId);

  if (!status.error) {
    return {
      operationId,
      status: status.status,
      progress: status.progress,
      completedSteps: status.completedSteps,
      totalSteps: status.totalSteps,
      elapsed: status.elapsed
    };
  }

  return {
    error: status.error,
    operationId
  };
}

// Worker em background atualiza progresso
async function workerProcessNsec3(operationId, domains) {
  const totalDomains = domains.length;

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];

    try {
      // Processar domínio
      await recalculateNsec3(domain);

      // Atualizar progresso
      const progress = Math.round((i + 1) / totalDomains * 100);
      nsec3Handler.updateOperationProgress(operationId, progress, {
        completedSteps: i + 1,
        currentDomain: domain
      });

    } catch (error) {
      nsec3Handler.failOperation(operationId, error.message);
      logger.error('NSEC3 recalculation failed', {
        operationId,
        domain,
        error: error.message
      });
      break;
    }
  }
}
```

---

## 3. Exemplo Completo: Criar Domínio com Todas as Proteções

```javascript
async function createDomainWithAllProtections(token, username, domainConfig) {
  try {
    // 1. VALIDAR AUTORIZAÇÃO (ACL)
    const acl = aclValidator.validateUserAccess(token, username);
    if (!acl.allowed) {
      throw new Error(`ACL denied: ${acl.reason}`);
    }

    // 2. VALIDAR CAMINHO (Path Validator)
    if (domainConfig.documentRoot) {
      const pathVal = pathValidator.validateDocumentRoot(
        domainConfig.documentRoot,
        username
      );
      if (!pathVal.valid) {
        throw new Error(`Invalid path: ${pathVal.error}`);
      }
      domainConfig.documentRoot = pathVal.sanitized;
    }

    // 3. ADQUIRIR LOCK (Lock Manager)
    const lockId = `domain:${domainConfig.domain}`;
    const lock = lockManager.acquireLock(lockId, 30000);
    if (!lock.acquired) {
      throw new Error(`Cannot acquire lock: ${lock.error}`);
    }

    // 4. INICIAR TRANSAÇÃO (Transaction Log)
    const txn = txnLog.beginTransaction({
      type: 'domain_create',
      username,
      domain: domainConfig.domain,
      config: domainConfig
    });

    try {
      // 5. EXECUTAR OPERAÇÃO
      const result = await whm.createDomain(domainConfig);

      // 6. CONFIRMAR TRANSAÇÃO
      txnLog.commitTransaction(txn.transactionId);

      logger.info('Domain created successfully', {
        username,
        domain: domainConfig.domain,
        txnId: txn.transactionId
      });

      return {
        status: 'success',
        domain: result,
        transactionId: txn.transactionId
      };

    } catch (error) {
      // 7. REVERTER EM CASO DE ERRO
      txnLog.rollbackTransaction(txn.transactionId);

      // 8. MAPEAR ERRO E DECIDIR RETRY
      const mappedError = errorMapper.mapWhmError(error);

      logger.error('Domain creation failed', {
        username,
        domain: domainConfig.domain,
        error: mappedError.type,
        retry: mappedError.retry
      });

      throw mappedError;

    } finally {
      // 9. LIBERAR LOCK
      lockManager.releaseLock(lockId);
    }

  } catch (error) {
    const mappedError = errorMapper.mapWhmError(error);
    return {
      status: 'error',
      code: mappedError.type,
      message: mappedError.message,
      retry: mappedError.retry
    };
  }
}
```

---

## 4. Padrões de Código

### Validação de Entrada

```javascript
// Sempre validar entrada ANTES de usar dados
function validateInput(params) {
  // 1. Tipo
  if (typeof params.username !== 'string') {
    throw new Error('username deve ser string');
  }

  // 2. Conteúdo
  const aclResult = aclValidator.validateUserAccess(params.token, params.username);
  if (!aclResult.allowed) {
    throw new Error('Unauthorized');
  }

  // 3. Segurança
  if (params.path) {
    const pathResult = pathValidator.validateDocumentRoot(params.path, params.username);
    if (!pathResult.valid) {
      throw new Error(pathResult.error);
    }
  }
}
```

### Tratamento de Erros

```javascript
// Sempre mapear erros para tipos conhecidos
async function safeExecute(operation) {
  try {
    return await operation();
  } catch (error) {
    const mapped = errorMapper.mapWhmError(error);
    logger.error('Operation failed', { error: mapped });
    throw mapped;
  }
}
```

### Limpeza de Recursos

```javascript
// Sempre liberar recursos (locks, transações, etc)
async function safeOperation(resource) {
  const lock = lockManager.acquireLock(resource);
  if (!lock.acquired) throw new Error(lock.error);

  try {
    return await doWork();
  } finally {
    lockManager.releaseLock(resource);
  }
}
```

---

## 5. Configuração Recomendada

### Timeouts

```javascript
// Lock Manager
const LOCK_TIMEOUT = 30000; // 30 segundos (padrão adequado)

// NSEC3 Handler
// Timeouts calculados automaticamente baseado em número de domínios
const BASE_TIMEOUT = 60000; // 60 segundos
const PER_DOMAIN = 30000;   // 30 segundos por domínio
const MAX_TIMEOUT = 600000; // 10 minutos máximo
```

### Retry

```javascript
// Error Mapper
// Cada tipo de erro tem retry configurado:
// EBUSY: 3 tentativas, 1s inicial
// ETIMEDOUT: 2 tentativas, 2s inicial
// RATE_LIMITED: 5 tentativas, 5s inicial

// Exponential backoff: baseDelay * (2 ^ attemptNumber)
// 1ª tentativa: 1s
// 2ª tentativa: 2s
// 3ª tentativa: 4s
// 4ª tentativa: 8s (máx 3 progressões)
```

### Cleanup

```javascript
// Agendar limpeza periódica
setInterval(() => {
  // Limpar operações NSEC3 > 60 min
  nsec3Handler.cleanupOldOperations(60);

  // Limpar transações > 24h
  txnLog.cleanupOldTransactions(24);

  logger.debug('Scheduled cleanup completed');
}, 60 * 60 * 1000); // A cada hora
```

---

## 6. Monitoramento e Observabilidade

### Métricas Recomendadas

```javascript
// Expor métricas periodicamente
setInterval(() => {
  const lockStats = lockManager.getLockStats();
  const txnStats = txnLog.getTransactionStats();
  const opStats = nsec3Handler.getOperationStats();

  logger.info('System metrics', {
    locks: {
      total: lockStats.totalLocks,
      resources: lockStats.resources.length
    },
    transactions: txnStats,
    operations: opStats
  });

}, 5 * 60 * 1000); // A cada 5 minutos
```

### Alertas Recomendados

```javascript
// Alertar quando há locks antigos (possível deadlock)
if (lock.remainingTime < 5000) {
  logger.warn('Lock expiring soon', { resource, remainingTime: lock.remainingTime });
}

// Alertar quando há muitas transações pendentes
if (txnStats.pending > 10) {
  logger.warn('High pending transaction count', { pending: txnStats.pending });
}

// Alertar quando há operações em progresso > timeout
if (opStatus.elapsed > opStatus.timeout) {
  nsec3Handler.failOperation(operationId, 'Operation timeout');
}
```

---

## 7. Testes de Integração

### Teste de ACL

```bash
# Validar que root pode acessar qualquer conta
curl -X POST /tools/account-list \
  -H 'Authorization: Bearer root:admin' \
  -H 'X-Username: john'
# Esperado: ✓ Sucesso

# Validar que usuário normal só acessa sua conta
curl -X POST /tools/account-list \
  -H 'Authorization: Bearer user:john' \
  -H 'X-Username: jane'
# Esperado: ✗ Unauthorized
```

### Teste de Locks

```bash
# Iniciar operação que demora
curl -X POST /tools/domain-create \
  -d '{"domain":"test1.com"}' &

# Tentar mesma operação ao mesmo tempo
curl -X POST /tools/domain-create \
  -d '{"domain":"test1.com"}'
# Esperado: ✗ Resource busy (2ª requisição)
```

### Teste de Transações

```bash
# Provocar erro durante operação
# Verificar que rollback funciona
# Confirmar que estado anterior é restaurado
```

---

## 8. Troubleshooting

### Problema: "Resource busy" frequente

**Causa:** Locks não são liberados em erro
**Solução:** Adicionar `finally` para liberar locks

```javascript
try {
  // operação
} finally {
  lockManager.releaseLock(resource); // sempre executado
}
```

### Problema: Transações não podem ser revertidas

**Causa:** Tentando rollback de transação já confirmada
**Solução:** Verificar estado antes de reverter

```javascript
const status = txnLog.getTransactionStatus(txnId);
if (status.data.status === 'pending') {
  txnLog.rollbackTransaction(txnId);
}
```

### Problema: NSEC3 timeout muito curto

**Causa:** Fórmula de timeout não adequada ao seu ambiente
**Solução:** Ajustar constantes em nsec3-async-handler.js

```javascript
// Aumentar timeouts (multiplique por fator)
const BASE_TIMEOUT_MS = 60000 * 2; // 2 minutos
const DOMAIN_TIMEOUT_MS = 30000 * 2; // 60s por domínio
```

---

## Conclusão

Os 6 módulos estão prontos para integração. Siga os padrões descritos neste guia para manter consistência e segurança em toda a aplicação.

Para dúvidas sobre uso específico, consulte a documentação técnica em `SUPPORT_MODULES.md`.
