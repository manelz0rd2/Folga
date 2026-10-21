import { useEffect, useMemo, useState } from "react";
import {
  Activity, AppWindow, Bot, Check, ChevronRight, CircleHelp, Files, FolderOpen,
  Gauge, HardDrive, LayoutDashboard, ListRestart, LoaderCircle, Moon, ShieldCheck,
  Sparkles, Sun, Trash2, X
} from "lucide-react";
import { isWindows, platformCopy } from "./platform";
import { cleanupSelected, getDisks, getInstalledApps, getPlatformInfo, getSystemMetrics, hasNativeRuntime, openFolder, scanAiTools, scanCleanup, scanFolderChildren, scanHome, type NativeAiTool, type NativeDisk, type NativeFolder, type NativeInstalledApp, type NativeLargeFile, type NativeSystemMetrics } from "./native";
import type { CleanCategory, LargeFile, Risk, SectionId, StorageOverview } from "./types";
import folgaIcon from "../src-tauri/icons/app-icon.svg";
import supportPixQr from "./assets/support-pix-qr.png";

const formatGB = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
const bytesToGB = (value: number) => value / 1024 / 1024 / 1024;

const navItems: { id: SectionId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "map", label: "Mapa do disco", icon: HardDrive },
  { id: "clean", label: "Limpeza inteligente", icon: Sparkles },
  { id: "large", label: "Arquivos grandes", icon: Files },
  { id: "apps", label: "Aplicativos", icon: AppWindow },
  { id: "ai", label: "Ferramentas de IA", icon: Bot },
  { id: "monitor", label: "Monitor", icon: Activity }
];

const riskMeta: Record<Risk, { label: string; className: string }> = {
  safe: { label: "Seguro para limpar", className: "safe" },
  review: { label: "Vale revisar", className: "review" },
  care: { label: "Cuidado", className: "care" }
};

function App() {
  const [active, setActive] = useState<SectionId>("overview");
  const [categories, setCategories] = useState<CleanCategory[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [storage, setStorage] = useState<StorageOverview>({ total:0, used:0, free:0, reclaimable:0, device:platformCopy.device, scannedAt:"Aguardando análise" });
  const [bigFiles, setBigFiles] = useState<LargeFile[]>([]);
  const [folders, setFolders] = useState<NativeFolder[]>([]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [scannedRoot, setScannedRoot] = useState("");
  const [treemapFiles, setTreemapFiles] = useState<NativeLargeFile[]>([]);
  const [metrics, setMetrics] = useState<NativeSystemMetrics | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [detectedAiTools, setDetectedAiTools] = useState<NativeAiTool[]>([]);
  const [installedApps, setInstalledApps] = useState<NativeInstalledApp[]>([]);
  const [availableDisks, setAvailableDisks] = useState<NativeDisk[]>([]);
  const [selectedMount, setSelectedMount] = useState("");
  const selectedSize = useMemo(() => categories.filter(c => c.selected).reduce((sum, c) => sum + c.size, 0), [categories]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  };

  useEffect(() => {
    if (!hasNativeRuntime()) return;
    Promise.all([getDisks(), getPlatformInfo()]).then(([disks, info]) => {
      setAvailableDisks(disks);
      const normalizedRoot = info.defaultScanRoot.toLowerCase();
      const preferred = disks.find(disk => normalizedRoot.startsWith(disk.mountPath.toLowerCase())) ?? disks[0];
      if (preferred) {
        setSelectedMount(preferred.mountPath);
        setStorage(current => ({ ...current, device:`${platformCopy.device} · ${preferred.mountPath}` }));
      }
    }).catch(() => showToast("Não foi possível listar os discos agora."));
    scanAiTools().then(setDetectedAiTools).catch(() => undefined);
    getInstalledApps().then(setInstalledApps).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hasNativeRuntime() || (active !== "monitor" && !(active === "overview" && hasAnalyzed))) return;
    let activeRequest = true;
    const refresh = () => getSystemMetrics().then(value => { if (activeRequest) setMetrics(value); }).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { activeRequest = false; window.clearInterval(timer); };
  }, [active, hasAnalyzed]);

  const scan = async () => {
    setScanning(true);
    if (!hasNativeRuntime()) {
      window.setTimeout(() => {
        setScanning(false);
        showToast(`Prévia concluída. Instale o aplicativo para analisar este ${platformCopy.computer}.`);
      }, 900);
      return;
    }
    try {
      const info = await getPlatformInfo();
      const scanRoot = selectedMount || info.defaultScanRoot;
      const [disks, cleanup, report, liveMetrics] = await Promise.all([getDisks(), scanCleanup(), scanHome(scanRoot), getSystemMetrics()]);
      const disk = disks.find(item => item.mountPath.toLowerCase() === scanRoot.toLowerCase()) ?? disks.find(item => scanRoot.toLowerCase().startsWith(item.mountPath.toLowerCase()));
      const reclaimable = cleanup.reduce((sum, item) => sum + bytesToGB(item.sizeBytes), 0);
      if (disk) {
        const total = bytesToGB(disk.totalBytes);
        const free = bytesToGB(disk.availableBytes);
        setStorage({ total, free, used: total - free, reclaimable, device: `${platformCopy.device} · ${disk.mountPath}${disk.name && disk.name !== disk.mountPath ? ` · ${disk.name}` : ""}`, scannedAt: "Agora mesmo" });
      }
      setCategories(cleanup.map(item => ({
        id: item.id,
        title: item.title,
        description: item.path,
        size: bytesToGB(item.sizeBytes),
        count: item.fileCount,
        risk: item.risk,
        selected: item.risk === "safe" && item.sizeBytes > 0
      })));
      setFolders(report.folders);
      setScannedFiles(report.scannedFiles);
      setScannedRoot(report.root);
      setTreemapFiles(report.treemapFiles);
      setMetrics(liveMetrics);
      setBigFiles(report.largeFiles.map(file => ({
        name: file.name,
        path: file.path,
        size: bytesToGB(file.sizeBytes),
        kind: file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "Arquivo",
        age: "Encontrado agora"
      })));
      setHasAnalyzed(true);
      showToast(`${report.scannedFiles.toLocaleString("pt-BR")} arquivos analisados. Nada foi alterado.`);
    } catch (error) {
      showToast(`A análise não terminou: ${String(error)}`);
    } finally {
      setScanning(false);
    }
  };

  const clean = async () => {
    const selected = categories.filter(category => category.selected);
    if (!selected.length) return;
    if (!hasNativeRuntime()) { showToast("A limpeza real fica disponível no aplicativo instalado."); return; }
    const accepted = window.confirm(`${platformCopy.move} ${selected.length} categoria(s), somando ${formatGB(selectedSize)}? Você poderá restaurar os itens depois.`);
    if (!accepted) return;
    setScanning(true);
    try {
      const moved = await cleanupSelected(selected.map(category => category.id));
      const refreshed = await scanCleanup();
      setCategories(refreshed.map(item => ({ id:item.id, title:item.title, description:item.path, size:bytesToGB(item.sizeBytes), count:item.fileCount, risk:item.risk, selected:false })));
      showToast(`${moved.toLocaleString("pt-BR")} itens movidos para a ${platformCopy.trash}.`);
    } catch (error) {
      showToast(`A limpeza não terminou: ${String(error)}`);
    } finally { setScanning(false); }
  };

  const toggleCategory = (id: string) => setCategories(current => current.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  const navigate = (id: SectionId) => setActive(id);
  const chooseDisk = (mountPath: string) => {
    setSelectedMount(mountPath);
    setHasAnalyzed(false);
    setFolders([]);
    setTreemapFiles([]);
    setBigFiles([]);
    setScannedFiles(0);
    setScannedRoot("");
    setCategories([]);
    setStorage({ total:0, used:0, free:0, reclaimable:0, device:`${platformCopy.device} · ${mountPath}`, scannedAt:"Aguardando análise" });
  };

  return (
    <div className={dark ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar">
        {!isWindows && <div className="traffic-lights" aria-hidden="true"><span/><span/><span/></div>}
        <div className="brand" title="Ferramenta de Organização e Limpeza com Gestão de Armazenamento"><div className="brand-mark"><img src={folgaIcon} alt=""/></div><span><strong>folga</strong><small>Organização + limpeza</small></span></div>
        <nav>
          <p className="nav-label">{platformCopy.sidebar}</p>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={active === id ? "nav-item active" : "nav-item"} onClick={() => navigate(id)}>
              <Icon size={17}/><span>{label}</span>{id === "clean" && <b>{storage.reclaimable.toLocaleString("pt-BR", {maximumFractionDigits:1})} GB</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setAboutOpen(true)}><CircleHelp size={17}/>Sobre o Folga</button>
          {!isWindows && <button className="profile"><span>EF</span><div>Emanuel<small>Plano gratuito</small></div><ChevronRight size={15}/></button>}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">{storage.device}</p><h1>{navItems.find(item => item.id === active)?.label}</h1></div>
          <div className="top-actions">{availableDisks.length>0 && <label className="disk-select"><HardDrive size={15}/><select aria-label="Disco para analisar" value={selectedMount} onChange={event=>chooseDisk(event.target.value)} disabled={scanning}>{availableDisks.map(disk=><option value={disk.mountPath} key={disk.mountPath}>{disk.mountPath} · {formatGB(bytesToGB(disk.totalBytes))}</option>)}</select></label>}<button className="icon-button" aria-label="Alternar tema" onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="scan-button" onClick={scan} disabled={scanning}>{scanning ? <LoaderCircle size={17} className="loading-spinner"/> : <ListRestart size={17}/>} {scanning ? "Analisando…" : hasAnalyzed ? "Analisar novamente" : "Analisar este PC"}</button></div>
        </header>

        {active === "overview" && <Overview overview={storage} largeFiles={bigFiles} folders={folders} aiTools={detectedAiTools} metrics={metrics} hasAnalyzed={hasAnalyzed} onNavigate={navigate} onScan={scan} scanning={scanning}/>} 
        {active === "map" && <DiskMap folders={folders} treemapFiles={treemapFiles} scannedFiles={scannedFiles} root={scannedRoot} onOpenFolder={path => openFolder(path).catch(error => showToast(String(error)))}/>} 
        {active === "clean" && <Cleanup categories={categories} onToggle={toggleCategory} selectedSize={selectedSize} onClean={clean}/>} 
        {active === "large" && <LargeFiles files={bigFiles}/>} 
        {active === "apps" && <AppsView apps={installedApps}/>}
        {active === "ai" && <AIView tools={detectedAiTools}/>}
        {active === "monitor" && <Monitor metrics={metrics} apps={installedApps}/>} 
        <footer className="meaning-footer" aria-label="Significado de FOLGA"><span><b>F</b>erramenta de <b>O</b>rganização e <b>L</b>impeza com <b>G</b>estão de <b>A</b>rmazenamento</span></footer>
      </main>
      {toast && <div className="toast"><Check size={17}/>{toast}<button onClick={() => setToast(null)}><X size={15}/></button></div>}
      {aboutOpen && <div className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title"><button className="about-backdrop" aria-label="Fechar" onClick={() => setAboutOpen(false)}/><section className="about-panel"><header><span>SOBRE O FOLGA</span><button aria-label="Fechar" onClick={() => setAboutOpen(false)}><X size={18}/></button></header><div className="about-body"><div className="about-copy"><img src={folgaIcon} alt=""/><p className="eyebrow">FEEDBACK E EVOLUÇÃO</p><h2 id="about-title">Ajude a melhorar o Folga.</h2><p>Encontrou um problema ou tem uma sugestão? Envie seu feedback e pedidos de ajuste.</p><a href="mailto:emanuel.pereira.fraga@gmail.com?subject=Feedback%20Folga">emanuel.pereira.fraga@gmail.com <b>↗</b></a><small>Ferramenta de Organização e Limpeza com Gestão de Armazenamento.</small></div><div className="about-pix"><span>PIX PARA APOIO</span><div className="qr-crop"><img src={supportPixQr} alt="QR Code Pix para apoiar o Folga"/></div><small>APONTE A CÂMERA DO CELULAR</small></div></div></section></div>}
    </div>
  );
}

function Overview({ overview, largeFiles, folders, aiTools, metrics, hasAnalyzed, onNavigate, onScan, scanning }: { overview: StorageOverview; largeFiles: LargeFile[]; folders: NativeFolder[]; aiTools: NativeAiTool[]; metrics: NativeSystemMetrics | null; hasAnalyzed: boolean; onNavigate: (id: SectionId) => void; onScan: () => void; scanning: boolean }) {
  const pct = overview.total ? Math.round((overview.used / overview.total) * 100) : 0;
  const aiTotal = aiTools.reduce((sum, tool) => sum + bytesToGB(tool.sizeBytes), 0);
  const memoryPercent = metrics?.totalMemoryBytes ? Math.round((metrics.usedMemoryBytes / metrics.totalMemoryBytes) * 100) : 0;
  if (!hasAnalyzed) return <div className="page-content overview-page"><section className="analysis-empty card"><span className="analysis-empty-icon"><HardDrive size={30}/></span><p className="eyebrow">PRIMEIRA ANÁLISE</p><h2>Veja o que ocupa espaço neste PC</h2><p>O Folga só exibirá números, mapas e sugestões depois de ler o disco. A análise é local e não altera nenhum arquivo.</p><button className="scan-button" onClick={onScan} disabled={scanning}>{scanning ? <LoaderCircle size={17} className="loading-spinner"/> : <ListRestart size={17}/>} {scanning ? "Analisando…" : "Analisar este PC"}</button><small><ShieldCheck size={15}/> A análise acontece localmente. Nenhum dado é enviado.</small></section></div>;
  return <div className="page-content overview-page">
    <section className="storage-card hero-card">
      <div className="storage-heading"><div><span className="status-dot"/>ARMAZENAMENTO</div><span>{overview.scannedAt}</span></div>
      <div className="storage-main"><div><strong>{formatGB(overview.free)}</strong><span>livres de {formatGB(overview.total)}</span></div><div className="usage-pill">{pct}% usado</div></div>
      <div className="storage-bar"><i className="bar-system" style={{width:`${pct}%`}}/><i className="bar-free" style={{width:`${100-pct}%`}}/></div>
      <div className="storage-legend"><span><i className="system"/>Usado {formatGB(overview.used)}</span><span><i className="free"/>Livre {formatGB(overview.free)}</span></div>
    </section>

    <section className="reclaim-card">
      <div className="reclaim-icon"><Sparkles size={22}/></div><div className="reclaim-copy"><span>Espaço que você pode recuperar</span><strong>{formatGB(overview.reclaimable)}</strong><p>Encontramos arquivos que podem sair sem sustos.</p></div>
      <button onClick={() => onNavigate("clean")}>Revisar limpeza <ChevronRight size={17}/></button>
    </section>

    <div className="section-title"><div><p className="eyebrow">{platformCopy.overviewEyebrow}</p><h2>Onde está o seu espaço</h2></div><button className="text-button" onClick={() => onNavigate("map")}>Ver mapa completo <ChevronRight size={16}/></button></div>
    <div className="dashboard-grid">
      <MiniMap folders={folders} onClick={() => onNavigate("map")}/>
      <div className="quick-list card">
        <div className="card-head"><div><span className="mini-icon amber"><Files size={17}/></span><div><strong>Maiores arquivos</strong><small>Os gigantes esquecidos</small></div></div><button onClick={() => onNavigate("large")}><ChevronRight size={18}/></button></div>
        {largeFiles.length ? largeFiles.slice(0,3).map(file => <div className="file-row" key={`${file.path}-${file.name}`}><span className="file-icon"><FolderOpen size={16}/></span><div><strong>{file.name}</strong><small>{file.path}</small></div><b>{formatGB(file.size)}</b></div>) : <div className="empty-state">Execute a análise para localizar arquivos grandes.</div>}
      </div>
    </div>
    <div className="lower-grid">
      <div className="card ai-summary" onClick={() => onNavigate("ai")}><div className="card-head"><div><span className="mini-icon violet"><Bot size={17}/></span><div><strong>Ferramentas de IA</strong><small>Modelos, caches e processos detectados</small></div></div><ChevronRight size={18}/></div><div className="ai-total"><strong>{formatGB(aiTotal)}</strong><span>em {aiTools.length} ferramenta(s)</span></div><div className="tool-dots">{aiTools.map((tool,index) => <span key={tool.name} className={`tool-color-${index}`}>{tool.name[0]}</span>)}</div></div>
      <div className="card health-card"><div className="card-head"><div><span className="mini-icon green"><Gauge size={17}/></span><div><strong>{platformCopy.health}</strong><small>Atualização automática a cada 3 segundos</small></div></div></div><div className="health-stats"><div><span>CPU</span><strong>{Math.round(metrics?.cpuPercent ?? 0)}%</strong><i><b style={{width:`${metrics?.cpuPercent ?? 0}%`}}/></i></div><div><span>Memória</span><strong>{memoryPercent}%</strong><i><b style={{width:`${memoryPercent}%`}}/></i></div></div></div>
    </div>
    <div className="scan-foot"><ShieldCheck size={16}/><span>A análise é feita inteiramente no seu {platformCopy.computer}.</span><button onClick={onScan}>{scanning ? "Analisando…" : "Analisar agora"}</button></div>
  </div>
}

function MiniMap({ folders, onClick }: { folders: NativeFolder[]; onClick: () => void }) {
  const items = layoutTreemap(folders.slice(0, 5));
  return <button className="mini-map card" onClick={onClick} aria-label="Abrir mapa do disco"><div className="map-tiles proportional">{items.length ? items.map((folder,index)=><span className={`tile tile-${String.fromCharCode(97+index)}`} style={{left:`${folder.x}%`,top:`${folder.y}%`,width:`${folder.width}%`,height:`${folder.height}%`}} key={folder.path}>{folder.name}<small>{formatGB(bytesToGB(folder.sizeBytes))}</small></span>) : <span className="map-empty">Analise o PC para montar o mapa real.</span>}</div><div className="map-caption"><span><HardDrive size={17}/>Mapa do disco</span><small>Cada bloco representa o espaço real de uma pasta</small></div></button>
}

type TreemapItem = NativeFolder & { x: number; y: number; width: number; height: number };

function layoutTreemap(items: NativeFolder[]): TreemapItem[] {
  const result: TreemapItem[] = [];
  const place = (group: NativeFolder[], x: number, y: number, width: number, height: number) => {
    if (!group.length) return;
    if (group.length === 1) {
      result.push({ ...group[0], x, y, width, height });
      return;
    }
    const total = group.reduce((sum, item) => sum + Math.max(item.sizeBytes, 1), 0);
    let running = 0;
    let split = 1;
    for (; split < group.length; split += 1) {
      running += Math.max(group[split - 1].sizeBytes, 1);
      if (running >= total / 2) break;
    }
    const first = group.slice(0, split);
    const second = group.slice(split);
    const firstTotal = first.reduce((sum, item) => sum + Math.max(item.sizeBytes, 1), 0);
    const ratio = firstTotal / total;
    if (width >= height) {
      const firstWidth = width * ratio;
      place(first, x, y, firstWidth, height);
      place(second, x + firstWidth, y, width - firstWidth, height);
    } else {
      const firstHeight = height * ratio;
      place(first, x, y, width, firstHeight);
      place(second, x, y + firstHeight, width, height - firstHeight);
    }
  };
  place(items, 0, 0, 100, 100);
  return result;
}

const extensionOf = (name: string) => name.includes(".") ? `.${name.split(".").pop()!.toLowerCase()}` : "sem extensão";
const extensionClass = (name: string) => {
  const ext = extensionOf(name);
  if ([".mp4",".mov",".mkv",".avi",".webm"].includes(ext)) return "ext-video";
  if ([".jpg",".jpeg",".png",".gif",".webp",".raw",".psd"].includes(ext)) return "ext-image";
  if ([".mp3",".wav",".flac",".aiff",".m4a",".aac"].includes(ext)) return "ext-audio";
  if ([".zip",".rar",".7z",".iso",".msi",".dmg"].includes(ext)) return "ext-archive";
  if ([".exe",".dll",".sys",".app"].includes(ext)) return "ext-system";
  if ([".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt"].includes(ext)) return "ext-document";
  return "ext-other";
};

function DiskMap({ folders, treemapFiles, scannedFiles, root, onOpenFolder }: { folders: NativeFolder[]; treemapFiles: NativeLargeFile[]; scannedFiles: number; root: string; onOpenFolder: (path: string) => void }) {
  const [currentFolders, setCurrentFolders] = useState<NativeFolder[]>(folders);
  const [currentPath, setCurrentPath] = useState(root);
  const [history, setHistory] = useState<Array<{ path: string; folders: NativeFolder[] }>>([]);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  useEffect(() => { setCurrentFolders(folders); setCurrentPath(root); setHistory([]); setSelectedPath(""); }, [folders, root]);
  useEffect(() => {
    if (!selectedPath) return;
    requestAnimationFrame(() => document.querySelector(".folder-row.selected")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [selectedPath, currentFolders]);
  const enterFolder = async (folder: NativeFolder) => {
    if (!folder.isDir || !folder.path || loadingFolder) return;
    setLoadingFolder(true);
    try {
      const children = await scanFolderChildren(folder.path);
      setHistory(value => [...value, { path: currentPath, folders: currentFolders }]);
      setCurrentPath(folder.path);
      setCurrentFolders(children);
      setSelectedPath("");
    } finally { setLoadingFolder(false); }
  };
  const parentPathOf = (path: string) => {
    const splitAt = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
    if (splitAt < 0) return root;
    let parent = path.slice(0, splitAt);
    if (/^[a-z]:$/i.test(parent)) parent += "\\";
    return parent || "/";
  };
  const focusItem = async (item: NativeFolder) => {
    if (item.isDir) return enterFolder(item);
    if (!item.path || loadingFolder) return;
    const parentPath = parentPathOf(item.path);
    if (parentPath === currentPath) {
      setSelectedPath(item.path);
      return;
    }
    setLoadingFolder(true);
    try {
      const siblings = await scanFolderChildren(parentPath);
      setHistory(value => [...value, { path: currentPath, folders: currentFolders }]);
      setCurrentPath(parentPath);
      setCurrentFolders(siblings);
      setSelectedPath(item.path);
    } finally { setLoadingFolder(false); }
  };
  const goBack = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setCurrentPath(previous.path);
    setCurrentFolders(previous.folders);
    setHistory(value => value.slice(0, -1));
    setSelectedPath("");
  };
  const goRoot = () => { setCurrentPath(root); setCurrentFolders(folders); setHistory([]); setSelectedPath(""); };
  const fallbackFolders: NativeFolder[] = [
    { name:isWindows?"AppData":"Biblioteca", path:"", isDir:true, sizeBytes:94.2*1024**3, fileCount:642118 },
    { name:"Vídeos", path:"", isDir:true, sizeBytes:61.8*1024**3, fileCount:248 },
    { name:"Documentos", path:"", isDir:true, sizeBytes:43.1*1024**3, fileCount:18472 },
    { name:"Imagens", path:"", isDir:true, sizeBytes:36.4*1024**3, fileCount:22614 },
    { name:"Downloads", path:"", isDir:true, sizeBytes:24.7*1024**3, fileCount:1906 },
    { name:"Música", path:"", isDir:true, sizeBytes:12.2*1024**3, fileCount:8142 },
    { name:isWindows?"Área de Trabalho":"Desktop", path:"", isDir:true, sizeBytes:8.1*1024**3, fileCount:712 }
  ];
  const shownFolders = (currentFolders.length ? currentFolders : (isWindows ? [] : fallbackFolders)).slice(0, 120);
  const levelTotal = shownFolders.reduce((sum, folder) => sum + folder.sizeBytes, 0);
  const atRoot = currentPath === root;
  const rawVisualSource: NativeFolder[] = atRoot && treemapFiles.length ? treemapFiles.map(file => ({ name:file.name, path:file.path, isDir:false, sizeBytes:file.sizeBytes, fileCount:1 })) : shownFolders;
  const visualSource = [...rawVisualSource].sort((a,b) => {
    const colorA = a.isDir ? "ext-folder" : extensionClass(a.name);
    const colorB = b.isDir ? "ext-folder" : extensionClass(b.name);
    return colorA.localeCompare(colorB) || b.sizeBytes - a.sizeBytes;
  });
  const treemapItems = layoutTreemap(visualSource);
  const visualTotal = visualSource.reduce((sum, item) => sum + item.sizeBytes, 0);
  const colorLabels: Record<string,string> = { "ext-folder":"Pastas", "ext-video":"Vídeos", "ext-image":"Imagens", "ext-audio":"Áudio", "ext-archive":"Compactados", "ext-system":"Sistema", "ext-document":"Documentos", "ext-other":"Outros" };
  const colorTotals = visualSource.reduce<Record<string, number>>((totals, item) => { const color=item.isDir ? "ext-folder" : extensionClass(item.name); totals[color]=(totals[color] ?? 0)+item.sizeBytes; return totals; }, {});
  const colorLegend = Object.entries(colorTotals).sort((a,b)=>b[1]-a[1]);
  const shownFileCount = scannedFiles || 1_772_430;
  const selectedItem = selectedPath ? (visualSource.find(item => item.path === selectedPath) ?? shownFolders.find(item => item.path === selectedPath)) : undefined;
  return <div className="page-content disk-page"><div className="page-intro disk-intro"><div><p className="eyebrow">{platformCopy.disk.toUpperCase()} · {scannedFiles ? shownFileCount.toLocaleString("pt-BR") : "NÃO ANALISADO"} {scannedFiles ? "ARQUIVOS" : ""}</p><h2>Arquivos em cima. Espaço embaixo.</h2><p>Navegue pelas pastas e selecione qualquer bloco para localizar o arquivo que ocupa aquele espaço.</p></div></div>
    <div className="folder-toolbar card"><button onClick={goBack} disabled={!history.length}>← Voltar</button><button className="root-button" onClick={goRoot} disabled={atRoot}>Raiz</button><span title={currentPath}>{currentPath || platformCopy.home}</span><button onClick={() => currentPath && onOpenFolder(currentPath)} disabled={!currentPath}><FolderOpen size={15}/> Abrir no {isWindows ? "Explorador" : "Finder"}</button></div>
    <div className="folder-browser unified-browser card"><div className="folder-head"><span>PASTA OU ARQUIVO</span><span>PORCENTAGEM</span><span>ITENS</span><span>TAMANHO</span><span/></div><div className="folder-scroll">{shownFolders.length ? shownFolders.map(folder=>{const percent=levelTotal ? (folder.sizeBytes/levelTotal)*100 : 0; const selected=folder.path===selectedPath; return <div className={`folder-row${selected ? " selected" : ""}`} key={folder.path || folder.name}><button className="folder-name" onClick={()=>focusItem(folder)}>{folder.isDir ? <FolderOpen size={16}/> : <Files size={16}/>}<strong>{folder.name}</strong>{folder.isDir && <ChevronRight size={14}/>}</button><div className="folder-percent"><i><b style={{width:`${Math.max(percent,.5)}%`}}/></i><span>{percent.toLocaleString("pt-BR", {minimumFractionDigits:percent<.1?2:0, maximumFractionDigits:2})}%</span></div><span>{folder.fileCount.toLocaleString("pt-BR")}</span><b>{formatGB(bytesToGB(folder.sizeBytes))}</b><button className="folder-external" aria-label={`Abrir ${folder.name}`} onClick={()=>onOpenFolder(folder.path)}><FolderOpen size={15}/></button></div>}) : <div className="empty-state">{loadingFolder ? "Lendo esta pasta…" : "Analise o disco para navegar pelos arquivos."}</div>}</div></div>
    <div className="map-context unified-map-context"><div className="extension-legend">{colorLegend.map(([color,size])=><span key={color}><i className={color}/><b>{colorLabels[color]}</b>{visualTotal ? ((size/visualTotal)*100).toLocaleString("pt-BR",{maximumFractionDigits:1}) : 0}%</span>)}</div>{selectedItem && <div className="map-selection" title={selectedItem.path}><i className={selectedItem.isDir ? "ext-folder" : extensionClass(selectedItem.name)}/><strong>{selectedItem.name}</strong><span>{formatGB(bytesToGB(selectedItem.sizeBytes))}</span><b>{visualTotal ? ((selectedItem.sizeBytes/visualTotal)*100).toLocaleString("pt-BR",{maximumFractionDigits:2}) : 0}%</b></div>}</div>
    <div className="full-map card"><div className={atRoot && treemapFiles.length ? "treemap dense label-free" : "treemap label-free"}>{treemapItems.length ? treemapItems.map(item=>{const percent=visualTotal ? (item.sizeBytes/visualTotal)*100 : 0; const color=item.isDir ? "ext-folder" : extensionClass(item.name); return <button aria-label={`Localizar ${item.name}`} className={`tm ${color}${selectedPath && item.path===selectedPath ? " selected" : ""}`} style={{left:`${item.x}%`,top:`${item.y}%`,width:`${item.width}%`,height:`${item.height}%`}} key={item.path || item.name} onClick={()=>focusItem(item)} title={`${item.name} · ${formatGB(bytesToGB(item.sizeBytes))} · ${percent.toLocaleString("pt-BR",{maximumFractionDigits:2})}%`}/>}):<div className="empty-state map-empty-state">{loadingFolder ? "Lendo esta pasta…" : "Clique em “Analisar este PC” para criar o mapa."}</div>}</div></div>
  </div>
}

function Cleanup({ categories, onToggle, selectedSize, onClean }: { categories: CleanCategory[]; onToggle: (id:string)=>void; selectedSize:number; onClean:()=>void }) {
  return <div className="page-content"><div className="page-intro"><div><p className="eyebrow">LIMPEZA COM CONTEXTO</p><h2>Você decide. A gente explica.</h2><p>Nada é apagado de forma definitiva: os itens selecionados vão para a {platformCopy.trash}.</p></div></div><div className="clean-layout"><div className="risk-groups">{(["safe","review","care"] as Risk[]).map(risk => <section className="risk-section card" key={risk}><div className={`risk-title ${riskMeta[risk].className}`}><span/><strong>{riskMeta[risk].label}</strong><small>{formatGB(categories.filter(c=>c.risk===risk).reduce((s,c)=>s+c.size,0))}</small></div>{categories.filter(c=>c.risk===risk).map(c=><label className="clean-row" key={c.id}><input type="checkbox" checked={c.selected} onChange={()=>onToggle(c.id)}/><span className="fake-check"><Check size={13}/></span><div><strong>{c.title}</strong><small>{c.description} · {c.count.toLocaleString("pt-BR")} itens</small></div><b>{formatGB(c.size)}</b></label>)}</section>)}</div><aside className="clean-summary card"><span className="summary-icon"><Trash2 size={23}/></span><p>Selecionado para limpeza</p><strong>{formatGB(selectedSize)}</strong><small>{platformCopy.restore}</small><button disabled={!selectedSize} onClick={onClean}>Revisar e limpar</button><div><ShieldCheck size={15}/>Nenhum arquivo será removido sem a sua confirmação.</div></aside></div></div>
}

function LargeFiles({ files }: { files: LargeFile[] }) { return <div className="page-content"><div className="page-intro"><div><p className="eyebrow">ACIMA DE 500 MB</p><h2>Grandes, antigos e fáceis de esquecer</h2><p>Ordenados por tamanho. Abra no Explorador antes de decidir.</p></div></div><div className="table card"><div className="table-head"><span>Arquivo</span><span>Tipo</span><span>Encontrado</span><span>Tamanho</span></div>{files.map(f=><div className="table-row" key={`${f.path}-${f.name}`}><div><span className="file-icon"><Files size={17}/></span><p><strong>{f.name}</strong><small>{f.path}</small></p></div><span>{f.kind}</span><span>{f.age}</span><b>{formatGB(f.size)}</b></div>)}</div></div> }

function AppsView({ apps }: { apps: NativeInstalledApp[] }) {
  return <div className="page-content"><div className="page-intro"><div><p className="eyebrow">REGISTRO DO WINDOWS</p><h2>Aplicativos instalados</h2><p>Tamanhos e ícones informados pelos próprios instaladores. Nenhuma desinstalação é feita nesta versão.</p></div><span className="count-badge">{apps.length.toLocaleString("pt-BR")} encontrados</span></div><div className="app-grid">{apps.length ? apps.slice(0, 80).map((app,i)=><div className="app-card card" key={`${app.name}-${i}`}>{app.iconDataUrl ? <img className="app-real-icon" src={app.iconDataUrl} alt=""/> : <span className={`app-avatar av-${i%4}`}>{app.name[0]?.toUpperCase()}</span>}<div><strong>{app.name}</strong><small>{app.publisher || app.installLocation || "Editor não informado"}</small></div><b>{app.sizeBytes ? formatGB(bytesToGB(app.sizeBytes)) : "—"}</b></div>) : <div className="empty-state card">Nenhum aplicativo foi retornado pelo Registro do Windows.</div>}</div></div>
}

function AIView({ tools }: { tools: NativeAiTool[] }) {
  const total = tools.reduce((sum, tool) => sum + bytesToGB(tool.sizeBytes), 0);
  const running = tools.filter(tool => tool.running).length;
  return <div className="page-content"><div className="page-intro"><div><p className="eyebrow">{platformCopy.aiEyebrow}</p><h2>{formatGB(total)} em dados detectados</h2><p>Leitura local das ferramentas conhecidas encontradas neste PC.</p></div><span className="live-badge"><i/>{running} em execução</span></div><div className="ai-grid">{tools.length ? tools.map((tool,index)=><div className="ai-card card" key={tool.name}><div className={`tool-logo tool-color-${index}`}>{tool.name[0]}</div><div><strong>{tool.name}</strong><small>{tool.path || `${tool.fileCount.toLocaleString("pt-BR")} arquivos locais`}</small></div><b>{formatGB(bytesToGB(tool.sizeBytes))}</b><span className={tool.running?"running":"stopped"}>{tool.running?"Em execução":"Parado"}</span></div>) : <div className="empty-state card">O Folga não encontrou Ollama, LM Studio, Cursor ou Claude neste PC.</div>}</div></div>
}

function Monitor({ metrics, apps }: { metrics: NativeSystemMetrics | null; apps: NativeInstalledApp[] }) {
  const fallback = isWindows ? ["Cursor","Microsoft Edge","Docker Desktop","Ollama"] : ["Cursor","Safari","Docker Desktop","Ollama"];
  const memoryPercent = metrics ? Math.round((metrics.usedMemoryBytes / metrics.totalMemoryBytes) * 100) : 62;
  const cards = [
    {l:"Processador",v:`${Math.round(metrics?.cpuPercent ?? 18)}%`,c:"#6577ef",w:metrics?.cpuPercent ?? 18},
    {l:"Memória",v:metrics ? `${bytesToGB(metrics.usedMemoryBytes).toFixed(1)} de ${bytesToGB(metrics.totalMemoryBytes).toFixed(0)} GB` : "9,8 de 16 GB",c:"#8d6ad8",w:memoryPercent},
    {l:"Disco",v:"Monitorado",c:"#e4a33d",w:38},
    {l:"Rede",v:"Local",c:"#36a779",w:44}
  ];
  const processes = metrics?.processes.slice(0, 6) ?? fallback.map((name,index) => ({name,cpuPercent:78-index*16,memoryBytes:[2.8,2.1,1.6,1.2][index]*1024**3}));
  const maxMemory = Math.max(...processes.map(process => process.memoryBytes), 1);
  const processIcon = (name: string) => {
    const normalized = name.toLowerCase().replace(/\.exe$/i, "").replace(/[^a-z0-9]/g, "");
    const aliases: Record<string, string> = { msedge:"microsoftedge", code:"visualstudiocode", dockerdesktop:"dockerdesktop" };
    const key = aliases[normalized] ?? normalized;
    return apps.find(app => { const appKey = app.name.toLowerCase().replace(/[^a-z0-9]/g, ""); return app.iconDataUrl && (appKey.includes(key) || key.includes(appKey)); })?.iconDataUrl;
  };
  return <div className="page-content"><div className="page-intro"><div><p className="eyebrow">AGORA</p><h2>{platformCopy.monitorTitle}</h2><p>Uma leitura simples do que está acontecendo neste momento.</p></div><span className="live-badge"><i/>Atualização ao vivo</span></div><div className="monitor-grid">{cards.map(m=><div className="metric card" key={m.l}><span>{m.l}</span><strong>{m.v}</strong><div className="spark">{[30,55,42,70,38,62,46,80,58,73].map((h,i)=><i key={i} style={{height:`${Math.max(14,(h*m.w)/55)}%`,background:m.c}}/>)}</div></div>)}</div><div className="card process-card"><div className="card-head"><div><span className="mini-icon blue"><Activity size={17}/></span><div><strong>Mais ativos agora</strong><small>Processos ordenados por uso de memória</small></div></div></div>{processes.map(process=>{const icon=processIcon(process.name); return <div className="process-row" key={process.name}>{icon ? <img className="process-icon" src={icon} alt=""/> : <span>{process.name[0]?.toUpperCase()}</span>}<strong>{process.name}</strong><i><b style={{width:`${Math.max(3,(process.memoryBytes/maxMemory)*100)}%`}}/></i><small>{formatGB(bytesToGB(process.memoryBytes))}</small></div>})}</div></div>
}

export default App;
