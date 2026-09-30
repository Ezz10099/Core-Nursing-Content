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

## Remaining distribution checks

- Verify all three published signatures against the public key after the signing workflow runs. A workflow file alone does not prove its private-key secret is configured.
- Confirm the actual APK to be shared is a stable signed release and which native update-verification features it contains. Existing installations do not gain native signature enforcement through a content update.
- The live medication library identifies its baseline documents as “Used in CCU meds” and “Emergency trolley meds.” Their complete source documents and permission records were not available for this review. Page references alone do not establish redistribution permission. Do not treat this review as licence clearance for those documents or adaptations.
- If Open RN, WHO, or other third-party works are incorporated, record the exact title, edition, authors/publisher, source link, applicable licence, and adaptation notices, and follow the licence for each work. The uploaded project reference list alone does not show which works the app actually incorporates.
- Preserve source history and official release files privately; retain a private backup of the release keystore and update-signing key. Backup possession and account security were not verified from repository files.

The credit/terms update helps establish attribution. It does not prevent extraction, independently establish copyright ownership of AI-generated material, or prove the distributable APK has every planned security feature.
