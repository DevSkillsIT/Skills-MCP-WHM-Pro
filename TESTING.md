# TESTING.md - Guia de Testes MCP WHM/cPanel (SPEC-NOVAS-FEATURES-WHM-001 v1.4.0)

Este guia cobre os testes manuais para validar as novas features de domínio/DNS (22 tools) e hardening de segurança aplicados ao MCP WHM/cPanel.

## 0. Pré-requisitos

1) Servidor rodando (`npm start` ou `pm2 start mcp-whm-cpanel`).  
2) `.env` configurado com `WHM_HOST`, `WHM_API_TOKEN`, `MCP_PORT` e `MCP_SAFETY_TOKEN`.  
3) Headers prontos:
   - `x-api-key: $MCP_API_KEY` (obrigatório)
   - `X-MCP-ACL-Token: root:admin` (ou reseller:user) para validar RS02
   - `X-MCP-Safety-Token: $MCP_SAFETY_TOKEN` para operações destrutivas (body tem precedência)
4) Use domínios descartáveis para ações destrutivas (ex.: `acaidafazenda.com.br` ou um domínio de lab).

```bash
export MCP_HOST="http://mcp.servidor.one:3200"
export MCP_API_KEY="sk_whm_mcp_prod_CHANGE_ME"
export MCP_SAFETY_TOKEN="CHANGE_ME_CONFIRMATION"
export MCP_ACL_TOKEN="root:admin"  # ou reseller:meu_reseller / user:cpaneluser
```

> ⚠️ **SafetyGuard**: domain.delete, domain.addon.start_conversion, domain.enable_nsec3, domain.disable_nsec3, domain.update_userdomains, dns.delete_record e file.delete exigem token + `reason` (>=10 chars).

---

## 1. Smoke Tests

### 1.1 Health
```bash
curl -X GET $MCP_HOST/health
```
Esperado: `status=healthy`, `service=skills-mcp-whm-pro`, `version=1.4.0`.

### 1.2 Autenticação obrigatória
```bash
curl -X POST $MCP_HOST/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
Esperado: HTTP 401 (missing x-api-key).

### 1.3 Tools list (45 tools)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
Verificar presença de:
- domain.* (get_user_data, get_all_info, get_owner, create_alias, create_subdomain, delete, resolve, check_authority, addon.*, ds, nsec3, update_userdomains)
- dns.* (list_zones, get_zone, add/edit/delete/reset, list_mx, add_mx, check_alias_available)
- whm.*, system.*, file.*, log.*

---

## 2. Domínio – Informação (RF01-RF03, RNF07)

### 2.1 domain.get_user_data
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_user_data","arguments":{"domain":"exemplo.com.br"}},"id":10}'
```
Esperado: success=true com usuário/documentroot; erro claro se domínio inválido (RS01).

### 2.2 domain.get_all_info (paginação obrigatória)
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_all_info","arguments":{}},"id":11}'
```
Esperado: `data.pagination` com `total/limit/offset/has_more/next_offset`.  
Repetir com `{"limit":50,"offset":50,"filter":"addon"}` e validar filtro + next_offset.

### 2.3 domain.get_owner
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_owner","arguments":{"domain":"exemplo.com.br"}},"id":12}'
```
Esperado: owner retornado; erro se domínio inválido.

---

## 3. Domínio – Gestão e Segurança (RF10-RF13, RF21, RS03)

### 3.1 domain.create_alias (idempotente)
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.create_alias","arguments":{"domain":"aliaslab.com.br","username":"cpuser"}},"id":20}'
```
Repetir o mesmo comando; esperado `idempotent=true` na segunda chamada.

### 3.2 domain.create_subdomain com docroot válido
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.create_subdomain","arguments":{"subdomain":"api","domain":"exemplo.com.br","username":"cpuser","document_root":"/home/cpuser/api"}},"id":21}'
```
Esperado: success; docroot sanitizado.  
Teste negativo (RS03):
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.create_subdomain","arguments":{"subdomain":"api","domain":"exemplo.com.br","username":"cpuser","document_root":"/home/cpuser/../etc"}},"id":22}'
```
Esperado: erro contendo "cannot contain .." ou diretório restrito.

### 3.3 domain.delete (SafetyGuard – usar domínio descartável)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.delete","arguments":{"domain":"test.aliaslab.com.br","username":"cpuser","type":"subdomain","reason":"Remocao de teste automatizado"}},"id":23}'
```
Esperado: success ou erro claro de autorização; header é aceito mesmo sem `confirmationToken` no body.

### 3.4 domain.resolve
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.resolve","arguments":{"domain":"exemplo.com.br"}},"id":24}'
```
Esperado: IP resolvido ou erro de DNS.

### 3.5 domain.update_userdomains (lock + SafetyGuard)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.update_userdomains","arguments":{"reason":"Sincronizacao pos-manutencao"}},"id":25}'
```
Esperado: success. Se outro processo estiver rodando, erro 409 com mensagem "Resource busy".

---

## 4. Addon Conversions (RF04-RF09)

- `domain.addon.list`:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.list","arguments":{"username":"cpuser"}},"id":30}'
```
- `domain.addon.details`:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.details","arguments":{"domain":"addon.exemplo.com.br","username":"cpuser"}},"id":31}'
```
- `domain.addon.conversion_status`:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.conversion_status","arguments":{"conversion_id":"conv_123"}},"id":32}'
```
- `domain.addon.start_conversion` (SafetyGuard):
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.addon.start_conversion","arguments":{"domain":"addon.exemplo.com.br","username":"cpuser","new_username":"novocp","reason":"Teste de conversao automatizada"}},"id":33}'
```
- `domain.addon.conversion_details` / `domain.addon.list_conversions`: verificar que retornam status, timestamps e steps.

Esperado: erros claros se conversion_id inválido; SafetyGuard exigido em start_conversion.

---

## 5. DNS Autoridade e MX (RF14-RF16)

### 5.1 domain.check_authority
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.check_authority","arguments":{"domain":"exemplo.com.br"}},"id":40}'
```

### 5.2 dns.list_mx / dns.add_mx (idempotência)
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.add_mx","arguments":{"domain":"exemplo.com.br","exchange":"mail.exemplo.com.br","priority":10}},"id":41}'
```
Repetir o mesmo comando: esperado `idempotent=true` na segunda chamada.

---

## 6. DNSSEC / DS / ALIAS (RF17-RF18)

### 6.1 domain.get_ds_records
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_ds_records","arguments":{"domains":["exemplo.com.br"]}},"id":50}'
```
Esperado: DS records quando DNSSEC ativo; caso contrário erro claro:  
`"DNSSEC não configurado ou endpoint WHM indisponível..."` (sem timeout >30s).

### 6.2 dns.check_alias_available
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.check_alias_available","arguments":{"zone":"exemplo.com.br","name":"cdn"}},"id":51}'
```
Esperado: `available=true/false` ou erro claro `"Checagem de ALIAS não suportada..."` se endpoint faltar. Chamada não deve pendurar.

---

## 7. NSEC3 Assíncrono (RF19-RF20-RF22)

### 7.1 domain.enable_nsec3 (SafetyGuard)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.enable_nsec3","arguments":{"domains":["exemplo.com.br"],"reason":"Habilitar NSEC3 para teste"}},"id":60}'
```
Esperado: `operation_id`, `status=pending`, `estimated_timeout` <= 600s, `polling_interval=5000`.

### 7.2 domain.get_nsec3_status
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_nsec3_status","arguments":{"operation_id":"<OP_ID>"}},"id":61}'
```
Esperado: status `pending|in_progress|completed|failed`, `progress_percent`, timestamps; erro claro se operation_id inexistente.

### 7.3 domain.disable_nsec3 (similar ao enable)
Repetir chamada com `domain.disable_nsec3` e mesmo fluxo de polling.

---

## 8. Segurança e Validações (RS01-RS04)

- **SafetyGuard via header**: repetir domain.delete enviando header e body diferentes; body tem precedência.
- **Domain Validation (RS01)**:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain.get_user_data","arguments":{"domain":"invalido.com; rm -rf /"}},"id":70}'
```
Esperado: erro "Domain contains shell metacharacters" / similar.

- **ACL (RS02)**: enviar `X-MCP-ACL-Token: user:outro` para criar subdomínio de outro usuário e esperar erro `Access denied:`.

- **Document Root (RS03)**: já coberto em 3.2 negativo.

- **SafetyGuard tokens sanitizados (RS04)**: verificar logs não exibem tokens; operações com header funcionam.

---

## 9. Observabilidade e Timeouts (RNF01-RNF04)

- **/metrics**:
```bash
curl -X GET $MCP_HOST/metrics
```
Esperado: métricas `whm_domain_operations_total`, `whm_domain_operation_duration_seconds`, `whm_safety_guard_validations_total`, `whm_rate_limit_hits_total`.

- **Timeouts**: domain.get_ds_records e dns.check_alias_available devem responder em <= `WHM_TIMEOUT` (default 30s) com mensagem clara; NSEC3 segue cálculo dinâmico `60s + 30s * dom` (máx 600s).

---

## 10. Checklist Rápido

| Item | Status |
|------|--------|
| Health / Auth / tools.list (45) | [ ] |
| domain.get_user_data / get_all_info / get_owner | [ ] |
| create_alias / create_subdomain / delete / resolve | [ ] |
| addon list/details/status/start/details/list | [ ] |
| check_authority / list_mx / add_mx idempotente | [ ] |
| get_ds_records / check_alias_available | [ ] |
| enable/disable_nsec3 + get_nsec3_status | [ ] |
| update_userdomains (lock) | [ ] |
| SafetyGuard header + ACL validation | [ ] |
| Metrics + timeout behavior | [ ] |

---

## Troubleshooting

- **Timeout em DS/ALIAS**: agora retorna erro claro; se demorar >30s, verifique conectividade WHM ou suporte do endpoint.  
- **Access denied (ACL)**: confirme header `X-MCP-ACL-Token` no formato `root:...`, `reseller:...` ou `user:...`.  
- **SafetyGuard**: header é aceito; body tem precedência. Reason precisa de >=10 caracteres.  
- **Lock em update_userdomains**: se erro 409, aguardar liberação do lock ou revisar processo concorrente.  
- **Logs**: `pm2 logs mcp-whm-cpanel --err --lines 50` (tokens devem aparecer como `[REDACTED]`).  
- **WHM connect**: teste direto `curl -k "https://$WHM_HOST:2087/json-api/version?api.version=1" -H "Authorization: whm root:$WHM_API_TOKEN"`.

---

## Anexo: Roteiro legado (AC01-AC18) v1.1.0

> Mantido para compatibilidade/regressão. Use quando precisar reproduzir o roteiro antigo completo.

### Pré-requisitos (legado)
```bash
export MCP_HOST="http://mcp.servidor.one:3200"
export MCP_API_KEY="sk_whm_mcp_prod_CHANGE_ME"
export MCP_SAFETY_TOKEN="CHANGE_ME_CONFIRMATION"
```

### AC01: Health Check Funcional
```bash
curl -X GET $MCP_HOST/health
# Esperado: status=healthy, service=mcp-whm-cpanel, version=1.0.0
```

### AC01b: Autenticação Obrigatória
- Sem x-api-key → 401 Missing x-api-key
- x-api-key inválido → 401 Invalid API Key
- x-api-key válido → tools/list responde 200

### AC02: Lista de Tools MCP
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
Verificar dns.*, whm.*, system.*, file.*, log.*

### AC03: Listar Contas WHM
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm.list_accounts","arguments":{}},"id":2}'
```

### AC04: SSH Seguro (não existe ssh.execute)
- Chamada para ssh.execute → erro -32601
- `system.restart_service` com serviço permitido → success
- Serviço não permitido → -32602 com allowed_services
- `log.read_last_lines` em arquivo permitido → success
- Arquivo não autorizado → -32000 Unauthorized log file access

### AC05: Arquivos cPanel
- `file.list`, `file.read`, `file.write` (com SafetyGuard), `file.delete` (SafetyGuard)

### AC06: Listar Zonas DNS
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.list_zones","arguments":{}},"id":9}'
```

### AC07: Obter Zona DNS Completa
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.get_zone","arguments":{"zone":"cliente1.com.br"}},"id":10}'
```

### AC08: Adicionar Registro DNS (A/CNAME)
- `dns.add_record` com A ou CNAME
- `dns.edit_record` com optimistic locking (expected_content)
- `dns.reset_zone`

### AC09: Deletar Registro DNS
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns.delete_record","arguments":{"zone":"cliente1.com.br","line":15,"confirmationToken":"'$MCP_SAFETY_TOKEN'","reason":"Remocao do registro legado solicitada pelo cliente"}},"id":15}'
```

### AC10: Segurança de Credenciais
- Verificar logs não contêm tokens; buscar `[REDACTED]` nos logs.

### AC11: Zona DNS Inexistente
- `dns.get_zone` com zona inválida → erro "Zone Not Found" + sugestão

### AC12: PM2 Estabilidade
- `pm2 list | grep mcp-whm-cpanel`
- `pm2 show mcp-whm-cpanel`

### AC15: Resiliência e Rate Limiting
- Logs devem mostrar retries/backoff ao receber 429.

### AC16: Métricas Prometheus
```bash
curl -X GET $MCP_HOST/metrics
```

### AC17: Timeouts
- WHM timeout 30s, SSH 60s, DNS 45s → erro "Operation timed out after <x>s".

### AC18: WHM 200 com metadata.result=0
- `dns.add_record` com domínio inválido deve retornar erro mapeado mostrando `whm_metadata_result: 0`.
