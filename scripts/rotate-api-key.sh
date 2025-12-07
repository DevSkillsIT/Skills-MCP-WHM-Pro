#!/bin/bash
# Script de Rotacao de API Key (CC-01)
# Gera nova chave e atualiza .env automaticamente
#
# Uso: ./rotate-api-key.sh [environment]
# Exemplo: ./rotate-api-key.sh prod

set -e

# Configuracao
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV="$1"

# Se ambiente nao especificado, usar prod
if [ -z "$ENV" ]; then
    ENV="prod"
fi

# Validar ambiente
if [[ ! "$ENV" =~ ^(prod|dev|test|staging)$ ]]; then
    echo "Erro: Ambiente invalido. Use: prod, dev, test ou staging"
    exit 1
fi

# Gerar nova chave
# Formato: sk_whm_mcp_{env}_{random16chars}
RANDOM_PART=$(openssl rand -hex 8)
NEW_KEY="sk_whm_mcp_${ENV}_${RANDOM_PART}"

# Validar tamanho minimo (32 caracteres)
if [ ${#NEW_KEY} -lt 24 ]; then
    echo "Erro: Chave gerada muito curta"
    exit 1
fi

echo "==================================="
echo "Rotacao de API Key - MCP WHM/cPanel"
echo "==================================="
echo ""
echo "Ambiente: $ENV"
echo "Nova chave: $NEW_KEY"
echo ""

# Verificar se arquivo .env existe
if [ ! -f "$ENV_FILE" ]; then
    echo "Criando arquivo .env..."
    cp "$PROJECT_DIR/.env.example" "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"
fi

# Atualizar ou adicionar WHM_MCP_API_KEY no .env
if grep -q "^WHM_MCP_API_KEY=" "$ENV_FILE"; then
    # Atualizar chave existente
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/^WHM_MCP_API_KEY=.*/WHM_MCP_API_KEY=$NEW_KEY/" "$ENV_FILE"
    else
        # Linux
        sed -i "s/^WHM_MCP_API_KEY=.*/WHM_MCP_API_KEY=$NEW_KEY/" "$ENV_FILE"
    fi
    echo "Chave atualizada no .env"
else
    # Adicionar nova chave
    echo "" >> "$ENV_FILE"
    echo "# API Key para autenticacao HTTP (CC-01)" >> "$ENV_FILE"
    echo "WHM_MCP_API_KEY=$NEW_KEY" >> "$ENV_FILE"
    echo "Chave adicionada ao .env"
fi

# Verificar se PM2 esta rodando o servico
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "mcp-whm-cpanel"; then
        echo ""
        echo "Reiniciando servico PM2..."
        pm2 restart mcp-whm-cpanel --update-env
        echo "Servico reiniciado com nova chave"
    else
        echo ""
        echo "AVISO: Servico mcp-whm-cpanel nao encontrado no PM2"
        echo "Execute 'pm2 start src/server.js --name mcp-whm-cpanel' para iniciar"
    fi
else
    echo ""
    echo "AVISO: PM2 nao encontrado"
    echo "Reinicie o servico manualmente para aplicar a nova chave"
fi

echo ""
echo "==================================="
echo "Rotacao concluida com sucesso!"
echo "==================================="
echo ""
echo "Lembre-se de:"
echo "1. Atualizar a chave nos clientes MCP"
echo "2. Testar a conexao: curl -H 'x-api-key: $NEW_KEY' http://localhost:3200/mcp"
echo ""
echo "Proxima rotacao recomendada: $(date -d '+30 days' '+%Y-%m-%d' 2>/dev/null || date -v+30d '+%Y-%m-%d' 2>/dev/null || echo 'em 30 dias')"
