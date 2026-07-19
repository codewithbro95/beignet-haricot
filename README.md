# beignet haricot

A lightweight cross-platform desktop client for OpenMind, built with Tauri v2, Preact, TypeScript, and Rust.

Version `0.0.1` includes:

- search-first local memory discovery and file opening
- secure local previews for indexed image results
- streaming Ask responses with sources
- source folder management with a native folder picker
- live indexing progress with start, pause, resume, and stop controls
- connection, provider, and model status
- a configurable loopback API address

## Requirements

- Node.js 20 or newer
- Rust 1.77.2 or newer
- the platform prerequisites from the [Tauri v2 guide](https://v2.tauri.app/start/prerequisites/)
- OpenMind configured and running locally

Start OpenMind first:

```bash
openmind serve
```

Then install and run the client:

```bash
npm install
npm run tauri dev
```

Create a production bundle:

```bash
npm run tauri build
```

## Development And Releases

Development work targets the `develop` branch. Releases are made by merging `develop` into `main` with a new version in `app.config.json` and a matching section in `CHANGELOG.md`.

Every push and pull request to `develop` or `main` runs the cross-platform test workflow. When a version that does not already have a published GitHub release reaches `main`, GitHub Actions builds macOS, Windows, and Linux installers, uploads all assets to a draft, and publishes the release only after every platform succeeds.

See [RELEASING.md](RELEASING.md) for the release checklist and signing limitations.

## App Name And Version

The app name, version, identifier, and description have one source of truth:

```text
app.config.json
```

Change that file, then run:

```bash
npm run sync:config
```

The normal development and build commands run the same synchronization automatically. It updates the package metadata, Cargo metadata, Tauri product name, window title, bundle identifier, and HTML title.

## Security

The webview never receives or reads the OpenMind bearer token. The Rust layer reads `~/.openmind/api_token` and sends authenticated requests to OpenMind.

The native bridge:

- accepts only `http://127.0.0.1` addresses
- follows no redirects
- exposes only documented product-level OpenMind endpoints
- grants no shell or broad filesystem access to the webview
- allows only the bundled `main` window to call the bridge

## Project Structure

```text
app.config.json          app identity and version
src/                     Preact interface and typed API client
src-tauri/src/           constrained Rust API bridge
src-tauri/capabilities/  Tauri security permissions
src-tauri/icons/         generated cross-platform application icons
scripts/                 metadata synchronization
```
