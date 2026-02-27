import os
import json
import urllib.request
import urllib.error
import time
import shutil

SKIP_LIST = {
    'webstorm', 'pycharm', 'rubymine', 'rider', 'clion', 'goland', 'datagrip', 'rustrover', 'toolbox'
}

def get_json(url):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'binget-updater')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        return None
    except Exception as e:
        return None

def find_github_repo(pkg_name):
    res = get_json(f"https://api.github.com/search/repositories?q={pkg_name}+in:name")
    if res and res.get('items'):
        for item in res['items']:
            if item['name'].lower() == pkg_name.lower():
                return item['full_name']
        return res['items'][0]['full_name']
    return None

def identify_asset(name, os_name, arch):
    name = name.lower()
    if os_name == 'windows':
        if any(x in name for x in ['linux', 'darwin', 'mac', 'freebsd', 'apple', '.dmg', '.deb', '.rpm', '.apk', '.appimage']): return False
        if not ('win' in name or 'windows' in name) and not (name.endswith('.exe') or name.endswith('.msi') or name.endswith('.zip')): return False
    elif os_name == 'macos':
        if any(x in name for x in ['windows', 'win64', 'win32', 'linux', 'freebsd', '.exe', '.msi', '.deb', '.rpm', '.apk', '.appimage']): return False
        if not ('mac' in name or 'darwin' in name or 'apple' in name) and not name.endswith('.dmg'):
            if not (name.endswith('.dmg') or name.endswith('.zip') or name.endswith('.tar.gz')): return False
    elif os_name == 'linux':
        if any(x in name for x in ['windows', 'win64', 'win32', 'darwin', 'mac', 'apple', 'freebsd', '.exe', '.msi', '.dmg']): return False
        if not ('linux' in name) and not (name.endswith('.deb') or name.endswith('.rpm') or name.endswith('.appimage') or name.endswith('.apk')):
            if not (name.endswith('.tar.gz') or name.endswith('.tar.xz')): return False
            
    if arch == 'amd64':
        if any(x in name for x in ['arm', 'aarch64', '386', 'i386', 'ppc64', 's390x']): return False
    elif arch == 'aarch64':
        if any(x in name for x in ['amd64', 'x86_64', '64bit', '386', 'i386', 'ppc64', 's390x']): return False
            
    if any(name.endswith(x) for x in ['.sha256', '.sha256sum', '.md5', '.sig', '.pem', '.sbom', '.sbom.json', '.pub', '.txt']): return False
        
    return True

def generate_system_manifest(v_dir, pkg_name):
    os.makedirs(v_dir, exist_ok=True)
    platforms = [
        ("windows", "amd64"), ("windows", "aarch64"),
        ("macos", "amd64"), ("macos", "aarch64"),
        ("linux", "amd64"), ("linux", "aarch64")
    ]
    for os_name, arch in platforms:
        manifest_file = os.path.join(v_dir, f"manifest.{os_name}.{arch}.json")
        modes = {"global": [], "user": [], "shim": []}
        
        if os_name == "windows":
            modes["global"].extend([{"name": "Winget", "type": "winget", "package": pkg_name}, {"name": "Chocolatey", "type": "choco", "package": pkg_name}])
            modes["user"] = modes["global"]
            modes["shim"] = modes["global"]
        elif os_name == "macos":
            modes["global"].append({"name": "Homebrew", "type": "brew", "package": pkg_name})
            modes["user"] = modes["global"]
            modes["shim"] = modes["global"]
        elif os_name == "linux":
            modes["global"].extend([
                {"name": "APT", "type": "apt", "package": pkg_name},
                {"name": "Pacman", "type": "pacman", "package": pkg_name},
                {"name": "AUR", "type": "aur", "package": pkg_name},
                {"name": "RPM", "type": "rpm", "package": pkg_name},
                {"name": "Flatpak", "type": "flatpak", "package": pkg_name}
            ])
            modes["user"] = modes["global"]
            modes["shim"] = modes["global"]

        with open(manifest_file, "w") as f:
            json.dump({"install_modes": modes}, f, indent=2)

def generate_manifests(pkg_dir, pkg_name):
    if pkg_name in SKIP_LIST: return

    repo = find_github_repo(pkg_name)
    releases = []
    if repo:
        releases = get_json(f"https://api.github.com/repos/{repo}/releases?per_page=10")

    if not releases:
        # Fallback to system package managers for version 1.0.0
        versions_data = {"latest": "1.0.0", "versions": [{"version": "1.0.0", "status": "stable"}]}
        generate_system_manifest(os.path.join(pkg_dir, "1.0.0"), pkg_name)
        with open(os.path.join(pkg_dir, "versions.json"), "w") as f:
            json.dump(versions_data, f, indent=2)
        return

    versions_data = {
        "latest": releases[0]["tag_name"].lstrip('v'),
        "versions": []
    }

    for rel in releases:
        raw_version = rel["tag_name"]
        clean_version = raw_version.lstrip('v')
        if not clean_version: continue
        
        versions_data["versions"].append({"version": clean_version, "status": "stable" if not rel.get("prerelease") else "prerelease"})
        v_dir = os.path.join(pkg_dir, clean_version)
        os.makedirs(v_dir, exist_ok=True)
        
        platforms = [("windows", "amd64"), ("windows", "aarch64"), ("macos", "amd64"), ("macos", "aarch64"), ("linux", "amd64"), ("linux", "aarch64")]
        
        for os_name, arch in platforms:
            manifest_file = os.path.join(v_dir, f"manifest.{os_name}.{arch}.json")
            modes = {"global": [], "user": [], "shim": []}
            
            for asset in rel.get("assets", []):
                if identify_asset(asset["name"], os_name, arch):
                    name = asset["name"]
                    url = asset["browser_download_url"]
                    config = {"name": f"Direct Download ({name})", "url": url}
                    
                    if name.endswith('.zip') or name.endswith('.tar.gz') or name.endswith('.tar.xz'):
                        config["type"] = "archive"
                        config["bin"] = [f"{pkg_name}.exe" if os_name == 'windows' else pkg_name]
                    elif name.endswith('.msi'):
                        config["type"] = "installer"
                        config["format"] = "msi"
                    elif name.endswith('.exe'):
                        config["type"] = "installer"
                        config["format"] = "exe"
                    elif name.endswith('.dmg'):
                        config["type"] = "archive"
                        config["format"] = "dmg"
                        config["bin"] = [pkg_name]
                    elif name.endswith('.deb'):
                        config["type"] = "installer"
                        config["format"] = "deb"
                    elif name.endswith('.rpm'):
                        config["type"] = "installer"
                        config["format"] = "rpm"
                    elif name.endswith('.AppImage') or name.endswith('.appimage'):
                        config["type"] = "appimage"
                        config["bin"] = [name]
                    else:
                        config["type"] = "raw"
                        config["bin"] = [f"{pkg_name}.exe" if os_name == 'windows' else pkg_name]

                    modes["global"].append(config)
                    modes["user"].append(config)
                    modes["shim"].append(config)

            # Fallbacks
            if os_name == "windows":
                modes["global"].extend([{"name": "Winget", "type": "winget", "package": pkg_name}, {"name": "Chocolatey", "type": "choco", "package": pkg_name}])
            elif os_name == "macos":
                modes["global"].append({"name": "Homebrew", "type": "brew", "package": pkg_name})
            elif os_name == "linux":
                modes["global"].extend([
                    {"name": "APT", "type": "apt", "package": pkg_name},
                    {"name": "Pacman", "type": "pacman", "package": pkg_name},
                    {"name": "AUR", "type": "aur", "package": pkg_name},
                    {"name": "RPM", "type": "rpm", "package": pkg_name},
                    {"name": "Flatpak", "type": "flatpak", "package": pkg_name}
                ])
            
            # For user/shim, if no direct download exists, copy global system managers
            if len(modes["user"]) == 0:
                modes["user"] = modes["global"]
                modes["shim"] = modes["global"]

            with open(manifest_file, "w") as f:
                json.dump({"install_modes": modes}, f, indent=2)

    with open(os.path.join(pkg_dir, "versions.json"), "w") as f:
        json.dump(versions_data, f, indent=2)
        
    if "1.0.0" not in [v["version"] for v in versions_data["versions"]]:
        old_dir = os.path.join(pkg_dir, "1.0.0")
        if os.path.exists(old_dir):
            shutil.rmtree(old_dir)

def main():
    base_dir = "c:/opt/repos/binget-pkgs"
    for c in "abcdefghijklmnopqrstuvwxyz":
        letter_dir = os.path.join(base_dir, c)
        if not os.path.exists(letter_dir): continue
        for pkg in os.listdir(letter_dir):
            pkg_dir = os.path.join(letter_dir, pkg)
            if os.path.isdir(pkg_dir):
                print(f"Updating {pkg}...")
                generate_manifests(pkg_dir, pkg)

if __name__ == "__main__":
    main()
