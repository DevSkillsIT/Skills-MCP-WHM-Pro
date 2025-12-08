# Quick Reference - Módulos de Suporte WHM-cPanel

## Importação Rápida

```javascript
const acl = require('./src/lib/acl-validator');
const path = require('./src/lib/path-validator');
const lock = require('./src/lib/lock-manager');
const txn = require('./src/lib/transaction-log');
const err = require('./src/lib/error-mapper');
const nsec3 = require('./src/lib/nsec3-async-handler');
```

---

## 1. ACL Validator

### Funções Principais

| Função | Uso |
|--------|-----|
| `validateUserAccess(token, username)` | Verifica autorização |
| `extractUserType(token)` | Extrai tipo (root, reseller, user) |
| `extractUserIdentifier(token)` | Extrai identificador |

### Exemplo

```javascript
// Verificar autorização
const result = acl.validateUserAccess('root:admin', 'example.com');
if (result.allowed) {
  // Autorizado
} else {
  console.error(result.reason);
}
```

### Formato de Token
```
root:admin           // Root - acesso total
reseller:reseller1   // Reseller - contas sob jurisdição
user:john            // User - própria conta apenas
```

---

## 2. Path Validator

### Funções Principais

| Função | Uso |
|--------|-----|
| `validateDocumentRoot(path, username)` | Valida caminho |
| `isRestrictedDir(dirname)` | Verifica se bloqueado |
| `getRestrictedDirs()` | Lista de bloqueados |
| `sanitizePath(path)` | Sanitiza caminho |

### Exemplo

```javascript
// Validar documento root
const v = path.validateDocumentRoot('/home/john/public_html', 'john');
if (v.valid) {
  // Usar v.sanitized
} else {
  console.error(v.error);
}

// Verificar se diretório é bloqueado
if (path.isRestrictedDir('.ssh')) {
  console.log('Acesso negado!');
}
```

### Diretórios Bloqueados
`.ssh`, `.cpanel`, `.gnupg`, `etc`, `mail`, `tmp`, `.bash_history`, `.cache`, `.local`, `.config`

---

## 3. Lock Manager

### Funções Principais

| Função | Uso |
|--------|-----|
| `acquireLock(resource, timeout)` | Adquire lock |
| `releaseLock(resource)` | Libera lock |
| `isLocked(resource)` | Verifica status |
| `getLockStats()` | Estatísticas |

### Exemplo

```javascript
// Adquirir lock
const l = lock.acquireLock('domain:example.com', 30000);
if (l.acquired) {
  try {
    // Operação segura
  } finally {
    lock.releaseLock('domain:example.com');
  }
} else {
  console.error(l.error);
}

// Verificar status
const status = lock.isLocked('domain:example.com');
if (status.locked) {
  console.log(`Liberado em ${status.lockInfo.remainingTime}ms`);
}
```

### Defaults
- Timeout padrão: 30s
- Máximo: 10 min
- Limpeza stale: 5s

---

## 4. Transaction Log

### Funções Principais

| Função | Uso |
|--------|-----|
| `beginTransaction(data)` | Inicia com backup |
| `commitTransaction(txnId)` | Confirma |
| `rollbackTransaction(txnId)` | Reverte |
| `getTransactionStatus(txnId)` | Status |
| `getActiveTransactions()` | Lista ativas |
| `cleanupOldTransactions(hours)` | Limpeza |

### Exemplo

```javascript
// Iniciar transação
const t = txn.beginTransaction({ type: 'op', data: {} });

try {
  // Operação
  txn.commitTransaction(t.transactionId);
} catch (err) {
  // Reverter
  txn.rollbackTransaction(t.transactionId);
}
```

### Estados
- `pending`: Aguardando
- `committed`: Confirmada
- `rolled_back`: Revertida

---

## 5. Error Mapper

### Funções Principais

| Função | Uso |
|--------|-----|
| `mapWhmError(error)` | Mapeia erro |
| `isRecoverable(mapped)` | Pode fazer retry? |
| `getRetryBackoff(mapped, attempt)` | Delay em ms |
| `getErrorTypes()` | Lista tipos |
| `getRetryConfig(type)` | Config do tipo |

### Exemplo

```javascript
// Mapear erro
const m = err.mapWhmError(new Error('timeout'));
console.log(m.type); // ETIMEDOUT
console.log(m.severity); // medium
console.log(m.retry); // { shouldRetry: true, maxRetries: 2, ... }

// Verificar retry
if (err.isRecoverable(m)) {
  const delay = err.getRetryBackoff(m, 0); // 1ª tentativa
  // Aguardar delay e retomar
}
```

### Tipos Suportados (14)
`EEXIST`, `ENOENT`, `EPERM`, `EBUSY`, `ETIMEDOUT`, `ECONNREFUSED`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `INVALID_INPUT`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`

---

## 6. NSEC3 Async Handler

### Funções Principais

| Função | Uso |
|--------|-----|
| `calculateNsec3Timeout(domains)` | Timeout dinâmico |
| `startAsyncOperation(id, type, domains)` | Inicia op |
| `getOperationStatus(opId)` | Status |
| `updateOperationProgress(opId, %)` | Atualiza |
| `failOperation(opId, msg)` | Marca falha |
| `onOperationProgress(opId, callback)` | Callback |
| `getOperationStats()` | Estatísticas |
| `cleanupOldOperations(mins)` | Limpeza |

### Exemplo

```javascript
// Calcular timeout
const timeout = nsec3.calculateNsec3Timeout(['ex1.com', 'ex2.com']);
// 60000 + (30000 * 2) = 120000ms

// Iniciar operação
const o = nsec3.startAsyncOperation(null, 'create', ['example.com']);
console.log(o.operationId); // nsec3_a1b2c3d4...

// Atualizar progresso
nsec3.updateOperationProgress(o.operationId, 50);
nsec3.updateOperationProgress(o.operationId, 100);

// Registrar callback
nsec3.onOperationProgress(o.operationId, (data) => {
  console.log(`Progresso: ${data.progress}%`);
});
```

### Cálculo de Timeout
```
Base: 60s
Por domínio: +30s cada
Máximo: 10min

1 domínio: 90s
2 domínios: 120s
10 domínios: 600s (máximo)
```

### Estados
`queued`, `in_progress`, `completed`, `failed`, `cancelled`

---

## Padrão Completo: Operação Segura

```javascript
async function safeOperation(token, username, resource) {
  // 1. ACL
  const acl = aclValidator.validateUserAccess(token, username);
  if (!acl.allowed) throw new Error(acl.reason);

  // 2. Lock
  const lock = lockManager.acquireLock(`op:${resource}`, 30000);
  if (!lock.acquired) throw new Error(lock.error);

  // 3. Transaction
  const txn = txnLog.beginTransaction({ type: 'operation', resource });

  try {
    // 4. Operação
    const result = await doWork();

    // 5. Confirmar
    txnLog.commitTransaction(txn.transactionId);
    return result;

  } catch (error) {
    // 6. Reverter
    txnLog.rollbackTransaction(txn.transactionId);

    // 7. Mapear erro
    const mapped = errorMapper.mapWhmError(error);
    throw mapped;

  } finally {
    // 8. Liberar
    lockManager.releaseLock(`op:${resource}`);
  }
}
```

---

## Checklist de Uso

### Em Toda Tool
- [ ] Adicionar validação ACL no início
- [ ] Usar try/catch com error mapping
- [ ] Logar operações importantes

### Em Operações Críticas
- [ ] Adquirir lock exclusivo
- [ ] Iniciar transação com backup
- [ ] Confirmar/reverter apropriadamente

### Em Operações Longas
- [ ] Calcular timeout dinâmico
- [ ] Iniciar async operation
- [ ] Atualizar progresso periodicamente
- [ ] Limpar operações antigas

---

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| "Resource busy" | Liberar lock em finally |
| Autorização negada | Verificar token e username |
| Path inválido | Usar validateDocumentRoot() |
| Timeout muito curto | Aumentar multiplicador em NSEC3 |
| Rollback falha | Verificar se txn está pending |

---

## Documentação Completa

- **SUPPORT_MODULES.md** - Documentação técnica detalhada
- **IMPLEMENTATION_SUMMARY.md** - Resumo de implementação
- **INTEGRATION_GUIDE.md** - Guia de integração com exemplos
- **Código-fonte** - JSDoc em cada arquivo

---

## Contato / Suporte

Para dúvidas sobre implementação, consulte os documentos acima ou analise o código-fonte que contém comentários detalhados em português-BR.

---

**Versão:** 1.0.0
**Data:** 7 de Dezembro de 2025
**Status:** Pronto para Produção ✅
