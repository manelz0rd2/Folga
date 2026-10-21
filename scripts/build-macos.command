#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Folga 0.1.7 — preparação do pacote de teste para macOS"
echo "Arquitetura detectada: $(uname -m)"
echo

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Faltam as ferramentas de linha de comando do Xcode."
  echo "Execute: xcode-select --install"
  read -r "?Pressione Enter para fechar."
  exit 1
fi

for command_name in node pnpm cargo; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Falta instalar: $command_name"
    echo "Consulte README-MACOS.md antes de continuar."
    read -r "?Pressione Enter para fechar."
    exit 1
  fi
done

pnpm install --frozen-lockfile
pnpm test
pnpm tauri:macos

echo
echo "Testes concluídos e DMG gerado em src-tauri/target/release/bundle/dmg/"
open src-tauri/target/release/bundle/dmg
