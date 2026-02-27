import os
import json
import urllib.request

# Configuration for the new tools.
# If repo exists, it fetches github latest release.
# If winget exists, it adds winget configuration.
TOOLS = {
    "resterm": {"repo": "unkn0wn-root/resterm", "asset": "resterm_{v_no_v}_windows_amd64.zip", "bin": "resterm.exe", "winget": "unkn0wn-root.resterm"},
    "frp": {"repo": "fatedier/frp", "asset": "frp_{v_no_v}_windows_amd64.zip", "bin": "frp_{v_no_v}_windows_amd64/frpc.exe"},
    "tig": {"repo": "jonas/tig", "asset": "tig-{v}-x86_64-pc-windows-msvc.zip", "bin": "tig.exe"}, # Note: tig native windows is tricky, but lets try to map if release exists or fallback winget
    "filepilot": {"repo": "ChrisTs8920/FilePilot", "asset": "FilePilot.zip", "bin": "FilePilot.exe"},
    "flow-launcher": {"repo": "Flow-Launcher/Flow.Launcher", "asset": "Flow-Launcher-v{v_no_v}.zip", "bin": "Flow.Launcher.exe", "winget": "Flow-Launcher.Flow-Launcher"},
    "glaze-wm": {"repo": "glzr-io/glazewm", "asset": "glazewm-v{v_no_v}-x64.zip", "bin": "glazewm.exe", "winget": "glzr-io.glazewm"},
    "bombardier": {"repo": "codesenberg/bombardier", "asset": "bombardier-windows-amd64.exe", "bin": "bombardier.exe", "type": "raw"},
    "rush": {"repo": "shenwei356/rush", "asset": "rush_windows_amd64.exe.tar.gz", "bin": "rush.exe", "format": "tar"},
    # hyperfine is already added in previous run, skip
    "tealdeer": {"repo": "tealdeer-rs/tealdeer", "asset": "tealdeer-windows-x86_64-msvc.exe", "bin": "tealdeer.exe", "type": "raw", "winget": "tealdeer-rs.tealdeer"},
    "bandwhich": {"repo": "imsnif/bandwhich", "asset": "bandwhich-v{v_no_v}-x86_64-pc-windows-msvc.zip", "bin": "bandwhich.exe"},
    "delta": {"repo": "dandavison/delta", "asset": "delta-{v}-x86_64-pc-windows-msvc.zip", "bin": "delta-{v}-x86_64-pc-windows-msvc/delta.exe", "winget": "dandavison.delta"},
    "nushell": {"repo": "nushell/nushell", "asset": "nu-{v}-x86_64-pc-windows-msvc.zip", "bin": "nu-{v}-x86_64-pc-windows-msvc/nu.exe", "winget": "Nushell.Nushell"},
    "one-commander": {"winget": "OneCommander.OneCommander"},
    "dbeaver": {"winget": "dbeaver.dbeaver"},
    "rider": {"winget": "JetBrains.Rider"},
    "goland": {"winget": "JetBrains.GoLand"},
    "clion": {"winget": "JetBrains.CLion"},
    "pycharm": {"winget": "JetBrains.PyCharm.Professional"},
    "webstorm": {"winget": "JetBrains.WebStorm"},
    "phpstorm": {"winget": "JetBrains.PhpStorm"},
    "openssh": {"winget": "Microsoft.OpenSSH.Beta"},
    "keepassxc": {"repo": "keepassxreboot/keepassxc", "asset": "KeePassXC-{v_no_v}-Win64-Portable.zip", "bin": "KeePassXC.exe", "winget": "KeePassXCTeam.KeePassXC"},
    "keepass": {"winget": "DominikReichl.KeePass"},
    "protonvpn": {"winget": "ProtonTechnologies.ProtonVPN"},
    "protonpass": {"winget": "Proton.ProtonPass"},
    "brave": {"winget": "Brave.Brave"},
    "firefox": {"winget": "Mozilla.Firefox"},
    "azure-cli": {"winget": "Microsoft.AzureCLI"},
    "flarectl": {"repo": "cloudflare/cloudflare-go", "asset": "flarectl_{v_no_v}_windows_amd64.zip", "bin": "flarectl.exe"},
    "doctl": {"repo": "digitalocean/doctl", "asset": "doctl-{v_no_v}-windows-amd64.zip", "bin": "doctl.exe", "winget": "DigitalOcean.doctl"},
    "hcloud": {"repo": "hetznercloud/cli", "asset": "hcloud-windows-amd64.zip", "bin": "hcloud.exe", "winget": "Hetzner.hcloud"},
    "aws-cli": {"winget": "Amazon.AWSCLI"},
    "gcp-cli": {"winget": "Google.CloudSDK"},
    "terraform": {"winget": "Hashicorp.Terraform"},
    "pulumi": {"repo": "pulumi/pulumi", "asset": "pulumi-{v}-windows-x64.zip", "bin": "pulumi/bin/pulumi.exe", "winget": "Pulumi.Pulumi"},
    "packer": {"winget": "Hashicorp.Packer"},
    "vagrant": {"winget": "Hashicorp.Vagrant"},
    "virtualbox": {"winget": "Oracle.VirtualBox"},
    "procs": {"repo": "dalance/procs", "asset": "procs-{v}-x86_64-pc-windows-msvc.zip", "bin": "procs.exe", "winget": "dalance.procs"}
}

def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def get_latest_tag(repo):
    url = f"https://github.com/{repo}/releases/latest"
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req) as response:
            return response.url.split("/")[-1]
    except Exception as e:
        if hasattr(e, "url"):
            return e.url.split("/")[-1]
        print(f"Failed to get tag for {repo}: {e}")
        return "1.0.0" # fallback

for pid, cfg in TOOLS.items():
    print(f"Processing {pid}...")
    tag = "1.0.0"
    v_no_v = "1.0.0"
    
    if "repo" in cfg:
        tag = get_latest_tag(cfg["repo"])
        v_no_v = tag[1:] if tag.startswith("v") else tag
    
    version = v_no_v

    base_dir = f"{pid[0]}/{pid}"
    write_json(f"{base_dir}/versions.json", {
        "latest": version,
        "versions": [{"version": version, "status": "stable"}]
    })

    modes = {}
    
    if "repo" in cfg:
        t = cfg.get("type", "archive")
        f = cfg.get("format", "zip") if t == "archive" else None
        
        asset = cfg["asset"].format(v=tag, v_no_v=v_no_v)
        url = f"https://github.com/{cfg['repo']}/releases/download/{tag}/{asset}"
        
        bin_name = cfg["bin"].format(v=tag, v_no_v=v_no_v)
        
        entry = {
            "name": "Official GitHub Release",
            "type": t,
            "url": url,
            "bin": [bin_name]
        }
        if f:
            entry["format"] = f
            
        modes["shim"] = [entry]
        modes["user"] = [entry]
        modes["global"] = [entry]
        
        if "winget" in cfg:
            modes["global"].append({
                "name": "Winget",
                "type": "winget",
                "package": cfg["winget"]
            })
    else:
        # Only winget
        entry = {
            "name": "Winget",
            "type": "winget",
            "package": cfg["winget"]
        }
        modes["global"] = [entry]
        
    write_json(f"{base_dir}/{version}/manifest.windows.amd64.json", {
        "install_modes": modes
    })

print("Done generating manifests!")
