#!/bin/bash
RUNTIMES=("node" "rust" "dotnet" "deno" "uv" "python" "ruby" "zig" "go" "java" "ocaml" "odin" "elixir" "erlang" "haskell" "php" "lua")

for r in "${RUNTIMES[@]}"; do
  mkdir -p "packages/$r"
  cat << JSON > "packages/$r/manifest.json"
{
  "\$schema": "../../schema.json",
  "name": "$r",
  "description": "Built-in runtime resolver for $r",
  "versions": [
    {
      "version": "latest",
      "platforms": {
        "linux-x86_64": { "install_modes": { "shim": { "type": "runtime" }, "user": { "type": "runtime" }, "global": { "type": "runtime" } } },
        "linux-aarch64": { "install_modes": { "shim": { "type": "runtime" }, "user": { "type": "runtime" }, "global": { "type": "runtime" } } },
        "macos-x86_64": { "install_modes": { "shim": { "type": "runtime" }, "user": { "type": "runtime" }, "global": { "type": "runtime" } } },
        "macos-aarch64": { "install_modes": { "shim": { "type": "runtime" }, "user": { "type": "runtime" }, "global": { "type": "runtime" } } },
        "windows-x86_64": { "install_modes": { "shim": { "type": "runtime" }, "user": { "type": "runtime" }, "global": { "type": "runtime" } } },
        "windows-aarch64": { "install_modes": { "shim": { "type": "runtime" }, "user": { "type": "runtime" }, "global": { "type": "runtime" } } }
      }
    }
  ]
}
JSON
done
