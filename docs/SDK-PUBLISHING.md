# SDK Publishing Guide

All 4 SDKs publish automatically via GitHub Actions when you push a version tag.
This guide covers the one-time setup per registry, and how to cut a release.

---

## One-time setup per registry

### npm (JavaScript SDK)

1. Create account at https://www.npmjs.com
2. Generate a token: Account → Access Tokens → Generate New Token → **Granular** → select `releasepace-js` package → Publish
3. Add to GitHub Secrets as `NPM_TOKEN`
4. Reserve the package name now (before publishing):
   ```bash
   cd sdks/js
   npm pack --dry-run   # verify contents
   npm publish --access public --dry-run
   ```

### PyPI (Python SDK)

1. Create account at https://pypi.org
2. Account Settings → API tokens → Add API token → scope to project `releasepace`
3. Add to GitHub Secrets as `PYPI_TOKEN`
4. Reserve name on Test PyPI first:
   ```bash
   cd sdks/python
   pip install build twine
   python -m build
   twine upload --repository testpypi dist/*
   # verify at https://test.pypi.org/project/releasepace/
   ```

### Maven Central (Java SDK)

Maven Central requires GPG signing. This is the most involved setup.

1. Create Sonatype Central account at https://central.sonatype.com
2. Verify the `io.github.releasepace` namespace in the Central Portal
3. Generate GPG key:
   ```bash
   gpg --full-generate-key       # RSA 4096, no expiry
   gpg --list-secret-keys --keyid-format LONG
   # copy the key ID (e.g. 3AA5C34371567BD2)
   gpg --keyserver keyserver.ubuntu.com --send-keys 3AA5C34371567BD2
   gpg --export-secret-keys --armor 3AA5C34371567BD2 > private-key.asc
   ```
4. Add to GitHub Secrets:
   - `GPG_PRIVATE_KEY` — contents of `private-key.asc`
   - `GPG_PASSPHRASE` — your GPG passphrase
   - `MAVEN_USERNAME` — your Sonatype Central username
   - `MAVEN_PASSWORD` — your Sonatype Central token
5. Delete `private-key.asc` locally after adding to secrets

### pkg.go.dev (Go SDK)

Go modules are **auto-indexed** — no account or publish step needed.

1. Push the code to `github.com/releasepace/releasepace-go`
2. Push a version tag: `git tag sdks/go/v1.0.0 && git push origin sdks/go/v1.0.0`
3. pkg.go.dev indexes it within minutes: https://pkg.go.dev/github.com/releasepace/releasepace-go

---

## Cutting a release

### Patch release (bug fix)
```bash
# JavaScript
git tag sdk/js/v1.0.1 && git push origin sdk/js/v1.0.1

# Python
git tag sdk/python/v1.0.1 && git push origin sdk/python/v1.0.1

# Java
git tag sdk/java/v1.0.1 && git push origin sdk/java/v1.0.1

# Go
git tag sdks/go/v1.0.1 && git push origin sdks/go/v1.0.1
```

### Minor release (new features, backwards compatible)
Same as above but bump the minor version: `v1.1.0`

### Major release (breaking changes)
Same process but bump major: `v2.0.0`
For Go, a new module path is required: `releasepace-go/v2`

---

## Pre-publish checklist

Before tagging any SDK release:

- [ ] All CI checks pass on `main`
- [ ] Tests pass locally (`npm test`, `pytest`, `go test ./...`, `mvn test`)
- [ ] CHANGELOG updated with what changed
- [ ] Version bumped in `package.json` / `pyproject.toml` / `pom.xml`
- [ ] README examples use the new version number
- [ ] No secrets, API keys, or internal URLs in the code

---

## Verifying a published SDK

```bash
# npm
npm info releasepace-js version

# PyPI
pip index versions releasepace

# Maven
curl https://central.sonatype.com/artifact/io.github.releasepace/releasepace-java

# Go
curl https://pkg.go.dev/github.com/releasepace/releasepace-go
```
