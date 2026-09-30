# Distribution review — 30 September 2026

## This update

- Named creator credit on the home screen and in the HTML author metadata, for the legacy shell and multifile runtime.
- Creator attribution in the content feed and public notice; free unchanged APK sharing terms in SHARING_TERMS.md.
- Content version 17; shell version 3; runtime version 3. Nursing content is unchanged.
- Signing workflow now stages new signature files before checking for changes, so first-time signatures are committed. Temporary private key files are deleted after the job.

## Existing protections inspected

- Public update channel contains an ECDSA public key and an automated payload-signing workflow. Private signing material is excluded by .gitignore.
- Private app repository has a stable release-signing workflow using repository secrets and APK signature verification.
- Its separate core-nursing-distribution-hardening branch contains native signature verification, release obfuscation, and a distribution notice. These changes are not assumed to be installed on students' phones. No native changes or APK build are part of this credit update.

## Resumed native security candidate

- Recovered the unfinished engine-v3 signature enforcement, obfuscation, creator credit and private-material checks onto the separate private-app branch `core-nursing-distribution-security-v3`. Candidate code commit: `0be7e109336916f5ac955a67f4b3709541700cfd`. No merge to main.
- Stable build [36708497200](https://github.com/Ezz10099/Core-Nursing-Diagnostic-State/actions/runs/36708497200) passed: full JVM runtime/update tests, obfuscated release build, APK v2 signature verification and upgrade-package checks. Candidate version is `0.2.33` (version code `33`), with the existing Android signing certificate unchanged.
- The saved Android release-signing backup was located and checked without exposing its secrets. It does not contain the separate update-signing private key.
- The original live-update public trust key is unchanged. A missing matching private update-signing key still blocks authenticated-update rollout. Do not distribute the candidate to students until the three channel signatures and subsequent real-phone update/offline checks pass. The emulator WebView checks were skipped on this push.

## Remaining distribution checks

- Confirmed blocker: signing run 36704865429 failed at key loading because the repository secret CORE_NURSING_UPDATE_SIGNING_PRIVATE_KEY_PEM is missing/empty. This historical failure is superseded by the coordinated replacement below; the replacement private key must be configured for future automatic signing. Do not disable signature verification or substitute a new key without coordinating the native app trust key.
- Runtime validation run 36704865432 passed for commit dcb940a7a7e9040ddf8f5f70bfdbc21e79662223. Local manifest/hash and JavaScript syntax checks passed; nursing content was verified unchanged. Browser visual validation was blocked by an unsuccessful Chromium download.
- After configuring the signing secret, rerun the signing workflow and verify all three published signatures against the public key. Until then, this is a published credit/terms update, not a completed authenticated distribution rollout.
- The separate candidate APK has been verified as a stable signed release with native signature enforcement for content, legacy shell manifests and multifile runtime manifests. Existing installations do not gain these native protections through a content update; install-over verification and a real release-phone bridge check still remain before student distribution.
- The live medication library identifies its baseline documents as “Used in CCU meds” and “Emergency trolley meds.” Their complete source documents and permission records were not available for this review. Page references alone do not establish redistribution permission. Do not treat this review as licence clearance for those documents or adaptations.
- If Open RN, WHO, or other third-party works are incorporated, record the exact title, edition, authors/publisher, source link, applicable licence, and adaptation notices, and follow the licence for each work. The uploaded project reference list alone does not show which works the app actually incorporates.
- Preserve source history and official release files privately; retain a private backup of the release keystore and update-signing key. Backup possession and account security were not verified from repository files.

The credit/terms update helps establish attribution. It does not prevent extraction, independently establish copyright ownership of AI-generated material, or prove the distributable APK has every planned security feature.

## Coordinated update-key replacement

The owner confirmed the original update-signing private key was never received. A replacement private key was saved in the owner's private backup before rotation. The matching public key and signatures for the exact existing content, legacy shell manifest and multifile runtime manifest are published together. All three signatures verify. Nursing payloads and their versions are unchanged.

New public-key DER SHA-256: `56381dc75406c48bb68631f17f5fb4faec88ab9a30876f2ca40139f8705b1712`. Use only a subsequently verified candidate with this replacement trust key; the earlier v0.2.33 review candidate trusts the previous key. The Android APK signing certificate is preserved.

Future automatic signing still requires the owner to add `CORE_NURSING_UPDATE_SIGNING_PRIVATE_KEY_PEM` in Core-Nursing-Content Actions secrets and check its signing workflow. No private key is stored in this public channel. Real release-phone update and offline checks remain required before student distribution.

## Replacement candidate validation

Security candidate `0.2.34` (code commit `5227852f49aba9e80982fa00092d1dfcc816809a`) passed stable build [36714570851](https://github.com/Ezz10099/Core-Nursing-Diagnostic-State/actions/runs/36714570851): full JVM tests, obfuscated release build, original APK certificate and upgrade/package checks. It embeds the replacement trust key matching channel commit `0ca25b6ca01ae4ef8ae4edb8c9cb276960e5891a`. The production Java signature verifier accepts the three published payloads and rejects tampering.

Current signatures are valid. The remaining publishing setup is owner configuration of the replacement private PEM as `CORE_NURSING_UPDATE_SIGNING_PRIVATE_KEY_PEM` and a successful automated signing run. Real release-phone update, bridge and offline checks remain pending before student distribution. The v0.2.33 review candidate is superseded.
