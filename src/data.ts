import type { CleanCategory, LargeFile, StorageOverview, ToolUsage } from "./types";
import { isWindows, platformCopy } from "./platform";

export const overview: StorageOverview = {
  total: 494.38,
  used: 427.18,
  free: 67.2,
  reclaimable: 38.64,
  device: platformCopy.device,
  scannedAt: "Agora mesmo"
};

export const categories: CleanCategory[] = [
  { id: "cache", title: "Caches de usuário", description: "Arquivos temporários recriados automaticamente", size: 12.48, count: 1842, risk: "safe", selected: true },
  { id: "browser", title: "Caches de navegadores", description: "Safari, Chrome, Arc e Firefox", size: 4.12, count: 734, risk: "safe", selected: true },
  { id: "logs", title: "Logs antigos", description: "Registros de diagnóstico com mais de 30 dias", size: 1.86, count: 318, risk: "safe", selected: true },
  { id: "downloads", title: "Downloads esquecidos", description: "Itens antigos que merecem uma revisão", size: 8.72, count: 46, risk: "review", selected: false },
  isWindows
    ? { id: "windows-old", title: "Instalação anterior do Windows", description: "Arquivos preservados após uma atualização", size: 7.34, count: 18214, risk: "review", selected: false }
    : { id: "ios", title: "Backups de iPhone e iPad", description: "Cópias locais de dispositivos Apple", size: 7.34, count: 3, risk: "review", selected: false },
  { id: "dev", title: "Dados de desenvolvimento", description: isWindows ? "NuGet, npm, Docker, WSL e builds" : "DerivedData, simuladores, Docker e pacotes", size: 4.12, count: 129, risk: "care", selected: false }
];

export const largeFiles: LargeFile[] = [
  { name: "Gravação de Tela 2026-08-14.mov", path: isWindows ? "Vídeos / Capturas" : "Filmes / Capturas", size: 8.4, kind: "Vídeo", age: "67 dias" },
  { name: isWindows ? "Windows.old" : "iPhone de Emanuel.backup", path: isWindows ? "Disco local (C:)" : "Biblioteca / MobileSync", size: 7.3, kind: "Backup", age: "102 dias" },
  { name: "ollama-models.tar", path: "Downloads", size: 5.8, kind: "Arquivo", age: "43 dias" },
  { name: "Projeto-final-v12.zip", path: "Downloads", size: 3.1, kind: "Compactado", age: "91 dias" }
];

export const aiTools: ToolUsage[] = [
  { name: "Ollama", detail: "6 modelos locais · porta 11434", size: 18.42, running: true, color: "#17191c" },
  { name: "LM Studio", detail: "3 modelos e cache de respostas", size: 11.28, running: false, color: "#7357dc" },
  { name: "Cursor", detail: "Cache, extensões e índices", size: 4.76, running: true, color: "#2b2e35" },
  { name: "Claude", detail: "Cache e dados locais", size: 1.94, running: false, color: "#d97757" }
];
