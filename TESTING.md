# TESTING.md - Guia de Testes MCP WHM/cPanel

Este documento contem todos os exemplos de teste curl para validar os 18 criterios de aceitacao (AC01 a AC18) do SPEC-MCP-WHM-CPANEL-001 v1.1.0.

## Pre-requisitos

1. Servidor rodando: `npm start` ou `pm2 start mcp-whm-cpanel`
2. API Key configurada no `.env`
3. Credenciais WHM validas

## Variaveis de Ambiente para Testes

```bash
export MCP_HOST="http://mcp.example.com:3200"
export MCP_API_KEY="sk_whm_mcp_prod_CHANGE_ME"
export MCP_SAFETY_TOKEN="CHANGE_ME_CONFIRMATION"
```

> ⚠️ **Safety Guard:** operacoes destrutivas (DNS edit/delete/reset e file.write/delete) exigem `confirmationToken` igual a `MCP_SAFETY_TOKEN` e um campo `reason` descrevendo o motivo da acao.

---

## AC01: Health Check Funcional

```bash
# GET /health (sem autenticacao)
curl -X GET $MCP_HOST/health

# Resposta esperada (HTTP 200)
# {
#   "status": "healthy",
#   "service": "mcp-whm-cpanel",
#   "version": "1.0.0",
#   "timestamp": "2025-12-06T10:00:00.000Z"
# }
```

---

## AC01b: Autenticacao Obrigatoria

### Cenario 1: Requisicao sem API Key
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Resposta esperada (HTTP 401)
# {
#   "error": "Missing x-api-key header"
# }
```

### Cenario 2: Requisicao com API Key invalida
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: sk_whm_mcp_invalid_key' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Resposta esperada (HTTP 401)
# {
#   "error": "Invalid API Key"
# }
```

### Cenario 3: Requisicao com API Key valida
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Resposta esperada (HTTP 200)
# {
#   "jsonrpc": "2.0",
#   "id": 1,
#   "result": { "tools": [...] }
# }
```

---

## AC02: Lista de Tools MCP

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Verificar:
# - Lista contem tools dns.* (dns.list_zones, dns.get_zone, etc)
# - Lista contem tools whm.* (whm.list_accounts, etc)
# - Lista contem tools system.* (system.restart_service, etc)
# - Cada tool tem name, description, inputSchema
```

---

## AC03: Listar Contas WHM

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"whm.list_accounts",
      "arguments":{}
    },
    "id":2
  }'

# Resposta esperada
# {
#   "jsonrpc": "2.0",
#   "id": 2,
#   "result": {
#     "success": true,
#     "data": {
#       "accounts": [...],
#       "total": N
#     }
#   }
# }
```

---

## AC04: Gerenciamento SSH Seguro (CC-02)

### Cenario 1: Tool ssh.execute NAO existe
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"ssh.execute",
      "arguments":{"command":"rm -rf /"}
    },
    "id":3
  }'

# Resposta esperada (erro -32601)
# {
#   "error": {
#     "code": -32601,
#     "message": "Tool not found"
#   }
# }
```

### Cenario 2: Reiniciar servico permitido
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"system.restart_service",
      "arguments":{"service":"httpd"}
    },
    "id":3
  }'

# Resposta esperada
# {
#   "result": {
#     "success": true,
#     "data": {
#       "service": "httpd",
#       "status": "restarted"
#     }
#   }
# }
```

### Cenario 3: Servico NAO permitido
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"system.restart_service",
      "arguments":{"service":"malicious-service"}
    },
    "id":3
  }'

# Resposta esperada (erro -32602)
# {
#   "error": {
#     "code": -32602,
#     "message": "Invalid service name",
#     "data": {
#       "allowed_services": ["httpd", "mysql", "named", "postfix", "dovecot"]
#     }
#   }
# }
```

### Cenario 4: Ler log permitido
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"log.read_last_lines",
      "arguments":{
        "logfile":"/var/log/httpd/error_log",
        "lines":10
      }
    },
    "id":4
  }'
```

### Cenario 5: Arquivo NAO autorizado
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"log.read_last_lines",
      "arguments":{
        "logfile":"/etc/shadow",
        "lines":10
      }
    },
    "id":4
  }'

# Resposta esperada (erro -32000)
# {
#   "error": {
#     "code": -32000,
#     "message": "Unauthorized log file access"
#   }
# }
```

---

## AC05: Listar Arquivos cPanel

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"file.list",
      "arguments":{
        "cpanelUser":"cliente1",
        "path":"/home/cliente1/public_html"
      }
    },
    "id":5
  }'
```

---

## AC05b: Leitura de Arquivo

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"file.read",
      "arguments":{
        "cpanelUser":"cliente1",
        "path":"/home/cliente1/config.txt"
      }
    },
    "id":6
  }'
```

---

## AC05c: Escrita de Arquivo

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"file.write",
"arguments":{
        "cpanelUser":"cliente1",
        "path":"/home/cliente1/novo.txt",
        "content":"Test content\nLine 2",
        "confirmationToken":"'"'"'$MCP_SAFETY_TOKEN'"'"'",
        "reason":"Atualizacao do wp-config com solicitacao do time DevOps"
      }
    },
    "id":7
  }'
```

---

## AC05d: Delecao de Arquivo

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"file.delete",
"arguments":{
        "cpanelUser":"cliente1",
        "path":"/home/cliente1/temp.txt",
        "confirmationToken":"'"'"'$MCP_SAFETY_TOKEN'"'"'",
        "reason":"Remocao solicitada pelo cliente"
      }
    },
    "id":8
  }'
```

---

## AC06: Listar Zonas DNS

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.list_zones",
      "arguments":{}
    },
    "id":9
  }'
```

---

## AC07: Obter Zona DNS Completa

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.get_zone",
      "arguments":{
        "zone":"cliente1.com.br"
      }
    },
    "id":10
  }'
```

---

## AC08: Adicionar Registro DNS (A)

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.add_record",
      "arguments":{
        "zone":"cliente1.com.br",
        "type":"A",
        "name":"api",
        "address":"192.168.1.20",
        "ttl":3600
      }
    },
    "id":11
  }'
```

---

## AC08b: Adicionar Registro CNAME

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.add_record",
      "arguments":{
        "zone":"cliente1.com.br",
        "type":"CNAME",
        "name":"blog",
        "cname":"cliente1.github.io.",
        "ttl":3600
      }
    },
    "id":12
  }'
```

---

## AC08c: Editar Registro DNS com Optimistic Locking (CC-04)

### Cenario 1: Edicao com conteudo correto
```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.edit_record",
      "arguments":{
        "zone":"cliente1.com.br",
        "line":10,
        "expected_content":"www.cliente1.com.br. 14400 IN A 192.168.1.10",
        "address":"192.168.1.50",
        "ttl":7200
      }
    },
    "id":13
  }'
```

### Cenario 2: Race condition detectada
```bash
# Se expected_content nao corresponder ao conteudo atual, retorna erro 409
```

---

## AC08d: Reset de Zona DNS

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.reset_zone",
      "arguments":{
        "zone":"cliente1.com.br"
      }
    },
    "id":14
  }'
```

---

## AC09: Deletar Registro DNS

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.delete_record",
"arguments":{
        "zone":"cliente1.com.br",
        "line":15,
        "confirmationToken":"'"'"'$MCP_SAFETY_TOKEN'"'"'",
        "reason":"Remocao do registro legado solicitada pelo cliente"
      }
    },
    "id":15
  }'
```

---

## AC10: Seguranca das Credenciais (CC-05)

### Teste automatizado - grep nos logs
```bash
# Executar apos algumas requisicoes

# NENHUM token deve aparecer nos logs
grep -i "sk_whm" /opt/mcp-servers/_shared/logs/mcp-whm-cpanel*.log
# Resultado esperado: (nenhuma linha)

grep -i "bearer" /opt/mcp-servers/_shared/logs/mcp-whm-cpanel*.log
# Resultado esperado: (nenhuma linha)

# Deve encontrar [REDACTED] (confirmacao de sanitizacao)
grep "[REDACTED]" /opt/mcp-servers/_shared/logs/mcp-whm-cpanel*.log
# Resultado esperado: Multiplas linhas com [REDACTED]
```

---

## AC11: Erro - Zona DNS Inexistente

```bash
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.get_zone",
      "arguments":{
        "zone":"inexistente.com.br"
      }
    },
    "id":16
  }'

# Resposta esperada
# {
#   "error": {
#     "code": -32000,
#     "message": "Zone Not Found",
#     "data": {
#       "zone": "inexistente.com.br",
#       "suggestion": "Use dns.list_zones to see available zones"
#     }
#   }
# }
```

---

## AC12: PM2 Estabilidade

```bash
# Verificar status do servico
pm2 list | grep mcp-whm-cpanel

# Resposta esperada
# | mcp-whm-cpanel | online | 0 | ... |

# Verificar memoria e restarts
pm2 show mcp-whm-cpanel
```

---

## AC15: Resiliencia e Rate Limiting (CC-06)

Os logs devem mostrar retries com backoff exponencial quando WHM API retorna 429:
```
[WARN] WHM API rate limit hit (429)
  Retry-After: 5 seconds
  Attempt: 1/5
```

---

## AC16: Exposicao de Metricas Prometheus

```bash
curl -X GET $MCP_HOST/metrics

# Resposta esperada (formato Prometheus)
# mcp_http_request_duration_seconds_bucket{...}
# mcp_tool_executions_total{...}
# whm_api_rate_limit_hits_total ...
```

---

## AC17: Timeout de Operacoes

### WHM timeout (30s)
```bash
# Se operacao exceder 30s:
# {
#   "error": {
#     "code": -32000,
#     "message": "Operation timed out after 30s"
#   }
# }
```

### SSH timeout (60s)
```bash
# Se operacao exceder 60s:
# {
#   "error": {
#     "code": -32000,
#     "message": "Operation timed out after 60s"
#   }
# }
```

### DNS timeout (45s)
```bash
# Se operacao exceder 45s:
# {
#   "error": {
#     "code": -32000,
#     "message": "Operation timed out after 45s"
#   }
# }
```

---

## AC18: Erro WHM com HTTP 200 (Validacao Metadata)

```bash
# Quando WHM retorna 200 mas metadata.result=0:
curl -X POST $MCP_HOST/mcp \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"dns.add_record",
      "arguments":{
        "zone":"invalid..domain",
        "type":"A",
        "name":"test",
        "address":"192.168.1.1"
      }
    },
    "id":17
  }'

# Resposta esperada
# {
#   "error": {
#     "code": -32000,
#     "message": "WHM API Error: Invalid domain name",
#     "data": {
#       "whm_reason": "Invalid domain name",
#       "whm_metadata_result": 0
#     }
#   }
# }
```

---

## Checklist de Validacao

| AC | Descricao | Status |
|----|-----------|--------|
| AC01 | Health Check | [ ] |
| AC01b | Autenticacao | [ ] |
| AC02 | Tools List | [ ] |
| AC03 | Listar Contas | [ ] |
| AC04 | SSH Seguro | [ ] |
| AC05 | Listar Arquivos | [ ] |
| AC05b | Ler Arquivo | [ ] |
| AC05c | Escrever Arquivo | [ ] |
| AC05d | Deletar Arquivo | [ ] |
| AC06 | Listar Zonas | [ ] |
| AC07 | Get Zona | [ ] |
| AC08 | Add Record A | [ ] |
| AC08b | Add Record CNAME | [ ] |
| AC08c | Edit Record | [ ] |
| AC08d | Reset Zone | [ ] |
| AC09 | Delete Record | [ ] |
| AC10 | Seguranca Logs | [ ] |
| AC11 | Erro Zona | [ ] |
| AC12 | PM2 Estavel | [ ] |
| AC15 | Rate Limiting | [ ] |
| AC16 | Metricas | [ ] |
| AC17 | Timeout | [ ] |
| AC18 | Metadata WHM | [ ] |

---

## Troubleshooting

### Servico nao inicia
```bash
# Verificar logs
pm2 logs mcp-whm-cpanel --err --lines 50

# Verificar porta em uso
lsof -i :3200
```

### Erro de autenticacao WHM
```bash
# Verificar token no .env
cat .env | grep WHM_API_TOKEN

# Testar conexao direta com WHM
curl -k "https://$WHM_HOST:2087/json-api/version?api.version=1" \
  -H "Authorization: whm root:$WHM_API_TOKEN"
```

### Erro de SSH
```bash
# Verificar chave SSH
cat $SSH_KEY_PATH

# Testar conexao SSH
ssh -i $SSH_KEY_PATH root@$SSH_HOST "echo OK"
```
