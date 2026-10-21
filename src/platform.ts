export type DesktopPlatform = "macos" | "windows";

function resolvePlatform(): DesktopPlatform {
  const preview = new URLSearchParams(window.location.search).get("platform");
  if (preview === "macos" || preview === "windows") return preview;
  const configured = import.meta.env.VITE_TARGET_PLATFORM;
  if (configured === "macos" || configured === "windows") return configured;
  return /Win/i.test(navigator.userAgent) ? "windows" : "macos";
}

export const platform = resolvePlatform();
export const isWindows = platform === "windows";

export const platformCopy = isWindows ? {
  computer: "PC",
  sidebar: "Seu PC",
  device: "Este computador · Disco local (C:)",
  disk: "Disco local (C:)",
  home: "Usuários · Emanuel",
  privacy: "A análise acontece localmente. Nenhum dado é enviado.",
  health: "Saúde do PC",
  overviewEyebrow: "Um raio-x do seu PC",
  aiEyebrow: "IA no seu PC",
  monitorTitle: "Seu PC, em tempo real",
  trash: "Lixeira",
  restore: "Você poderá restaurar tudo pela Lixeira.",
  move: "Mover para a Lixeira"
} : {
  computer: "Mac",
  sidebar: "Seu Mac",
  device: "MacBook Pro · Macintosh HD",
  disk: "Macintosh HD",
  home: "Usuários · Emanuel",
  privacy: "A análise acontece localmente. Nenhum dado é enviado.",
  health: "Saúde do Mac",
  overviewEyebrow: "Um raio-x do seu Mac",
  aiEyebrow: "IA no seu Mac",
  monitorTitle: "Seu Mac, em tempo real",
  trash: "Lixo",
  restore: "Você poderá restaurar tudo pelo Lixo.",
  move: "Mover para o Lixo"
};
