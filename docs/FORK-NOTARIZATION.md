# Fork build: unsigned, Homebrew-delivered

This repository is a fork of [vakovalskii/copyosity](https://github.com/vakovalskii/copyosity).
It exists to carry two things the upstream project does not provide: the
`smart-actions` clipboard feature set and a distribution channel that does not
depend on the author's Apple credentials.

## What "unsigned" means here

| Property                | Upstream release                                                            | This fork's release                           |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| Code signature          | `Developer ID Application: Valeriy Kovalsky (A933C2TJXU)`, hardened runtime | ad-hoc (`codesign -s -`), no hardened runtime |
| Notarization            | submitted with `notarytool`, ticket stapled                                 | none — no Apple ID, no team membership        |
| Updater artifacts       | `.app.tar.gz` + `latest.json`, minisign key `9E3D3817251B2075`              | none — the private key belongs to upstream    |
| Self-update in Settings | yes (GitHub endpoint)                                                       | disabled, `plugins.updater.endpoints = []`    |
| Install path            | browser download → Gatekeeper → quarantine                                  | `brew install` → no quarantine attribute      |

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

## Why the quarantine difference matters

Gatekeeper only evaluates a bundled app that carries `com.apple.quarantine`,
which a browser attaches. `curl`, and therefore `brew`, does not. So a cask
install of an unnotarized app runs where the same app downloaded by hand would
need a right-click Open override. This is the practical reason the fork ships
through Homebrew instead of just publishing DMGs.

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
