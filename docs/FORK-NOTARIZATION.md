# Fork build: unsigned, Homebrew-delivered

This repository is a fork of [vakovalskii/copyosity](https://github.com/vakovalskii/copyosity).
It exists to carry two things the upstream project does not provide: the
`smart-actions` clipboard feature set and a distribution channel that does not
depend on the author's Apple credentials.

## What "unsigned" means here

| Property                | Upstream release                                                            | This fork's release                                                                 |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Code signature          | `Developer ID Application: Valeriy Kovalsky (A933C2TJXU)`, hardened runtime | ad-hoc (`codesign -s -`), no hardened runtime                                       |
| Notarization            | submitted with `notarytool`, ticket stapled                                 | none — no Apple ID, no team membership                                              |
| Updater artifacts       | `.app.tar.gz` + `latest.json`, minisign key `9E3D3817251B2075`              | `.app.tar.gz` + `.sig` per arch + `latest.json`, fork key `1F02BEF343E06964`        |
| Self-update in Settings | yes (upstream releases + vkovalskii.com mirror)                             | yes — this repository's channel only, enforced by the Config gate                   |
| Install path            | browser download → Gatekeeper prompt                                        | `brew install` → quarantined too, but launches (measured on 1.0.4-fork1, see below) |

Ad-hoc signing is not optional on Apple Silicon: an arm64 binary with no
signature at all is killed at exec time. The linker stamps one, but without
`_CodeSignature/CodeResources`, which Gatekeeper reports as "code has no
resources but signature indicates they must be present", so the workflow
re-signs with the `codesign` tool before packaging (lesson copied from
`superbereza/copyosity`).

`spctl -a -vv` on these artifacts answers `rejected, source=Unnotarized
Developer ID` — expected, and worth knowing because upstream's README promises
notarization that its own released DMGs do not carry either (see the
`CreateUpdateArtifact`-free v1.0.3 asset).

## What installing this build actually does (measured 2026-10-10)

An earlier draft of this page claimed a cask install arrives without
`com.apple.quarantine` because `curl` does not set it. That was generalized from
one probe (a plain `curl -o` download of the DMG: `com.apple.provenance` only) to
a different object, and it is wrong. After `brew install --cask
tayuLuc/copyosity/copyosity` on macOS 26.6.2:

1. The DMG in `~/Library/Caches/Homebrew/downloads/` carries
   `com.apple.quarantine` with flags `0281;<timestamp>;;<uuid>`.
2. The installed bundle inherits the same record (flags `03c1`), so the attribute
   propagates when the app is copied out of the image.
3. `spctl -a -t install /Applications/Copyosity.app` still answers `rejected`.
4. `open -a` launched it with no dialog and the record gained the user-approved
   bit `0x0040` — most likely because this bundle id at this path had already been
   approved on this machine (upstream 1.0.3 ran here first). On a clean machine,
   expect one right-click → Open.

What the cask genuinely buys instead: a SHA-256 pinned per architecture and
verified on download, and a repeatable install line for a machine that has never
seen this repository. It is a _pinned_ channel, not the update channel — the app
updates itself, see below. Signature-wise it buys nothing: this build is ad-hoc
signed and unnotarized, and says so.

## Updating

Two channels, deliberately different:

```sh
# rolling: the app checks releases/latest/download/latest.json on launch
# and installs what our own minisign key vouches for
open -a Copyosity

# pinned: brew installs exactly the artifact whose sha256 is in the cask
brew tap tayuLuc/copyosity
brew install --cask tayuLuc/copyosity/copyosity
brew reinstall --cask copyosity   # deliberately return to the pinned build
```

The cask declares `auto_updates true`, so `brew upgrade --cask` leaves a
self-updated install alone instead of rolling it back to the pin. Because the
updater endpoint and the pubkey are this repository's, an upstream build can no
longer replace a fork install over anyone's channel but its own — which is the
reason the fork mints its key at all.

Measured transition `1.0.4-fork3` → `1.0.4-fork4` on the machine this doc describes:
download plus install took 2.1 s, `codesign --verify --deep --strict` passes on the
resulting bundle, and Homebrew kept reporting `1.0.4-fork3` (`brew list --cask
--versions`) without the cask appearing in `brew outdated`. Details in
[AUTOUPDATE.md](AUTOUPDATE.md). Two consequences worth knowing before relying on this:

- The launch path installs and then waits for a restart ("restart to apply" in the
  log); only the Settings button restarts the process itself. Relaunching under the
  user is a product decision, not a channel defect.
- A self-updated bundle carries no `com.apple.quarantine` (only `com.apple.provenance`),
  unlike a cask install. That is how the channel works, not a trust gain — the thing
  protecting an update is the minisign signature checked before install.

## What is in this fork

1. `LICENSE` — upstream declares `"license": "MIT"` in `package.json` and ships
   no license file; the standard text is added with both copyright lines.
2. `smart-actions` cherry-picked from `ed-would/copyosity@0aebfdf0` and
   `97b5aeb6`, rebased onto current upstream main.
3. `build(fork)`: ad-hoc signing identity, updater channel pointed at this
   repository with the fork's own key, version suffix `-forkN` carried in all
   four manifests (`tauri.conf.json`, `package.json`, `Cargo.toml`, `Cargo.lock`),
   which the Config gate cross-checks.
4. `.github/workflows/release-fork.yml` — tag-triggered matrix build
   (aarch64 + x64): ad-hoc re-sign, DMG, AppleDouble-clean updater tarball,
   minisign signature made after the repack, one release with `--latest`,
   `latest.json` for both Mac platforms, and a final step that re-reads the
   published manifest over HTTPS and checks both URLs answer 200.
5. Release lineage runs off `main`: feature branch → merge → annotated tag on
   `main` → CI → the tap's `scripts/sync-cask.sh` picks up the new digests.
