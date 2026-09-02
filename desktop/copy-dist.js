/* Copia la build web di Expo (../dist) in ./app e l'icona in ./build. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const app = path.join(__dirname, "app");
const build = path.join(__dirname, "build");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("Build web non trovata: esegui prima `npm run export:web` nella cartella principale.");
  process.exit(1);
}

fs.rmSync(app, { recursive: true, force: true });
fs.cpSync(dist, app, { recursive: true });
fs.mkdirSync(build, { recursive: true });
const icon = path.join(root, "assets", "icon.png");
if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(build, "icon.png"));
console.log(`Copiata build web in ${app}`);
