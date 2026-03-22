#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# CodeLens — One-command local setup
# Usage: ./start.sh
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "   ╔═══════════════════════════════════════╗"
echo "   ║   🔍 CodeLens — AI Code Review        ║"
echo "   ║   Local Development Setup              ║"
echo "   ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ── Check .env ───────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${RED}⚠  IMPORTANT: Edit .env and add your OPENAI_API_KEY and GITHUB_TOKEN${NC}"
    echo -e "${RED}   Then re-run this script.${NC}"
    exit 1
fi

# Validate keys exist
source .env 2>/dev/null || true
if [ -z "${OPENAI_API_KEY:-}" ] || [ "${OPENAI_API_KEY}" = "sk-your-openai-api-key-here" ]; then
    echo -e "${RED}✗ OPENAI_API_KEY not set in .env — please add it${NC}"
    exit 1
fi
echo -e "${GREEN}✓ OPENAI_API_KEY detected${NC}"

if [ -z "${GITHUB_TOKEN:-}" ] || [ "${GITHUB_TOKEN}" = "ghp_your-github-token-here" ]; then
    echo -e "${YELLOW}⚠ GITHUB_TOKEN not set — PR reviews will be limited to 60 req/hr${NC}"
else
    echo -e "${GREEN}✓ GITHUB_TOKEN detected${NC}"
fi

# ── Choose mode ──────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}Select run mode:${NC}"
echo "  1) Docker Compose (recommended — full stack with PostgreSQL + Redis)"
echo "  2) Local Python (SQLite + in-memory cache — no Docker needed)"
echo ""
read -p "Enter choice [1/2]: " MODE

if [ "$MODE" = "1" ]; then
    # ── Docker Mode ──────────────────────────────────────────────────
    echo -e "\n${CYAN}Starting with Docker Compose...${NC}"

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker not found. Install Docker Desktop or use mode 2.${NC}"
        exit 1
    fi

    cd docker
    docker compose --env-file ../.env up --build -d

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ CodeLens is running!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  API:        ${CYAN}http://localhost:8000${NC}"
    echo -e "  API Docs:   ${CYAN}http://localhost:8000/docs${NC}"
    echo -e "  Frontend:   ${CYAN}http://localhost:5173${NC}"
    echo -e "  Prometheus: ${CYAN}http://localhost:9090${NC}"
    echo -e "  Grafana:    ${CYAN}http://localhost:3001${NC} (admin/codelens)"
    echo ""
    echo -e "  Stop: ${YELLOW}cd docker && docker compose down${NC}"

else
    # ── Local Python Mode (SQLite) ───────────────────────────────────
    echo -e "\n${CYAN}Starting in local mode (SQLite + in-memory cache)...${NC}"

    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}✗ Python 3.12+ required${NC}"
        exit 1
    fi

    cd backend

    # Create venv if not exists
    if [ ! -d ".venv" ]; then
        echo -e "${YELLOW}Creating virtual environment...${NC}"
        python3 -m venv .venv
    fi

    source .venv/bin/activate
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install -r requirements.txt -q

    # Override DB to SQLite for local mode
    export DATABASE_URL="sqlite+aiosqlite:///./codelens_local.db"
    export REDIS_URL="memory://"
    export APP_ENV="development"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ Starting CodeLens API...${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  API:        ${CYAN}http://localhost:8000${NC}"
    echo -e "  API Docs:   ${CYAN}http://localhost:8000/docs${NC}"
    echo -e "  OpenAPI:    ${CYAN}http://localhost:8000/openapi.json${NC}"
    echo ""
    echo -e "  Stop: ${YELLOW}Ctrl+C${NC}"
    echo ""

    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
