import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "app.config.json"), "utf8"));

for (const key of ["name", "version", "identifier", "description"]) {
  if (!config[key] || typeof config[key] !== "string") {
    throw new Error(`app.config.json must contain a non-empty ${key}.`);
  }
}

const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.name = slugify(config.name);
packageJson.version = config.version;
await writeAtomic(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockPath = path.join(root, "package-lock.json");
try {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.name = packageJson.name;
  lock.version = config.version;
  if (lock.packages?.[""]) {
    lock.packages[""].name = packageJson.name;
    lock.packages[""].version = config.version;
  }
  await writeAtomic(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(await readFile(tauriPath, "utf8"));
tauri.productName = config.name;
tauri.version = config.version;
tauri.identifier = config.identifier;
tauri.app.windows[0].title = config.name;
await writeAtomic(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);

const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
let cargo = await readFile(cargoPath, "utf8");
cargo = replaceCargoField(cargo, "name", slugify(config.name));
cargo = replaceCargoField(cargo, "version", config.version);
cargo = replaceCargoField(cargo, "description", config.description);
await writeAtomic(cargoPath, cargo);

const htmlPath = path.join(root, "index.html");
const html = (await readFile(htmlPath, "utf8")).replace(
  /<title>.*?<\/title>/,
  `<title>${escapeHtml(config.name)}</title>`,
);
await writeAtomic(htmlPath, html);

async function writeAtomic(target, contents) {
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function replaceCargoField(source, field, value) {
  const expression = new RegExp(`^${field} = ".*"$`, "m");
  if (!expression.test(source)) throw new Error(`Cargo.toml is missing ${field}.`);
  return source.replace(expression, `${field} = "${value.replaceAll('"', '\\"')}"`);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
