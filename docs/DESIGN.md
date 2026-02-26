# Registry Design & Manifest Schema

## Directory Layout
```text
/
  b/
    bun/
      latest -> symlink/pointer to 1.1.0 (or a versions.yaml file)
      1.1.0/
        manifest.yaml
        manifest.linux.amd64.yaml
        manifest.darwin.aarch64.yaml
        ...
```

## Schema Definitions

### Main Manifest (`manifest.yaml`)
Provides metadata and lists supported platforms for this specific version.

```yaml
id: bun
name: Bun
version: 1.1.0
author: oven-sh
homepage: https://bun.sh
license: MIT
description: Incredibly fast JavaScript runtime, bundler, test runner, and package manager.
platforms:
  - linux.amd64
  - linux.aarch64
  - darwin.amd64
  - darwin.aarch64
```

### Platform Manifest (`manifest.<os>.<arch>.yaml`)
Provides the exact installation instructions for the three core modes (`shim`, `user`, `global`). This separation allows specific OS managers (like `apt` or `choco`) to take over for `global` installs, while `shim` relies purely on archives.

```yaml
# manifest.linux.amd64.yaml
install_modes:
  shim:
    type: archive
    format: zip # zip, tar, deb, rpm, msi
    url: "https://github.com/oven-sh/bun/releases/download/bun-v1.1.0/bun-linux-x64.zip"
    checksum: "sha256:1234567890abcdef..."
    # The sub-directory inside the archive to extract from (if applicable)
    extract_dir: "bun-linux-x64" 
    bin:
      - "bun"
      
  user:
    type: archive
    format: zip
    url: "https://github.com/oven-sh/bun/releases/download/bun-v1.1.0/bun-linux-x64.zip"
    bin:
      - "bun"
      
  global:
    # If possible, use system package manager for global, else fallback to archive
    type: apt
    package: "bun"
    # Alternative:
    # type: archive ...
```

## Supported Installer Types
1. **Archive (`archive`)**: Downloads a `.zip`, `.tar.gz`, `.tar.xz`, extracts it, and links the specified binaries.
2. **Raw Binary (`raw`)**: Downloads a standalone executable directly.
3. **Debian Package (`deb`)**: Downloads and extracts (`dpkg -x` equivalent internally or physically installing if global).
4. **RPM Package (`rpm`)**: Same as deb but for RHEL systems.
5. **MSI (`msi`)**: Windows Installer. Usually strictly for `global` or `user` modes.
6. **System Managers (`choco`, `winget`, `apt`, `brew`)**: Proxies the installation command to the host's existing package manager. Only valid for `global` mode.

## Automated Updates (Cron)
We will leverage GitHub Actions in this repository to run daily.
1. **Scrapers**: A set of typescript/python scrapers will check upstream repositories (like GitHub Releases, npm registry, etc.).
2. **Generation**: When a new version is detected (e.g. `bun 1.2.0`), the script creates the `/b/bun/1.2.0/` directory, templates out the manifests with correct checksums, and pushes a PR or commits directly to `dev`/`master`.

## Planning for Runtimes

Runtimes require complex shimming because they often bring along multiple binaries, require specific standard libraries, or need specific environment variables set at execution time.

*   **Bun / Deno / Zig**: The easiest runtimes. They are typically distributed as single binaries inside a zip/tar file. The `archive` type handles this flawlessly.
*   **Go**: Distributed as a tarball, but it requires standard libraries located relative to the binary, and ideally the `GOROOT` env var. In `shim` mode, `binget` will extract the full archive into the `env/go/<version>` folder and symlink `bin/go` and `bin/gofmt`. The shim wrapper itself might need to inject `GOROOT=$(dirname(shim))/../`.
*   **Node.js**: Distributed as a tarball. Needs `node`, `npm`, and `npx` exposed as bins. NPM needs its internal global modules path correctly mapped.
*   **Rust**: Generally installed via `rustup`. Our manifest might use a `script` type, or we manually wrap `rustup-init`. Alternatively, we can fetch standalone `rustc` and `cargo` tarballs, but it's non-standard.
*   **Dotnet**: Highly modular. Can be fetched via `dotnet-install.sh` scripts. We might need a `script` installer type that downloads the Microsoft install script and executes it with `--install-dir ~/.local/share/binget/env/dotnet/8.0`.

## Planning for Tools

*   **Simple (jq, yq)**: Download single binaries (e.g., `jq-linux64`), mark executable, and link. Extremely simple `raw` type manifests.
*   **Complex (Docker, Podman)**: Contain daemons, rely on root system permissions, socket connections, and virtualization.
    *   **Shim Mode**: Almost impossible or highly impractical to shim a daemon correctly per project.
    *   **Global Mode**: The manifest for these should explicitly map to `apt`, `brew`, `winget`, or `msi`. When a user types `binget install docker`, it should run `apt install docker-ce` on Linux or proxy to `winget install Docker.DockerDesktop` on Windows.

## Docker Testing (CI/CD Pipeline)

See [`TESTING.md`](./TESTING.md) for details on how we use Docker to test our manifests against multiple Linux distributions (Ubuntu, Fedora, Alpine) and headless Windows containers (Server Core).
