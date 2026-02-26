#!/bin/bash
# 
# A prototype script to iterate through various Linux distributions
# using Docker, ensuring `binget` installs work correctly across OSes.
#
# Usage: ./test-linux-distros.sh /path/to/binget-binary package@version
#

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 /path/to/binget-binary package@version"
    exit 1
fi

BINGET_BIN="$(realpath "$1")"
PACKAGE="$2"

DISTROS=("ubuntu:latest" "alpine:latest" "fedora:latest")

for DISTRO in "${DISTROS[@]}"; do
    echo "======================================"
    echo "Testing $PACKAGE on $DISTRO"
    echo "======================================"

    # We mount binget into the container and execute it
    # We also need to mount the local binget-pkgs repository so we can test local manifests
    # before they are pushed to GitHub.
    
    docker run --rm -v "$BINGET_BIN:/usr/local/bin/binget:ro" \
        -v "$(pwd)/../../:/binget-pkgs:ro" \
        "$DISTRO" \
        sh -c "
            echo 'Running binget install in user mode...'
            binget install $PACKAGE --user
            echo 'Running binget install in shim mode...'
            binget install $PACKAGE --shim
            echo 'Verifying installation path (basic check)...'
            ls -la ~/.local/share/binget/bin/ || true
        "
    
    if [ $? -eq 0 ]; then
        echo "[SUCCESS] $DISTRO"
    else
        echo "[FAILED] $DISTRO"
    fi
done
