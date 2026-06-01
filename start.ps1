# Treinador Jayme - Script de inicializacao
Set-Location $PSScriptRoot

Write-Host "==> Removendo next.config.ts (incompativel com Next 14.2)..." -ForegroundColor Yellow
Remove-Item -Force -ErrorAction SilentlyContinue "next.config.ts"

Write-Host "==> Removendo node_modules antigo..." -ForegroundColor Yellow
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "node_modules"
Remove-Item -Force -ErrorAction SilentlyContinue "package-lock.json"

Write-Host "==> Instalando dependencias (pode demorar ~2min)..." -ForegroundColor Cyan
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no npm install" -ForegroundColor Red; exit 1 }

if (-not (Test-Path ".env.local")) {
    Write-Host "==> Criando .env.local a partir do .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env.local"
    Write-Host "  ATENCAO: Edite .env.local com suas chaves do Supabase e Anthropic antes de usar!" -ForegroundColor Red
}

Write-Host ""
Write-Host "==> Iniciando servidor em http://localhost:3000 ..." -ForegroundColor Green
npm run dev
