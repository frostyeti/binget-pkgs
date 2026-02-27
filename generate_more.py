import os
import json
import urllib.request

TOOLS = {
    "zed": {"repo": "zed-industries/zed", "asset": "zed-windows-x86_64.zip", "bin": "zed.exe", "winget": "Zed.Zed"},
    "sublime-text": {"winget": "SublimeHQ.SublimeText.4"}
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
