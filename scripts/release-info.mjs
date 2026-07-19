import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "check";
const config = await readJson("app.config.json");
const version = String(config.version ?? "");

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail("app.config.json must contain a three-part semantic version such as 0.0.2.");
}

const changelog = await readText("CHANGELOG.md");
const notes = releaseNotes(changelog, version);

if (mode === "version") {
  process.stdout.write(version);
} else if (mode === "notes") {
  process.stdout.write(`${notes}\n`);
} else if (mode === "check") {
  await verifySynchronizedMetadata(version, config.name, slugify(config.name));
  process.stdout.write(`Release metadata is consistent for v${version}.\n`);
} else {
  fail("Usage: node scripts/release-info.mjs [check|version|notes]");
}

async function verifySynchronizedMetadata(expectedVersion, expectedName, expectedSlug) {
  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const tauri = await readJson("src-tauri/tauri.conf.json");
  const cargo = await readText("src-tauri/Cargo.toml");

  const versions = [
    ["package.json", packageJson.version],
    ["package-lock.json", packageLock.version],
    ["package-lock.json root package", packageLock.packages?.[""]?.version],
    ["tauri.conf.json", tauri.version],
    ["Cargo.toml", cargo.match(/^version = "([^"]+)"$/m)?.[1]],
  ];
  for (const [source, value] of versions) {
    if (value !== expectedVersion) {
      fail(`${source} has version ${value ?? "<missing>"}; run npm run sync:config.`);
    }
  }
  const names = [
    ["package.json", packageJson.name],
    ["package-lock.json", packageLock.name],
    ["package-lock.json root package", packageLock.packages?.[""]?.name],
    ["Cargo.toml", cargo.match(/^name = "([^"]+)"$/m)?.[1]],
  ];
  for (const [source, value] of names) {
    if (value !== expectedSlug) {
      fail(`${source} has package name ${value ?? "<missing>"}; run npm run sync:config.`);
    }
  }
  if (tauri.productName !== expectedName || tauri.app?.windows?.[0]?.title !== expectedName) {
    fail("Tauri app naming is out of sync; run npm run sync:config.");
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function releaseNotes(markdown, targetVersion) {
  const escaped = targetVersion.replaceAll(".", "\\.");
  const header = new RegExp(`^## ${escaped}(?:\\s+-\\s+[^\\n]+)?$`, "m").exec(markdown);
  if (!header) fail(`CHANGELOG.md does not contain a section for ${targetVersion}.`);
  const bodyStart = header.index + header[0].length;
  const remaining = markdown.slice(bodyStart).replace(/^\r?\n/, "");
  const nextHeader = remaining.search(/^## /m);
  const body = (nextHeader === -1 ? remaining : remaining.slice(0, nextHeader)).trim();
  if (!body || !body.split("\n").some((line) => line.startsWith("- "))) {
    fail(`CHANGELOG.md section ${targetVersion} needs at least one user-facing bullet point.`);
  }
  return body;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
