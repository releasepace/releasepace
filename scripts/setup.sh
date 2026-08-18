#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ReleasePace — bootstrap script
# Run once after cloning: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────
set -e

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
RESET="\033[0m"

step() { echo -e "\n${BOLD}${BLUE}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $1${RESET}"; }

echo -e "${BOLD}ReleasePace — local setup${RESET}"
echo "────────────────────────────────────"

# ── Check prerequisites ────────────────────────────────────────
step "Checking prerequisites"

command -v node  >/dev/null 2>&1 && ok "Node.js $(node -v)" || { warn "Node.js not found — install from https://nodejs.org"; exit 1; }
command -v npm   >/dev/null 2>&1 && ok "npm $(npm -v)"      || { warn "npm not found"; exit 1; }

# Wrangler
if ! command -v wrangler >/dev/null 2>&1; then
  step "Installing Wrangler CLI"
  npm install -g wrangler
  ok "Wrangler installed"
else
  ok "Wrangler $(wrangler --version)"
fi

# Supabase CLI
if ! command -v supabase >/dev/null 2>&1; then
  warn "Supabase CLI not found — install from https://supabase.com/docs/guides/cli"
  warn "Skipping Supabase setup"
else
  ok "Supabase CLI found"
fi

# ── Install API dependencies ───────────────────────────────────
step "Installing API dependencies"
cd api && npm install && cd ..
ok "API dependencies installed"

# ── Install Dashboard dependencies ────────────────────────────
step "Installing Dashboard dependencies"
cd dashboard && npm install && cd ..
ok "Dashboard dependencies installed"

# ── Install JS SDK dependencies ───────────────────────────────
step "Installing JS SDK dependencies"
cd sdks/js && npm install && cd ../..
ok "JS SDK dependencies installed"

# ── Create .dev.vars for Wrangler local dev ───────────────────
step "Setting up local secrets"
if [ ! -f api/.dev.vars ]; then
  cat > api/.dev.vars << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
EOF
  warn "Created api/.dev.vars — fill in your Supabase credentials"
else
  ok "api/.dev.vars already exists"
fi

# ── Create dashboard .env.local ────────────────────────────────
if [ ! -f dashboard/.env.local ]; then
  cat > dashboard/.env.local << 'EOF'
VITE_API_URL=http://localhost:8787
EOF
  ok "Created dashboard/.env.local"
else
  ok "dashboard/.env.local already exists"
fi

# ── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Setup complete!${RESET}"
echo "────────────────────────────────────"
echo ""
echo "Next steps:"
echo ""
echo "  1. Fill in api/.dev.vars with your Supabase credentials"
echo "     (from https://supabase.com/dashboard → Settings → API)"
echo ""
echo "  2. Apply the database schema:"
echo "     ${BOLD}psql \$SUPABASE_URL -f supabase/migrations/001_initial_schema.sql${RESET}"
echo ""
echo "  3. Start local development:"
echo "     ${BOLD}# Terminal 1 — API${RESET}"
echo "     cd api && npm run dev"
echo ""
echo "     ${BOLD}# Terminal 2 — Dashboard${RESET}"
echo "     cd dashboard && npm run dev"
echo ""
echo "     ${BOLD}# Terminal 3 — Landing (just open the file)${RESET}"
echo "     open landing/index.html"
echo ""
echo "  4. Visit http://localhost:5173 for the dashboard"
echo "     API runs at http://localhost:8787"
