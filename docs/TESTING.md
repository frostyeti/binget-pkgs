## Cross-Platform Container Testing (Docker)

To guarantee that `binget` packages and their manifests behave predictably across various ecosystems without requiring complex VM farms, we employ a robust Docker-based testing matrix directly within our CI pipelines. 

Since manifests dictate varying strategies per OS (e.g. `deb` for Debian, `rpm` for RHEL, `archive` for shim modes), these scripts will validate the correct execution flow for the different `binget install` modes.

### Linux Testing Matrix
We use basic shell scripts wrapping Docker to iterate through a matrix of the most common Linux distributions:

1. **Debian/Ubuntu (`debian:latest`, `ubuntu:latest`)**: Validates `deb` global installation types and standard GNU toolchain archive extraction.
2. **Alpine (`alpine:latest`)**: Critical for validating binaries compiled against `musl` libc instead of `glibc`, and ensures our `tar` / `unzip` fallbacks work where standard utilities might be missing.
3. **Fedora/RHEL (`fedora:latest`)**: Validates the `rpm` installation modes.

The script loops through these containers, mounts the local `binget` binary and the test manifest, and executes `binget install <target> --global/--shim/--user`, verifying exit codes and binary execution (`<binary> --version`).

### Windows Testing (Headless Containers)
Windows manifests (which might utilize `.msi`, `.zip`, or defer to `winget` / `choco`) are notoriously difficult to test in standard CI without spinning up full heavy GitHub Actions Windows runners.

To accelerate local development and pipeline efficiency, if Docker Desktop is installed and configured for Windows Containers, we run headless tests using Server Core or Nano Server:

- **Image**: `mcr.microsoft.com/windows/servercore:ltsc2022`
- **Execution**: The test script spins up the container, injects the `binget.exe` Windows binary, and validates PowerShell-based extractions or `winget` proxies exactly as it does on Linux.

*Note: Windows container testing requires the Docker daemon to be explicitly toggled into "Windows Containers" mode on the host.*
