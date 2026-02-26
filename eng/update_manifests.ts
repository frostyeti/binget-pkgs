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

const APPS: AppDef[] = [
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
    rustApp("alacritty", "alacritty/alacritty", "A cross-platform, OpenGL terminal emulator"),
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
    "linux-x86_64": ["Linux", "x86_64", "tar.gz"],
    "linux-aarch64": ["Linux", "arm64", "tar.gz"],
    "macos-x86_64": ["Darwin", "x86_64", "tar.gz"],
    "macos-aarch64": ["Darwin", "arm64", "tar.gz"],
    "windows-x86_64": ["Windows", "x86_64", "zip"]
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
                const type = url.endsWith(".zip") || url.endsWith(".tar.gz") || url.endsWith(".tgz") ? "archive" : "raw";

                platforms[plat] = {
                    install_modes: {
                        shim: {
                            type,
                            url,
                            extract_dir: extDir || undefined,
                            bin: [bin]
                        }
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
