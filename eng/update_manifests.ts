import { ensureDir } from "https://deno.land/std/fs/ensure_dir.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";

console.log("Starting manifest updater pipeline...");

// Initialize SQLite Database
await ensureDir("eng/db");
const db = new DB("eng/db/manifests.db");
db.execute(`
  CREATE TABLE IF NOT EXISTS package_versions (
    id TEXT,
    version TEXT,
    tag_name TEXT,
    published_at TEXT,
    PRIMARY KEY (id, version)
  )
`);

interface AppDef {
    id: string;
    description?: string;
    githubRepo?: string;
    assetMap?: Record<string, string[]>;
    extractDir?: string;
    binName?: string | Record<string, string>;
    customHandler?: () => Promise<void>;
}

function rustApp(id: string, githubRepo: string, description: string): AppDef {
    return {
        id,
        description,
        githubRepo,
        assetMap: {
            "linux-x86_64": ["x86_64", "linux", "musl", "tar.gz"],
            "linux-aarch64": ["aarch64", "linux", "musl", "tar.gz"],
            "macos-x86_64": ["x86_64", "apple", "darwin", "tar.gz"],
            "macos-aarch64": ["aarch64", "apple", "darwin", "tar.gz"],
            "windows-x86_64": ["x86_64", "pc", "windows", "msvc", "zip"]
        },
        extractDir: `${id}-v{{version}}-{{target}}`,
        binName: {
            "windows-x86_64": `${id}.exe`,
            "default": id
        }
    };
}

function goApp(id: string, githubRepo: string, description: string): AppDef {
    return {
        id,
        description,
        githubRepo,
        assetMap: {
            "linux-x86_64": ["linux", "x86_64", "tar.gz"],
            "linux-aarch64": ["linux", "arm64", "tar.gz"],
            "macos-x86_64": ["darwin", "x86_64", "tar.gz"],
            "macos-aarch64": ["darwin", "arm64", "tar.gz"],
            "windows-x86_64": ["windows", "x86_64", "zip"]
        },
        extractDir: "",
        binName: {
            "windows-x86_64": `${id}.exe`,
            "default": id
        }
    };
}

function hashicorpApp(id: string, description: string): AppDef {
    return {
        id,
        description,
        customHandler: async () => {
            const url = `https://api.releases.hashicorp.com/v1/releases/${id}?limit=15`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch Hashicorp releases for ${id}`);
            const data = await res.json();
            
            const versions = [];
            for (const release of data) {
                if (release.is_prerelease || !release.builds) continue;
                const version = release.version;
                
                const platforms: Record<string, any> = {};
                
                for (const build of release.builds) {
                    let platKey = "";
                    if (build.os === "linux" && build.arch === "amd64") platKey = "linux-x86_64";
                    else if (build.os === "linux" && build.arch === "arm64") platKey = "linux-aarch64";
                    else if (build.os === "darwin" && build.arch === "amd64") platKey = "macos-x86_64";
                    else if (build.os === "darwin" && build.arch === "arm64") platKey = "macos-aarch64";
                    else if (build.os === "windows" && build.arch === "amd64") platKey = "windows-x86_64";
                    
                    if (platKey) {
                        const bin = build.os === "windows" ? `${id}.exe` : id;
                        platforms[platKey] = {
                            install_modes: {
                                shim: {
                                    type: "archive",
                                    url: build.url,
                                    extract_dir: "",
                                    bin: [bin]
                                }
                            }
                        };
                    }
                }
                
                if (Object.keys(platforms).length > 0) {
                    versions.push({ version, platforms });
                    try { db.query("INSERT OR IGNORE INTO package_versions (id, version, tag_name, published_at) VALUES (?, ?, ?, ?)", [id, version, version, release.timestamp_created]); } catch (e) {}
                }
            }
            
            if (versions.length > 0) {
                const c = id.charAt(0).toLowerCase();
                const appDir = join(c, id);
                await ensureDir(appDir);

                versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
                const latestVersion = versions[0].version;

                const versionsJson = {
                    latest: latestVersion,
                    versions: versions.map(v => ({ version: v.version, status: "active" }))
                };
                await Deno.writeTextFile(join(appDir, "versions.json"), JSON.stringify(versionsJson, null, 2));

                for (const v of versions) {
                    const verDir = join(appDir, v.version);
                    await ensureDir(verDir);
                    for (const [plat, platformData] of Object.entries(v.platforms)) {
                        const manifestPath = join(verDir, `manifest.${plat}.json`);
                        await Deno.writeTextFile(manifestPath, JSON.stringify(platformData, null, 2));
                    }
                }
                
                const pkgDir = join("packages", id);
                await ensureDir(pkgDir);
                await Deno.writeTextFile(join(pkgDir, "manifest.json"), JSON.stringify({ $schema: "../../schema.json", name: id, description, versions }, null, 2));
                
                console.log(`Wrote manifests for ${id} with ${versions.length} versions`);
            }
        }
    };
}

const APPS: AppDef[] = [
    rustApp("nushell", "nushell/nushell", "A new type of shell"),
    {
        id: "oh-my-posh",
        description: "A prompt theme engine for any shell",
        githubRepo: "JanDeDobbeleer/oh-my-posh",
        assetMap: {
            "linux-x86_64": ["posh-linux-amd64"],
            "linux-aarch64": ["posh-linux-arm64"],
            "macos-x86_64": ["posh-darwin-amd64"],
            "macos-aarch64": ["posh-darwin-arm64"],
            "windows-x86_64": ["posh-windows-amd64.exe"]
        },
        extractDir: "",
        binName: { "windows-x86_64": "oh-my-posh.exe", "default": "oh-my-posh" }
    },
    goApp("superfile", "yorukot/superfile", "Very fancy terminal file manager"),
    goApp("pingme", "shizuokax/pingme", "CLI to send messages/alerts to messaging platforms"),

    rustApp("yazi", "sxyazi/yazi", "Blazing fast terminal file manager"),
    rustApp("gping", "orf/gping", "Ping, but with a graph"),
    goApp("micro", "zyedidia/micro", "A modern and intuitive terminal-based text editor"),
    goApp("lazysql", "jorgerojas26/lazysql", "A cross-platform TUI database management tool written in Go"),
    goApp("kustomize", "kubernetes-sigs/kustomize", "Customization of kubernetes YAML configurations"),

    rustApp("just", "casey/just", "just a command runner"),
    rustApp("bat", "sharkdp/bat", "A cat(1) clone with wings"),
    rustApp("ripgrep", "BurntSushi/ripgrep", "ripgrep recursively searches directories for a regex pattern"),
    rustApp("fd", "sharkdp/fd", "A simple, fast and user-friendly alternative to 'find'"),
    rustApp("eza", "eza-community/eza", "A modern replacement for ls"),
    rustApp("zoxide", "ajeetdsouza/zoxide", "A smarter cd command"),
    rustApp("procs", "dalance/procs", "A modern replacement for ps written in Rust"),
    rustApp("starship", "starship/starship", "The minimal, blazing-fast, and infinitely customizable prompt for any shell!"),
    rustApp("bottom", "ClementTsang/bottom", "Yet another cross-platform graphical process/system monitor"),
    rustApp("zellij", "zellij-org/zellij", "A terminal workspace with batteries included"),
    rustApp("helix", "helix-editor/helix", "A post-modern modal text editor"),
    {
        id: "alacritty",
        description: "A cross-platform, OpenGL terminal emulator",
        githubRepo: "alacritty/alacritty",
        assetMap: {
            "macos-x86_64": ["Alacritty", "dmg"],
            "macos-aarch64": ["Alacritty", "dmg"],
            "windows-x86_64": ["installer", "msi"]
        },
        extractDir: "",
        binName: "alacritty"
    },
    rustApp("wezterm", "wez/wezterm", "A GPU-accelerated cross-platform terminal emulator and multiplexer written by @wez"),
    
    goApp("gh", "cli/cli", "GitHub CLI"),
    goApp("lazygit", "jesseduffield/lazygit", "simple terminal UI for git commands"),
    goApp("lazydocker", "jesseduffield/lazydocker", "The lazier way to manage everything docker"),
    goApp("k9s", "derailed/k9s", "Kubernetes CLI To Manage Your Clusters In Style!"),
    goApp("cast", "frostyeti/cast", "Cast - a task runner"),
    goApp("kpv", "frostyeti/kpv", "KeePass Vault"),
    goApp("osv", "frostyeti/osv", "OS Vault"),
    goApp("sopsv", "frostyeti/sopsv", "SOPS Vault"),
    goApp("akv", "frostyeti/akv", "Azure Key Vault CLI"),
    goApp("dn", "frostyeti/dn", "Dotnet CLI helper"),

    {
        id: "kubectx",
        description: "Switch faster between clusters and namespaces in kubectl",
        githubRepo: "ahmetb/kubectx",
        assetMap: {
            "linux-x86_64": ["kubectx", "linux", "x86_64", "tar.gz"],
            "linux-aarch64": ["kubectx", "linux", "arm64", "tar.gz"],
            "macos-x86_64": ["kubectx", "darwin", "x86_64", "tar.gz"],
            "macos-aarch64": ["kubectx", "darwin", "arm64", "tar.gz"],
            "windows-x86_64": ["kubectx", "windows", "x86_64", "zip"]
        },
        extractDir: "",
        binName: { "windows-x86_64": "kubectx.exe", "default": "kubectx" }
    },
    {
        id: "kubens",
        description: "Switch faster between clusters and namespaces in kubectl",
        githubRepo: "ahmetb/kubectx",
        assetMap: {
            "linux-x86_64": ["kubens", "linux", "x86_64", "tar.gz"],
            "linux-aarch64": ["kubens", "linux", "arm64", "tar.gz"],
            "macos-x86_64": ["kubens", "darwin", "x86_64", "tar.gz"],
            "macos-aarch64": ["kubens", "darwin", "arm64", "tar.gz"],
            "windows-x86_64": ["kubens", "windows", "x86_64", "zip"]
        },
        extractDir: "",
        binName: { "windows-x86_64": "kubens.exe", "default": "kubens" }
    },
    {
        id: "kind",
        description: "Kubernetes IN Docker - local clusters for testing Kubernetes",
        githubRepo: "kubernetes-sigs/kind",
        assetMap: {
            "linux-x86_64": ["kind-linux-amd64"],
            "linux-aarch64": ["kind-linux-arm64"],
            "macos-x86_64": ["kind-darwin-amd64"],
            "macos-aarch64": ["kind-darwin-arm64"],
            "windows-x86_64": ["kind-windows-amd64"]
        },
        extractDir: "",
        binName: { "windows-x86_64": "kind.exe", "default": "kind" }
    },
    {
        id: "minikube",
        description: "Run Kubernetes locally",
        githubRepo: "kubernetes/minikube",
        assetMap: {
            "linux-x86_64": ["minikube-linux-amd64.tar.gz"],
            "linux-aarch64": ["minikube-linux-arm64.tar.gz"],
            "macos-x86_64": ["minikube-darwin-amd64.tar.gz"],
            "macos-aarch64": ["minikube-darwin-arm64.tar.gz"],
            "windows-x86_64": ["minikube-windows-amd64.tar.gz"]
        },
        extractDir: "",
        binName: { "windows-x86_64": "minikube.exe", "default": "minikube" }
    },
    {
        id: "btop",
        description: "A monitor of resources",
        githubRepo: "aristocratos/btop",
        assetMap: {
            "linux-x86_64": ["btop-x86_64-unknown-linux-musl.tbz"],
            "linux-aarch64": ["btop-aarch64-unknown-linux-musl.tbz"],
            "macos-x86_64": ["btop-x86_64-apple-darwin.tbz"],
            "macos-aarch64": ["btop-aarch64-apple-darwin.tbz"]
        },
        extractDir: "btop",
        binName: "bin/btop"
    },
    {
        id: "nvim",
        description: "Vim-fork focused on extensibility and usability",
        githubRepo: "neovim/neovim",
        assetMap: {
            "linux-x86_64": ["nvim-linux-x86_64.tar.gz", "nvim-linux64.tar.gz"],
            "linux-aarch64": ["nvim-linux-arm64.tar.gz"],
            "macos-x86_64": ["nvim-macos-x86_64.tar.gz"],
            "macos-aarch64": ["nvim-macos-arm64.tar.gz"],
            "windows-x86_64": ["nvim-win64.zip"]
        },
        extractDir: "nvim-{{os}}-{{arch}}",
        binName: { "windows-x86_64": "bin/nvim.exe", "default": "bin/nvim" }
    },
    {
        id: "docker-compose",
        description: "Define and run multi-container applications with Docker",
        githubRepo: "docker/compose",
        assetMap: {
            "linux-x86_64": ["docker-compose-linux-x86_64"],
            "linux-aarch64": ["docker-compose-linux-aarch64"],
            "macos-x86_64": ["docker-compose-darwin-x86_64"],
            "macos-aarch64": ["docker-compose-darwin-aarch64"],
            "windows-x86_64": ["docker-compose-windows-x86_64.exe"]
        },
        extractDir: "",
        binName: { "windows-x86_64": "docker-compose.exe", "default": "docker-compose" }
    },
    {
        id: "pulumi",
        description: "Pulumi - Infrastructure as Code in any programming language",
        githubRepo: "pulumi/pulumi",
        assetMap: {
            "linux-x86_64": ["linux-x64.tar.gz"],
            "linux-aarch64": ["linux-arm64.tar.gz"],
            "macos-x86_64": ["darwin-x64.tar.gz"],
            "macos-aarch64": ["darwin-arm64.tar.gz"],
            "windows-x86_64": ["windows-x64.zip"]
        },
        extractDir: "pulumi",
        binName: { "windows-x86_64": "pulumi.exe", "default": "pulumi" }
    },
    {
        id: "zed",
        description: "A high-performance, multiplayer code editor",
        githubRepo: "zed-industries/zed",
        assetMap: {
            "linux-x86_64": ["zed-linux-x86_64.tar.gz"],
            "linux-aarch64": ["zed-linux-aarch64.tar.gz"],
            "macos-x86_64": ["Zed-x86_64.dmg"],
            "macos-aarch64": ["Zed-aarch64.dmg"],
            "windows-x86_64": ["Zed-x86_64.exe"]
        },
        extractDir: "",
        binName: { "linux-x86_64": "zed.app/bin/zed", "linux-aarch64": "zed.app/bin/zed", "windows-x86_64": "zed.exe", "default": "zed.app/bin/zed" }
    },
    {
        id: "kitty",
        description: "Cross-platform, fast, feature-rich, GPU based terminal",
        githubRepo: "kovidgoyal/kitty",
        assetMap: {
            "linux-x86_64": ["x86_64.txz"],
            "linux-aarch64": ["arm64.txz"],
            "macos-x86_64": ["kitty-.*\\.dmg"],
            "macos-aarch64": ["kitty-.*\\.dmg"]
        },
        extractDir: "",
        binName: "bin/kitty"
    },

    
    hashicorpApp("terraform", "Terraform is an infrastructure as code tool"),
    hashicorpApp("packer", "Packer is a tool for creating identical machine images for multiple platforms from a single source configuration"),
    hashicorpApp("vault", "A tool for secrets management, encryption as a service, and privileged access management"),
    hashicorpApp("consul", "Consul is a distributed, highly available, and data center aware solution to connect and configure applications across dynamic, distributed infrastructure"),

    {
        id: "helm",
        description: "The Kubernetes Package Manager",
        githubRepo: "helm/helm",
        customHandler: async () => {
            const releases = await fetchGitHubReleases("helm/helm");
            const versions = [];
            for (const release of releases) {
                if (release.draft || release.prerelease) continue;
                let version = release.tag_name;
                if (version.startsWith("v")) version = version.substring(1);
                
                const platforms: Record<string, any> = {
                    "linux-x86_64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://get.helm.sh/helm-v${version}-linux-amd64.tar.gz`,
                                extract_dir: "linux-amd64",
                                bin: ["helm"]
                            }
                        }
                    },
                    "linux-aarch64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://get.helm.sh/helm-v${version}-linux-arm64.tar.gz`,
                                extract_dir: "linux-arm64",
                                bin: ["helm"]
                            }
                        }
                    },
                    "macos-x86_64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://get.helm.sh/helm-v${version}-darwin-amd64.tar.gz`,
                                extract_dir: "darwin-amd64",
                                bin: ["helm"]
                            }
                        }
                    },
                    "macos-aarch64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://get.helm.sh/helm-v${version}-darwin-arm64.tar.gz`,
                                extract_dir: "darwin-arm64",
                                bin: ["helm"]
                            }
                        }
                    },
                    "windows-x86_64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://get.helm.sh/helm-v${version}-windows-amd64.zip`,
                                extract_dir: "windows-amd64",
                                bin: ["helm.exe"]
                            }
                        }
                    }
                };
                versions.push({ version, platforms });
                try { db.query("INSERT OR IGNORE INTO package_versions (id, version, tag_name, published_at) VALUES (?, ?, ?, ?)", ["helm", version, release.tag_name, release.published_at]); } catch (e) {}
            }
            if (versions.length > 0) {
                const app = { id: "helm", description: "The Kubernetes Package Manager" };
                const c = app.id.charAt(0).toLowerCase();
                const appDir = join(c, app.id);
                await ensureDir(appDir);

                versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
                const latestVersion = versions[0].version;

                const versionsJson = {
                    latest: latestVersion,
                    versions: versions.map(v => ({ version: v.version, status: "active" }))
                };
                await Deno.writeTextFile(join(appDir, "versions.json"), JSON.stringify(versionsJson, null, 2));

                for (const v of versions) {
                    const verDir = join(appDir, v.version);
                    await ensureDir(verDir);
                    for (const [plat, platformData] of Object.entries(v.platforms)) {
                        const manifestPath = join(verDir, `manifest.${plat}.json`);
                        await Deno.writeTextFile(manifestPath, JSON.stringify(platformData, null, 2));
                    }
                }
                
                const pkgDir = join("packages", app.id);
                await ensureDir(pkgDir);
                await Deno.writeTextFile(join(pkgDir, "manifest.json"), JSON.stringify({ $schema: "../../schema.json", name: app.id, description: app.description, versions }, null, 2));
                
                console.log(`Wrote manifests for helm with ${versions.length} versions`);
            }
        }
    },
    {
        id: "vscode",
        description: "Visual Studio Code",
        customHandler: async () => {
            const url = `https://update.code.visualstudio.com/api/releases/stable`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch VSCode releases`);
            const data = await res.json();
            
            // Limit to top 15 versions to save time
            const versions = [];
            for (let i = 0; i < Math.min(15, data.length); i++) {
                const version = data[i];
                
                const platforms: Record<string, any> = {
                    "linux-x86_64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://update.code.visualstudio.com/${version}/linux-x64/stable`,
                                extract_dir: "VSCode-linux-x64",
                                bin: ["bin/code"]
                            }
                        }
                    },
                    "linux-aarch64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://update.code.visualstudio.com/${version}/linux-arm64/stable`,
                                extract_dir: "VSCode-linux-arm64",
                                bin: ["bin/code"]
                            }
                        }
                    },
                    "macos-x86_64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://update.code.visualstudio.com/${version}/darwin/stable`,
                                extract_dir: "Visual Studio Code.app",
                                bin: ["Contents/Resources/app/bin/code"]
                            }
                        }
                    },
                    "macos-aarch64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://update.code.visualstudio.com/${version}/darwin-arm64/stable`,
                                extract_dir: "Visual Studio Code.app",
                                bin: ["Contents/Resources/app/bin/code"]
                            }
                        }
                    },
                    "windows-x86_64": {
                        install_modes: {
                            shim: {
                                type: "archive",
                                url: `https://update.code.visualstudio.com/${version}/win32-x64-archive/stable`,
                                extract_dir: "",
                                bin: ["bin/code.cmd"]
                            }
                        }
                    }
                };
                
                versions.push({ version, platforms });
                try { db.query("INSERT OR IGNORE INTO package_versions (id, version, tag_name, published_at) VALUES (?, ?, ?, ?)", ["vscode", version, version, new Date().toISOString()]); } catch (e) {}
            }
            
            if (versions.length > 0) {
                const app = { id: "vscode", description: "Visual Studio Code" };
                const c = app.id.charAt(0).toLowerCase();
                const appDir = join(c, app.id);
                await ensureDir(appDir);

                versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
                const latestVersion = versions[0].version;

                const versionsJson = {
                    latest: latestVersion,
                    versions: versions.map(v => ({ version: v.version, status: "active" }))
                };
                await Deno.writeTextFile(join(appDir, "versions.json"), JSON.stringify(versionsJson, null, 2));

                for (const v of versions) {
                    const verDir = join(appDir, v.version);
                    await ensureDir(verDir);
                    for (const [plat, platformData] of Object.entries(v.platforms)) {
                        const manifestPath = join(verDir, `manifest.${plat}.json`);
                        await Deno.writeTextFile(manifestPath, JSON.stringify(platformData, null, 2));
                    }
                }
                
                const pkgDir = join("packages", app.id);
                await ensureDir(pkgDir);
                await Deno.writeTextFile(join(pkgDir, "manifest.json"), JSON.stringify({ $schema: "../../schema.json", name: app.id, description: app.description, versions }, null, 2));
                
                console.log(`Wrote manifests for vscode with ${versions.length} versions`);
            }
        }
    },
    {
        id: "kubectl",
        description: "Kubernetes cluster command line utility",
        githubRepo: "kubernetes/kubernetes",
        customHandler: async () => {
            const releases = await fetchGitHubReleases("kubernetes/kubernetes");
            const versions = [];
            
            for (const release of releases) {
                if (release.draft || release.prerelease) continue;
                let version = release.tag_name;
                if (version.startsWith("v")) version = version.substring(1);
                
                const platforms: Record<string, any> = {
                    "linux-x86_64": {
                        install_modes: {
                            shim: {
                                type: "raw",
                                url: `https://dl.k8s.io/release/v${version}/bin/linux/amd64/kubectl`,
                                bin: ["kubectl"]
                            }
                        }
                    },
                    "linux-aarch64": {
                        install_modes: {
                            shim: {
                                type: "raw",
                                url: `https://dl.k8s.io/release/v${version}/bin/linux/arm64/kubectl`,
                                bin: ["kubectl"]
                            }
                        }
                    },
                    "macos-x86_64": {
                        install_modes: {
                            shim: {
                                type: "raw",
                                url: `https://dl.k8s.io/release/v${version}/bin/darwin/amd64/kubectl`,
                                bin: ["kubectl"]
                            }
                        }
                    },
                    "macos-aarch64": {
                        install_modes: {
                            shim: {
                                type: "raw",
                                url: `https://dl.k8s.io/release/v${version}/bin/darwin/arm64/kubectl`,
                                bin: ["kubectl"]
                            }
                        }
                    },
                    "windows-x86_64": {
                        install_modes: {
                            shim: {
                                type: "raw",
                                url: `https://dl.k8s.io/release/v${version}/bin/windows/amd64/kubectl.exe`,
                                bin: ["kubectl.exe"]
                            }
                        }
                    }
                };
                
                versions.push({ version, platforms });
                try {
                    db.query("INSERT OR IGNORE INTO package_versions (id, version, tag_name, published_at) VALUES (?, ?, ?, ?)", ["kubectl", version, release.tag_name, release.published_at]);
                } catch (e) {}
            }
            
            if (versions.length > 0) {
                const app = { id: "kubectl", description: "Kubernetes cluster command line utility" };
                const c = app.id.charAt(0).toLowerCase();
                const appDir = join(c, app.id);
                await ensureDir(appDir);

                versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
                const latestVersion = versions[0].version;

                const versionsJson = {
                    latest: latestVersion,
                    versions: versions.map(v => ({ version: v.version, status: "active" }))
                };
                await Deno.writeTextFile(join(appDir, "versions.json"), JSON.stringify(versionsJson, null, 2));

                for (const v of versions) {
                    const verDir = join(appDir, v.version);
                    await ensureDir(verDir);
                    for (const [plat, platformData] of Object.entries(v.platforms)) {
                        const manifestPath = join(verDir, `manifest.${plat}.json`);
                        await Deno.writeTextFile(manifestPath, JSON.stringify(platformData, null, 2));
                    }
                }
                
                const pkgDir = join("packages", app.id);
                await ensureDir(pkgDir);
                await Deno.writeTextFile(join(pkgDir, "manifest.json"), JSON.stringify({ $schema: "../../schema.json", name: app.id, description: app.description, versions }, null, 2));
                
                console.log(`Wrote manifests for kubectl with ${versions.length} versions`);
            }
        }
    },
    {
        id: "jq",
        description: "Command-line JSON processor",
        githubRepo: "jqlang/jq",
        assetMap: {
            "linux-x86_64": ["linux-amd64"],
            "linux-aarch64": ["linux-arm64"],
            "macos-x86_64": ["macos-amd64"],
            "macos-aarch64": ["macos-arm64"],
            "windows-x86_64": ["windows-amd64.exe"]
        },
        extractDir: "",
        binName: {
            "windows-x86_64": "jq.exe",
            "default": "jq"
        }
    },
    {
        id: "yq",
        description: "yq is a portable command-line YAML processor",
        githubRepo: "mikefarah/yq",
        assetMap: {
            "linux-x86_64": ["linux_amd64.tar.gz"],
            "linux-aarch64": ["linux_arm64.tar.gz"],
            "macos-x86_64": ["darwin_amd64.tar.gz"],
            "macos-aarch64": ["darwin_arm64.tar.gz"],
            "windows-x86_64": ["windows_amd64.zip"]
        },
        extractDir: "",
        binName: {
            "windows-x86_64": "yq.exe",
            "default": "yq"
        }
    },
    {
        id: "fzf",
        description: "A command-line fuzzy finder",
        githubRepo: "junegunn/fzf",
        assetMap: {
            "linux-x86_64": ["linux_amd64.tar.gz"],
            "linux-aarch64": ["linux_arm64.tar.gz"],
            "macos-x86_64": ["darwin_amd64.tar.gz"],
            "macos-aarch64": ["darwin_arm64.tar.gz"],
            "windows-x86_64": ["windows_amd64.zip"]
        },
        extractDir: "",
        binName: {
            "windows-x86_64": "fzf.exe",
            "default": "fzf"
        }
    }
];

// Fixups for specific apps where naming varies
const ghApp = APPS.find(a => a.id === "gh")!;
ghApp.assetMap = {
    "linux-x86_64": ["linux", "amd64", "tar.gz"],
    "linux-aarch64": ["linux", "arm64", "tar.gz"],
    "macos-x86_64": ["macOS", "amd64", "zip"],
    "macos-aarch64": ["macOS", "arm64", "zip"],
    "windows-x86_64": ["windows", "amd64", "zip"]
};
ghApp.extractDir = "gh_{{version}}_{{os}}_{{arch}}";
ghApp.binName = { "windows-x86_64": "bin/gh.exe", "default": "bin/gh" };

const lazygitApp = APPS.find(a => a.id === "lazygit")!;
lazygitApp.assetMap = {
    "linux-x86_64": ["linux", "x86_64", "tar.gz"],
    "linux-aarch64": ["linux", "arm64", "tar.gz"],
    "macos-x86_64": ["darwin", "x86_64", "tar.gz"],
    "macos-aarch64": ["darwin", "arm64", "tar.gz"],
    "windows-x86_64": ["windows", "x86_64", "zip"]
};

const lazydockerApp = APPS.find(a => a.id === "lazydocker")!;
lazydockerApp.assetMap = {
    "linux-x86_64": ["Linux", "x86_64", "tar.gz"],
    "linux-aarch64": ["Linux", "arm64", "tar.gz"],
    "macos-x86_64": ["Darwin", "x86_64", "tar.gz"],
    "macos-aarch64": ["Darwin", "arm64", "tar.gz"],
    "windows-x86_64": ["Windows", "x86_64", "zip"]
};

const ezaApp = APPS.find(a => a.id === "eza")!;
ezaApp.extractDir = "eza_{{target}}";

const procsApp = APPS.find(a => a.id === "procs")!;
procsApp.assetMap = {
    "linux-x86_64": ["x86_64", "linux", "zip"],
    "linux-aarch64": ["aarch64", "linux", "zip"],
    "macos-x86_64": ["x86_64", "mac", "zip"],
    "macos-aarch64": ["aarch64", "mac", "zip"],
    "windows-x86_64": ["x86_64", "windows", "zip"]
};

const helixApp = APPS.find(a => a.id === "helix")!;
helixApp.assetMap = {
    "linux-x86_64": ["x86_64", "linux", "tar.xz"],
    "linux-aarch64": ["aarch64", "linux", "tar.xz"],
    "macos-x86_64": ["x86_64", "macos", "tar.xz"],
    "macos-aarch64": ["aarch64", "macos", "tar.xz"],
    "windows-x86_64": ["x86_64", "windows", "zip"]
};
helixApp.extractDir = "helix-{{version}}-{{target}}";
helixApp.binName = { "windows-x86_64": "hx.exe", "default": "hx" };

const weztermApp = APPS.find(a => a.id === "wezterm")!;
weztermApp.assetMap = {
    "linux-x86_64": ["Ubuntu20.04.AppImage"],
    "macos-x86_64": ["macos", "zip"],
    "macos-aarch64": ["macos", "zip"],
    "windows-x86_64": ["windows", "zip"]
};
weztermApp.extractDir = "";
weztermApp.binName = { "windows-x86_64": "wezterm.exe", "default": "wezterm" };

const k9sApp = APPS.find(a => a.id === "k9s")!;
k9sApp.assetMap = {
    "linux-x86_64": ["Linux", "amd64", "tar.gz"],
    "linux-aarch64": ["Linux", "arm64", "tar.gz"],
    "macos-x86_64": ["Darwin", "amd64", "tar.gz"],
    "macos-aarch64": ["Darwin", "arm64", "tar.gz"],
    "windows-x86_64": ["Windows", "amd64", "zip"]
};

async function fetchGitHubReleases(repo: string) {
    const url = `https://api.github.com/repos/${repo}/releases?per_page=10`;
    const token = Deno.env.get("GITHUB_TOKEN");
    const headers: Record<string, string> = { "User-Agent": "binget-updater" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ${repo}: ${res.statusText}`);
    return await res.json();
}

async function processApp(app: AppDef) {
    console.log(`Processing ${app.id}...`);
    if (app.customHandler) {
        await app.customHandler();
        return;
    }
    
    if (!app.githubRepo) return;
    
    const releases = await fetchGitHubReleases(app.githubRepo);
    
    const versions = [];
    
    for (const release of releases) {
        if (release.draft || release.prerelease) continue;
        let version = release.tag_name;
        if (version.startsWith("v")) version = version.substring(1);

        const platforms: Record<string, any> = {};
        
        for (const [plat, rules] of Object.entries(app.assetMap || {})) {
            const asset = release.assets.find((a: any) => rules.every((r: string) => a.name.includes(r) || a.name.match(new RegExp(r))));
            if (asset) {
                const bin = app.binName ? (typeof app.binName === 'string' ? app.binName : (app.binName[plat] || app.binName["default"])) : app.id;
                
                let extDir = app.extractDir || "";
                if (extDir.includes("{{version}}")) extDir = extDir.replace(/\{\{version\}\}/g, version);
                if (extDir.includes("{{tag}}")) extDir = extDir.replace(/\{\{tag\}\}/g, release.tag_name);

                let target = "";
                if (plat === "linux-x86_64") target = "x86_64-unknown-linux-musl";
                if (plat === "linux-aarch64") target = "aarch64-unknown-linux-musl";
                if (plat === "macos-x86_64") target = "x86_64-apple-darwin";
                if (plat === "macos-aarch64") target = "aarch64-apple-darwin";
                if (plat === "windows-x86_64") target = "x86_64-pc-windows-msvc";

                if (extDir.includes("{{target}}")) extDir = extDir.replace(/\{\{target\}\}/g, target);

                let os = "";
                if (plat.startsWith("linux")) os = "linux";
                if (plat.startsWith("macos")) os = "macOS";
                if (plat.startsWith("windows")) os = "windows";
                if (extDir.includes("{{os}}")) extDir = extDir.replace(/\{\{os\}\}/g, os);

                let arch = "";
                if (plat.endsWith("x86_64")) arch = "amd64";
                if (plat.endsWith("aarch64")) arch = "arm64";
                if (extDir.includes("{{arch}}")) extDir = extDir.replace(/\{\{arch\}\}/g, arch);

                const url = asset.browser_download_url;
                const lowerUrl = url.toLowerCase();
                
                let type = "raw";
                let installMode = "shim";
                let format = undefined;
                
                if (lowerUrl.endsWith(".zip") || lowerUrl.endsWith(".tar.gz") || lowerUrl.endsWith(".tgz") || lowerUrl.endsWith(".tar.xz") || lowerUrl.endsWith(".tbz") || lowerUrl.endsWith(".txz")) {
                    type = "archive";
                } else if (lowerUrl.endsWith(".msi") || lowerUrl.endsWith(".dmg") || lowerUrl.endsWith(".deb") || lowerUrl.endsWith(".rpm") || lowerUrl.endsWith(".pkg") || lowerUrl.endsWith(".appimage")) {
                    type = "installer";
                    installMode = "user"; // Installers run in user mode
                    if (lowerUrl.endsWith(".msi")) format = "msi";
                    else if (lowerUrl.endsWith(".dmg")) format = "dmg";
                    else if (lowerUrl.endsWith(".deb")) format = "deb";
                    else if (lowerUrl.endsWith(".rpm")) format = "rpm";
                    else if (lowerUrl.endsWith(".pkg")) format = "pkg";
                    else if (lowerUrl.endsWith(".appimage")) format = "appimage";
                }

                const modeData: any = {
                    type,
                    url,
                };
                
                if (format) modeData.format = format;
                
                if (type === "archive") {
                    modeData.extract_dir = extDir || undefined;
                    modeData.bin = [bin];
                } else if (type === "raw") {
                    modeData.bin = [bin];
                }

                platforms[plat] = {
                    install_modes: {
                        [installMode]: modeData
                    }
                };
            }
        }
        
        if (Object.keys(platforms).length > 0) {
            versions.push({ version, platforms });
            // Add to SQLite DB
            try {
                db.query("INSERT OR IGNORE INTO package_versions (id, version, tag_name, published_at) VALUES (?, ?, ?, ?)", [app.id, version, release.tag_name, release.published_at]);
            } catch (e) {
                console.error(`DB error for ${app.id} ${version}:`, e);
            }
        }
    }
    
    if (versions.length === 0) {
        console.warn(`No versions found for ${app.id}`);
        return;
    }
    
    // Sort versions to find latest (simplistic semver sort)
    versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
    const latestVersion = versions[0].version;

    const c = app.id.charAt(0).toLowerCase();
    const appDir = join(c, app.id);
    await ensureDir(appDir);

    // Write versions.json
    const versionsJson = {
        latest: latestVersion,
        versions: versions.map(v => ({ version: v.version, status: "active" }))
    };
    await Deno.writeTextFile(join(appDir, "versions.json"), JSON.stringify(versionsJson, null, 2));

    // Write platform manifests
    for (const v of versions) {
        const verDir = join(appDir, v.version);
        await ensureDir(verDir);
        
        for (const [plat, platformData] of Object.entries(v.platforms)) {
            const manifestPath = join(verDir, `manifest.${plat}.json`);
            await Deno.writeTextFile(manifestPath, JSON.stringify(platformData, null, 2));
        }
    }
    
    // Also write the monolithic one just in case
    const manifest = {
        $schema: "../../schema.json",
        name: app.id,
        description: app.description || "",
        versions
    };
    
    const pkgDir = join("packages", app.id);
    await ensureDir(pkgDir);
    await Deno.writeTextFile(join(pkgDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    
    console.log(`Wrote manifests for ${app.id} with ${versions.length} versions`);
}

async function main() {
    for (const app of APPS) {
        try {
            await processApp(app);
        } catch (e) {
            console.error(`Error processing ${app.id}:`, e);
        }
    }
    db.close();
}

main();
