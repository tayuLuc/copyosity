# Auto-update — how it works & how to release (fork)

Copyosity uses `tauri-plugin-updater`. On launch (and via **Settings → Updates**)
the app fetches a manifest from GitHub Releases, and if a newer, **signed** version
exists it downloads and installs it, then relaunches.

This fork changed three things about that story: the channel, the key and the
platform coverage. Everything about the mechanism is upstream's.

- **Update source:** `https://github.com/tayuLuc/copyosity/releases/latest/download/latest.json`
  (configured in `src-tauri/tauri.conf.json → plugins.updater.endpoints`, one endpoint —
  upstream's mirror at `vkovalskii.com` is not ours to serve).
- **Signature:** every update artifact is signed with the **fork's** minisign key;
  the app verifies it against the public key in `tauri.conf.json → plugins.updater.pubkey`
  (key id `1F02BEF343E06964`). Upstream's key id `9E3D3817251B2075` must never appear in
  a fork build; `.github/workflows/release-fork.yml` → _Config gate_ asserts both the key
  id and that the endpoint belongs to the repository the workflow runs in.
  This signature is **separate** from Apple Developer ID / notarization, which this fork
  does not have — see [FORK-NOTARIZATION.md](FORK-NOTARIZATION.md).
- **Platforms:** `latest.json` carries `darwin-aarch64` **and** `darwin-x86_64`. Upstream's
  generator emitted the Apple Silicon entry only, so Intel installs were never offered an
  update; `scripts/make-latest-json.sh` now refuses to write a manifest with a platform
  missing.

## Keys

- Private key: `../../secrets/copyosity-fork-updater.key` (outside the repository, `chmod 600`),
  password in the sibling `copyosity-fork-updater.pass`. Unlike upstream's key this one is
  password-protected.
- Public key: `../../secrets/copyosity-fork-updater.key.pub`, embedded in `tauri.conf.json`.
- CI secrets: `TAURI_SIGNING_PRIVATE_KEY` (key contents) and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, both set on `tayuLuc/copyosity`.
- **No backup of the private key exists, on purpose.** Losing it means every installed copy
  rejects all future updates (signature verification is not degradable); recovery is a new
  key pair plus a manual reinstall through Homebrew.

## Releasing an update

The chain is: commit on `main` → bump the version in all four manifests
(`src-tauri/tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`)
→ push an annotated tag `v<version>` → CI builds both arches, re-signs ad-hoc, repacks the
updater tarball, publishes the release with `--latest`, assembles `latest.json` and finally
re-reads the published manifest to assert version, both platforms and both URLs.

```bash
git tag -a v1.0.4-fork4 -m "notes become the release body" && git push origin v1.0.4-fork4
```

Nothing in that list needs Apple credentials, which is the point of the fork. Locally:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ../../secrets/copyosity-fork-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ../../secrets/copyosity-fork-updater.pass)"
npm run tauri build -- --bundles app
ART_DIR=src-tauri/target/release/bundle/macos ./scripts/make-latest-json.sh "notes"
```

`latest.json` must be a release asset so the `latest/download/latest.json` URL resolves, and
the release must be marked latest — every tag here carries a `-forkN` suffix, which GitHub's
semver ordering does not treat as newer than the bare number, so `--latest` is passed
explicitly in CI.

## Measured on a live install (fork3 → fork4, 10.10.2026)

Installed from the cask at `1.0.4-fork3`, restarted, updated itself:

```
[19:17:28] launch: running 1.0.4-fork3, checking for updates…
[19:17:29] launch: update 1.0.4-fork4 found — downloading + installing…
[19:17:31] launch: installed 1.0.4-fork4 — restart to apply
```

Four things that measurement settles:

1. Download plus install took 2.1 s for a 7 MB tarball, and `codesign --verify --deep
--strict` passes on the result — the signature CI made over the repacked tarball
   survives the plugin's install.
2. The on-launch path **installs and waits**: the log says "restart to apply" and the old
   process keeps running the previous code until it is quit. The Settings button uses the
   Rust `install_update` command, which restarts through `RESTART_EXIT_CODE`; making the
   launch path restart by itself is open work, not a defect of the channel.
3. `com.apple.quarantine` is **absent** on the self-updated bundle (`com.apple.provenance`
   is the only xattr left), while a cask install leaves the quarantine flag on. The updater
   writes the file itself rather than going through a browser download, so Gatekeeper never
   sees something to flag. That is a property of the channel, not a gain in trust: what
   protects an update is the minisign signature, checked before install.
4. Homebrew kept reporting `1.0.4-fork3` (`brew list --cask --versions`) while the disk held
   fork4, and `brew outdated` did not name the cask — `auto_updates true` doing its job, not
   a stale meter.

## Homebrew and the updater coexist

`brew install --cask tayuLuc/copyosity/copyosity` pins a version and its sha256; the in-app
updater floats to whatever the release channel says. After a self-update Homebrew still
believes the pinned version is installed, so `brew upgrade --cask copyosity` will put the
older build back. `Casks/copyosity.rb` declares `auto_updates true` for exactly that reason:
brew stops reporting the cask as outdated and the two channels stop fighting.

## Upstream invariants kept

- Updater tarballs carry **0 AppleDouble (`._*`) entries**; the CI repacks with
  `COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs` and asserts the entry list in Python
  (`tar tzf` hides them). The signature is made **after** the repack, over those exact bytes.
- Install must run with `TMPDIR` on the app's own volume or `rename()` fails with EXDEV;
  upstream's fix lives in the Rust `install_update` command and the menu-bar exit guard that
  lets the updater relaunch through. Both are inherited unchanged.
