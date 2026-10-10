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
| Updater artifacts       | `.app.tar.gz` + `latest.json`, minisign key `9E3D3817251B2075`              | none — the private key belongs to upstream                                          |
| Self-update in Settings | yes (GitHub endpoint)                                                       | disabled, `plugins.updater.endpoints = []`                                          |
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
verified on download, `livecheck` against our own releases, `brew upgrade --cask`
as the update channel, and no reliance on the vendor mirror. Signature-wise it buys
nothing: this build is ad-hoc signed and unnotarized, and says so.

## Updating

```sh
brew update
brew upgrade --cask copyosity
```

There is no in-app path: the fork cannot produce artifacts the upstream pubkey
would accept, and pointing the fork at the upstream channel would silently
replace this build with upstream's and drop the fork's changes.

## What is in this fork

1. `LICENSE` — upstream declares `"license": "MIT"` in `package.json` and ships
   no license file; the standard text is added with both copyright lines.
2. `smart-actions` cherry-picked from `ed-would/copyosity@0aebfdf0` and
   `97b5aeb6`, rebased onto current upstream main.
3. `build(fork)`: ad-hoc signing identity, updater artifacts and endpoints off,
   version `1.0.4-fork1`.
4. `.github/workflows/release-fork.yml` — tag-triggered matrix build
   (aarch64 + x64) publishing UDZO DMGs, in place of upstream's notarized
   pipeline.
