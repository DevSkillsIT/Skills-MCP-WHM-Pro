# TESTING.md - Guia de Testes MCP WHM/cPanel (v1.5.0)

Este guia cobre os testes manuais para validar o HTTP Streamable Protocol (MCP 2024-11-05) e as features de domínio/DNS (48 tools) com hardening de segurança.

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

> ⚠️ **SafetyGuard**: whm_cpanel_delete_domain, whm_cpanel_create_addon_conversion, whm_cpanel_enable_dnssec_nsec3, whm_cpanel_disable_dnssec_nsec3, whm_cpanel_update_userdomains_cache, whm_cpanel_delete_dns_record e whm_cpanel_delete_user_file exigem token + `reason` (>=10 chars).

---

## 1. Smoke Tests

### 1.1 Health (HTTP Streamable)
```bash
curl -X GET $MCP_HOST/health
```
Esperado: `status=healthy`, `service=skills-mcp-whm-pro`, `version=1.5.0`, `protocol=MCP 2024-11-05`.

### 1.2 Autenticação obrigatória
```bash
curl -X POST $MCP_HOST/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
Esperado: HTTP 401 (missing x-api-key).

### 1.3 Tools list (48 tools - HTTP Streamable)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
Verificar presença de 48 tools:
- whm_* (10 tools: account management, monitoring)
- domain_* (19 tools: user data, owner, alias, subdomain, addon conversions, DNSSEC/NSEC3, authority)
- dns_* (9 tools: zones, records, MX, ALIAS)
- system_*, file_*, log_* (10 tools: server management)

**Protocolo:** MCP 2024-11-05 (Streamable HTTP)
**Endpoint:** http://mcp.servidor.one:3200/mcp
**Autenticação:** x-api-key header obrigatório

---

## 2. Domínio – Informação (RF01-RF03, RNF07)

### 2.1 domain_get_user_data
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_get_user_data","arguments":{"domain":"exemplo.com.br"}},"id":10}'
```
Esperado: success=true com usuário/documentroot; erro claro se domínio inválido (RS01).

### 2.2 domain_get_all_info (paginação obrigatória)
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_get_all_info","arguments":{}},"id":11}'
```
Esperado: `data.pagination` com `total/limit/offset/has_more/next_offset`.  
Repetir com `{"limit":50,"offset":50,"filter":"addon"}` e validar filtro + next_offset.

### 2.3 domain_get_owner
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_get_owner","arguments":{"domain":"exemplo.com.br"}},"id":12}'
```
Esperado: owner retornado; erro se domínio inválido.

---

## 3. Domínio – Gestão e Segurança (RF10-RF13, RF21, RS03)

### 3.1 domain_create_alias (idempotente)
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_create_alias","arguments":{"domain":"aliaslab.com.br","username":"cpuser"}},"id":20}'
```
Repetir o mesmo comando; esperado `idempotent=true` na segunda chamada.

### 3.2 domain_create_subdomain com docroot válido
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_create_subdomain","arguments":{"subdomain":"api","domain":"exemplo.com.br","username":"cpuser","document_root":"/home/cpuser/api"}},"id":21}'
```
Esperado: success; docroot sanitizado.  
Teste negativo (RS03):
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_create_subdomain","arguments":{"subdomain":"api","domain":"exemplo.com.br","username":"cpuser","document_root":"/home/cpuser/../etc"}},"id":22}'
```
Esperado: erro contendo "cannot contain .." ou diretório restrito.

### 3.3 domain_delete (SafetyGuard – usar domínio descartável)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_delete","arguments":{"domain":"test.aliaslab.com.br","username":"cpuser","type":"subdomain","reason":"Remocao de teste automatizado"}},"id":23}'
```
Esperado: success ou erro claro de autorização; header é aceito mesmo sem `confirmationToken` no body.

### 3.4 domain_resolve
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_resolve","arguments":{"domain":"exemplo.com.br"}},"id":24}'
```
Esperado: IP resolvido ou erro de DNS.

### 3.5 domain_update_userdomains (lock + SafetyGuard)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_update_userdomains","arguments":{"reason":"Sincronizacao pos-manutencao"}},"id":25}'
```
Esperado: success. Se outro processo estiver rodando, erro 409 com mensagem "Resource busy".

---

## 4. Addon Conversions (RF04-RF09)

- `domain_addon_list`:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_addon_list","arguments":{"username":"cpuser"}},"id":30}'
```
- `domain_addon_details`:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_addon_details","arguments":{"domain":"addon.exemplo.com.br","username":"cpuser"}},"id":31}'
```
- `domain_addon_conversion_status`:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_addon_conversion_status","arguments":{"conversion_id":"conv_123"}},"id":32}'
```
- `domain_addon_start_conversion` (SafetyGuard):
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_addon_start_conversion","arguments":{"domain":"addon.exemplo.com.br","username":"cpuser","new_username":"novocp","reason":"Teste de conversao automatizada"}},"id":33}'
```
- `domain.addon.conversion_details` / `domain_addon_list_conversions`: verificar que retornam status, timestamps e steps.

Esperado: erros claros se conversion_id inválido; SafetyGuard exigido em start_conversion.

---

## 5. DNS Autoridade e MX (RF14-RF16)

### 5.1 domain_check_authority
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_check_authority","arguments":{"domain":"exemplo.com.br"}},"id":40}'
```

### 5.2 dns_list_mx / dns_add_mx (idempotência)
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns_add_mx","arguments":{"domain":"exemplo.com.br","exchange":"mail.exemplo.com.br","priority":10}},"id":41}'
```
Repetir o mesmo comando: esperado `idempotent=true` na segunda chamada.

---

## 6. DNSSEC / DS / ALIAS (RF17-RF18)

### 6.1 domain_get_ds_records
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_get_ds_records","arguments":{"domains":["exemplo.com.br"]}},"id":50}'
```
Esperado: DS records quando DNSSEC ativo; caso contrário erro claro:  
`"DNSSEC não configurado ou endpoint WHM indisponível..."` (sem timeout >30s).

### 6.2 dns_check_alias_available
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"dns_check_alias_available","arguments":{"zone":"exemplo.com.br","name":"cdn"}},"id":51}'
```
Esperado: `available=true/false` ou erro claro `"Checagem de ALIAS não suportada..."` se endpoint faltar. Chamada não deve pendurar.

---

## 7. NSEC3 Assíncrono (RF19-RF20-RF22)

### 7.1 domain_enable_nsec3 (SafetyGuard)
```bash
curl -X POST $MCP_HOST/mcp \
  -H "x-api-key: $MCP_API_KEY" \
  -H "X-MCP-Safety-Token: $MCP_SAFETY_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_enable_nsec3","arguments":{"domains":["exemplo.com.br"],"reason":"Habilitar NSEC3 para teste"}},"id":60}'
```
Esperado: `operation_id`, `status=pending`, `estimated_timeout` <= 600s, `polling_interval=5000`.

### 7.2 domain_get_nsec3_status
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_get_nsec3_status","arguments":{"operation_id":"<OP_ID>"}},"id":61}'
```
Esperado: status `pending|in_progress|completed|failed`, `progress_percent`, timestamps; erro claro se operation_id inexistente.

### 7.3 domain_disable_nsec3 (similar ao enable)
Repetir chamada com `domain_disable_nsec3` e mesmo fluxo de polling.

---

## 8. Segurança e Validações (RS01-RS04)

- **SafetyGuard via header**: repetir domain_delete enviando header e body diferentes; body tem precedência.
- **Domain Validation (RS01)**:
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"domain_get_user_data","arguments":{"domain":"invalido.com; rm -rf /"}},"id":70}'
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

- **Timeouts**: domain_get_ds_records e dns_check_alias_available devem responder em <= `WHM_TIMEOUT` (default 30s) com mensagem clara; NSEC3 segue cálculo dinâmico `60s + 30s * dom` (máx 600s).

---

## 10. Checklist Rápido

| Item | Status |
|------|--------|
| Health / Auth / tools.list (45) | [ ] |
| domain_get_user_data / get_all_info / get_owner | [ ] |
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
Verificar dns_*, whm_*, system_*, file_*, log_*

### AC03: Listar Contas WHM
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_list_accounts","arguments":{}},"id":2}'
```

### AC04: SSH Seguro (não existe ssh_execute)
- Chamada para ssh_execute → erro -32601
- `whm_cpanel_restart_system_service` com serviço permitido → success
- Serviço não permitido → -32602 com allowed_services
- `whm_cpanel_read_system_log_lines` em arquivo permitido → success
- Arquivo não autorizado → -32000 Unauthorized log file access

### AC05: Arquivos cPanel
- `whm_cpanel_list_user_files`, `whm_cpanel_read_user_file`, `whm_cpanel_write_user_file` (com SafetyGuard), `whm_cpanel_delete_user_file` (SafetyGuard)

### AC06: Listar Zonas DNS
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_list_dns_zones","arguments":{}},"id":9}'
```

### AC07: Obter Zona DNS Completa
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_get_dns_zone_records","arguments":{"zone":"cliente1.com.br"}},"id":10}'
```

### AC08: Adicionar Registro DNS (A/CNAME)
- `whm_cpanel_create_dns_record` com A ou CNAME
- `whm_cpanel_update_dns_record` com optimistic locking (expected_content)
- `whm_cpanel_reset_dns_zone`

### AC09: Deletar Registro DNS
```bash
curl -X POST $MCP_HOST/mcp -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"whm_cpanel_delete_dns_record","arguments":{"zone":"cliente1.com.br","line":15,"confirmationToken":"'$MCP_SAFETY_TOKEN'","reason":"Remocao do registro legado solicitada pelo cliente"}},"id":15}'
```

### AC10: Segurança de Credenciais
- Verificar logs não contêm tokens; buscar `[REDACTED]` nos logs.

### AC11: Zona DNS Inexistente
- `whm_cpanel_get_dns_zone_records` com zona inválida → erro "Zone Not Found" + sugestão

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
- `whm_cpanel_create_dns_record` com domínio inválido deve retornar erro mapeado mostrando `whm_metadata_result: 0`.
