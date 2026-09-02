/*
 * SplitFree desktop: serve la build web statica (cartella app/) attraverso
 * un protocollo personalizzato, così i percorsi assoluti generati da Expo
 * ("/_expo/static/...") funzionano e ogni rotta sconosciuta torna a index.html.
 */
const { app, BrowserWindow, protocol, net, shell, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const APP_DIR = path.join(__dirname, "app");
const SCHEME = "splitfree";

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const candidate = path.normalize(path.join(APP_DIR, clean));
  if (!candidate.startsWith(APP_DIR)) return path.join(APP_DIR, "index.html");
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return path.join(APP_DIR, "index.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 420,
    minHeight: 640,
    title: "SplitFree",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0B1120" : "#F3F5FA",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`${SCHEME}://app/`);
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const file = resolveFile(url.pathname === "/" ? "/index.html" : url.pathname);
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
