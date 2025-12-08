# Módulos de Suporte - WHM-cPanel MCP Server

## Visão Geral

Implementação de 6 módulos de suporte essenciais para operações seguras e confiáveis do MCP WHM-cPanel.

---

## 1. ACL Validator (acl-validator.js)

**Requisito:** RS02 - CC-04 (Validação de Autorização)

### Responsabilidade
Valida autorização de usuários para acessar recursos.

### Principais Funções

```javascript
const aclValidator = require('./acl-validator');

// Validar acesso de um usuário a um recurso
const result = aclValidator.validateUserAccess('root:admin', 'example.com');
// {
//   allowed: true,
//   reason: 'Acesso root autorizado'
// }

// Extrair tipo de usuário
const userType = aclValidator.extractUserType('reseller:reseller1');
// 'reseller'

// Extrair identificador
const identifier = aclValidator.extractUserIdentifier('user:john');
// 'john'
```

### Modelo de Token
Formato: `{tipo}:{identificador}`

- **root**: Acesso total a todas operações
- **reseller**: Acesso às contas sob sua jurisdição
- **user/usuario**: Acesso apenas à própria conta

---

## 2. Path Validator (path-validator.js)

**Requisito:** RS03 (Validação de Document Root)

### Responsabilidade
Valida caminhos de document_root para prevenir path traversal e acesso a diretórios restritos.

### Principais Funções

```javascript
const pathValidator = require('./path-validator');

// Validar documento root
const validation = pathValidator.validateDocumentRoot('/home/john/public_html', 'john');
// {
//   valid: true,
//   sanitized: '/home/john/public_html',
//   error: null
// }

// Verificar se diretório é restrito
const isRestricted = pathValidator.isRestrictedDir('.ssh');
// true

// Obter lista de diretórios restritos
const restricted = pathValidator.getRestrictedDirs();
// ['.ssh', '.cpanel', '.gnupg', 'etc', 'mail', 'tmp', ...]

// Sanitizar caminho
const sanitized = pathValidator.sanitizePath('/home//john///public_html');
// '/home/john/public_html'
```

### Diretórios Restritos Bloqueados
- `.ssh`, `.cpanel`, `.gnupg`, `etc`, `mail`, `tmp`, `.bash_history`, `.cache`, `.local`, `.config`

### Proteções
- Prevenção de path traversal (`..`, `\`)
- Bloqueio de shell metacharacters em nomes
- Validação de base path (`/home/{username}/`)

---

## 3. Lock Manager (lock-manager.js)

**Requisito:** CC-05 (Gerenciamento de Locks)

### Responsabilidade
Gerencia locks exclusivos para operações concorrentes em recursos.

### Principais Funções

```javascript
const lockManager = require('./lock-manager');

// Adquirir lock com timeout de 30s
const acquire = lockManager.acquireLock('domain:example.com', 30000);
// {
//   acquired: true,
//   lockId: 'a1b2c3d4e5f6...',
//   error: null
// }

// Verificar se recurso está locked
const locked = lockManager.isLocked('domain:example.com');
// {
//   locked: true,
//   lockInfo: {
//     lockId: 'a1b2c3d4e5f6...',
//     elapsedTime: 5000,
//     remainingTime: 25000,
//     totalTimeout: 30000
//   }
// }

// Liberar lock
const release = lockManager.releaseLock('domain:example.com');
// {
//   released: true,
//   error: null
// }

// Obter estatísticas
const stats = lockManager.getLockStats();
// {
//   totalLocks: 3,
//   resources: [...]
// }
```

### Características
- Locks exclusivos em memória
- Timeout automático (padrão: 30s)
- Detecção e limpeza automática de locks stale
- Limite de timeout máximo: 10 minutos

---

## 4. Transaction Log (transaction-log.js)

**Requisito:** CC-06 (Sistema de Transações)

### Responsabilidade
Registra transações com backup para suporte a rollback.

### Principais Funções

```javascript
const txnLog = require('./transaction-log');

// Iniciar transação
const begin = txnLog.beginTransaction({
  type: 'domain_create',
  domain: 'example.com',
  username: 'john'
});
// {
//   transactionId: 'txn_a1b2c3d4...',
//   status: 'pending',
//   backup: { type: 'domain_create', ... }
// }

// Confirmar transação
const commit = txnLog.commitTransaction('txn_a1b2c3d4...');
// {
//   status: 'committed',
//   error: null
// }

// Reverter transação
const rollback = txnLog.rollbackTransaction('txn_a1b2c3d4...');
// {
//   status: 'rolled_back',
//   backup: { type: 'domain_create', ... },
//   error: null
// }

// Consultar status
const status = txnLog.getTransactionStatus('txn_a1b2c3d4...');
// {
//   status: 'committed',
//   data: { transactionId, status, duration, ... },
//   error: null
// }

// Listar transações ativas
const active = txnLog.getActiveTransactions();
// [{ transactionId, operationType, duration }, ...]

// Limpar transações antigas (>24h)
const cleaned = txnLog.cleanupOldTransactions(24);
// 5 (removidas)

// Obter estatísticas
const stats = txnLog.getTransactionStats();
// { total: 10, pending: 2, committed: 7, rolledBack: 1 }
```

### Estados de Transação
- `pending`: Aguardando commit/rollback
- `committed`: Confirmada e completada
- `rolled_back`: Revertida

---

## 5. Error Mapper (error-mapper.js)

**Requisito:** CI-07 (Mapeamento de Erros)

### Responsabilidade
Mapeia erros WHM para tipos estruturados com informações de retry.

### Principais Funções

```javascript
const errorMapper = require('./error-mapper');

// Mapear erro
const mapped = errorMapper.mapWhmError({
  code: 'EBUSY',
  message: 'Resource temporarily busy'
});
// {
//   type: 'EBUSY',
//   message: 'Recurso ocupado, tente novamente',
//   originalMessage: 'Resource temporarily busy',
//   retry: {
//     shouldRetry: true,
//     maxRetries: 3,
//     backoffMs: 1000
//   },
//   severity: 'medium',
//   timestamp: 1702000000000
// }

// Verificar se erro é recuperável
const recoverable = errorMapper.isRecoverable(mapped);
// true

// Obter backoff para tentativa N
const backoff = errorMapper.getRetryBackoff(mapped, 0); // 1ª tentativa
// 1000 (1 segundo)

// Listar tipos de erro
const types = errorMapper.getErrorTypes();
// ['EEXIST', 'ENOENT', 'EPERM', 'EBUSY', ...]

// Obter config de retry
const config = errorMapper.getRetryConfig('RATE_LIMITED');
// { shouldRetry: true, maxRetries: 5, backoffMs: 5000, ... }
```

### Tipos de Erro Suportados

#### Sistema Operacional
- `EEXIST`: Arquivo/recurso já existe
- `ENOENT`: Arquivo/recurso não encontrado
- `EPERM`: Operação não permitida
- `EBUSY`: Recurso em uso

#### Rede/Timeout
- `ETIMEDOUT`: Operação expirou
- `ECONNREFUSED`: Conexão recusada

#### API/Taxa Limite
- `RATE_LIMITED`: Limite de taxa excedido
- `QUOTA_EXCEEDED`: Cota excedida

#### Autenticação
- `UNAUTHORIZED`: Não autorizado
- `FORBIDDEN`: Acesso proibido

#### Servidor
- `INTERNAL_ERROR`: Erro interno
- `SERVICE_UNAVAILABLE`: Serviço indisponível

### Configuração de Retry
Cada tipo de erro tem configuração específica:
- `shouldRetry`: Deve tentar novamente
- `maxRetries`: Número máximo de tentativas
- `backoffMs`: Delay inicial em ms (exponential backoff)

---

## 6. NSEC3 Async Handler (nsec3-async-handler.js)

**Requisito:** CC-03 (Operações NSEC3 Assíncronas)

### Responsabilidade
Gerencia operações NSEC3 assíncronas com rastreamento de progresso.

### Principais Funções

```javascript
const nsec3Handler = require('./nsec3-async-handler');

// Calcular timeout dinâmico
const timeout = nsec3Handler.calculateNsec3Timeout(['example.com', 'test.com']);
// 60000 + (30000 * 2) = 120000 (2 minutos)

// Iniciar operação assíncrona
const start = nsec3Handler.startAsyncOperation(
  null, // gera novo ID
  'recalc',
  ['example.com', 'test.com']
);
// {
//   operationId: 'nsec3_a1b2c3d4...',
//   status: 'queued',
//   timeout: 120000,
//   error: null
// }

// Obter status da operação
const status = nsec3Handler.getOperationStatus('nsec3_a1b2c3d4...');
// {
//   status: 'in_progress',
//   progress: 50,
//   completedSteps: 1,
//   totalSteps: 2,
//   elapsed: 5000,
//   timeout: 120000,
//   result: null,
//   error: null
// }

// Atualizar progresso
const update = nsec3Handler.updateOperationProgress(
  'nsec3_a1b2c3d4...',
  100,
  { result: { processed: 2 } }
);
// { updated: true, error: null }

// Registrar callback de progresso
nsec3Handler.onOperationProgress('nsec3_a1b2c3d4...', (data) => {
  console.log(`Progresso: ${data.progress}%`);
});

// Marcar operação como falhada
const fail = nsec3Handler.failOperation(
  'nsec3_a1b2c3d4...',
  'Erro ao processar domínio example.com'
);

// Obter estatísticas
const stats = nsec3Handler.getOperationStats();
// { total: 5, queued: 1, inProgress: 2, completed: 1, failed: 1, cancelled: 0 }

// Limpar operações antigas
const cleaned = nsec3Handler.cleanupOldOperations(60); // >60 min
// 3 (removidas)
```

### Cálculo de Timeout
**Fórmula:** `60s + (30s * número_domínios)`, máximo 600s

Exemplos:
- 1 domínio: 90s
- 2 domínios: 120s
- 3 domínios: 150s
- 10+ domínios: 600s (máximo)

### Estados de Operação
- `queued`: Na fila, aguardando início
- `in_progress`: Em execução
- `completed`: Completada com sucesso
- `failed`: Falhou
- `cancelled`: Cancelada

---

## Integração no Projeto

### Exemplo de Uso Combinado

```javascript
const aclValidator = require('./acl-validator');
const pathValidator = require('./path-validator');
const lockManager = require('./lock-manager');
const txnLog = require('./transaction-log');
const errorMapper = require('./error-mapper');
const nsec3Handler = require('./nsec3-async-handler');

async function safeDomainCreate(token, username, domain, documentRoot) {
  try {
    // 1. Validar ACL
    const acl = aclValidator.validateUserAccess(token, username);
    if (!acl.allowed) {
      throw new Error(acl.reason);
    }

    // 2. Validar caminho
    const pathVal = pathValidator.validateDocumentRoot(documentRoot, username);
    if (!pathVal.valid) {
      throw new Error(pathVal.error);
    }

    // 3. Adquirir lock
    const lock = lockManager.acquireLock(`domain:${domain}`, 30000);
    if (!lock.acquired) {
      throw new Error(lock.error);
    }

    // 4. Iniciar transação
    const txn = txnLog.beginTransaction({
      type: 'domain_create',
      domain,
      username,
      documentRoot: pathVal.sanitized
    });

    // 5. Iniciar operação NSEC3
    const op = nsec3Handler.startAsyncOperation(null, 'create', [domain]);

    try {
      // ... executar operação ...
      nsec3Handler.updateOperationProgress(op.operationId, 50);
      // ... continuar ...
      nsec3Handler.updateOperationProgress(op.operationId, 100);

      // Confirmar transação
      txnLog.commitTransaction(txn.transactionId);

      return { success: true, operationId: op.operationId };
    } catch (error) {
      // Reverter em caso de erro
      txnLog.rollbackTransaction(txn.transactionId);
      nsec3Handler.failOperation(op.operationId, error.message);

      const mappedError = errorMapper.mapWhmError(error);
      throw mappedError;
    } finally {
      // Liberar lock
      lockManager.releaseLock(`domain:${domain}`);
    }
  } catch (error) {
    const mappedError = errorMapper.mapWhmError(error);
    return { success: false, error: mappedError };
  }
}
```

---

## Logger Integration

Todos os módulos utilizam o logger centralizado:

```javascript
const logger = require('./logger');

// Logs automáticos em todas as operações
logger.info('ACL access granted: root user', { user: 'admin' });
logger.warn('Path traversal attempt detected', { path: 'redacted' });
logger.debug('Lock acquired', { resourceId, lockId, timeoutMs });
logger.error('Operation failed', { operationId, error });
```

---

## Testing & Validation

### Testes Básicos de Importação

```bash
# Testar importação de todos os módulos
node -e "
const acl = require('./src/lib/acl-validator');
const path = require('./src/lib/path-validator');
const lock = require('./src/lib/lock-manager');
const txn = require('./src/lib/transaction-log');
const err = require('./src/lib/error-mapper');
const nsec3 = require('./src/lib/nsec3-async-handler');
console.log('✓ Todos os módulos importados com sucesso');
"
```

---

## Checklist de Implementação

- [x] ACL Validator (RS02 - CC-04)
- [x] Path Validator (RS03)
- [x] Lock Manager (CC-05)
- [x] Transaction Log (CC-06)
- [x] Error Mapper (CI-07)
- [x] NSEC3 Async Handler (CC-03)

---

## Versão

- **Data:** 7 de Dezembro de 2025
- **Linguagem:** JavaScript (CommonJS)
- **Dependências:** Internas (usa logger existente)
- **Node.js Mínimo:** 14.0.0

---

## Próximos Passos

1. Integrar módulos nas handlers de tools
2. Escrever testes unitários para cada módulo
3. Adicionar testes de integração
4. Atualizar documentação do MCP
5. Realizar testes E2E com ferramentas reais
