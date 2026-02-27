import os
import json
import urllib.request

PRODUCTS = {
    "rubymine": "RM",
    "datagrip": "DG",
    "rustrover": "RR",
    "clion": "CL",
    "goland": "GO",
    "webstorm": "WS",
    "pycharm": "PCP",
    "rider": "RD",
    "jetbrains-toolbox": "TBA"
}

def sanitize_name(name):
    return name.lower().replace(' ', '-')

def fetch_data():
    codes = ",".join(PRODUCTS.values())
    url = f"https://data.services.jetbrains.com/products/releases?code={codes}&latest=true&type=release"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def get_bin_name(pkg_name):
    if pkg_name == "jetbrains-toolbox":
        return "jetbrains-toolbox.exe", "jetbrains-toolbox"
    if pkg_name == "pycharm":
        return "pycharm64.exe", "pycharm"
    return f"{pkg_name}64.exe", f"{pkg_name}"

def generate_manifest(pkg_name, code, data):
    releases = data.get(code, [])
    if not releases:
        print(f"No release found for {pkg_name} ({code})")
        return
        
    release = releases[0]
    version = release['version']
    downloads = release.get('downloads', {})
    
    first_char = pkg_name[0]
    pkg_dir = os.path.join(".", first_char, pkg_name)
    os.makedirs(pkg_dir, exist_ok=True)
    
    version_dir = os.path.join(pkg_dir, version)
    os.makedirs(version_dir, exist_ok=True)
    
    # Write versions.json
    versions_json = {
        "latest": version,
        "versions": [
            {
                "version": version,
                "status": "stable"
            }
        ]
    }
    with open(os.path.join(pkg_dir, "versions.json"), "w") as f:
        json.dump(versions_json, f, indent=2)
        
    def write_manifest(os_name, arch, dl_key, format_type, binget_type):
        if dl_key not in downloads:
            return
            
        link = downloads[dl_key]['link']
        checksum = downloads[dl_key].get('checksumLink', '')
        
        manifest = {
            "install_modes": {
                "global": [
                    {
                        "name": f"JetBrains {pkg_name} {version}",
                        "type": binget_type,
                        "url": link,
                        "format": format_type
                    }
                ],
                "user": [
                    {
                        "name": f"JetBrains {pkg_name} {version}",
                        "type": binget_type,
                        "url": link,
                        "format": format_type
                    }
                ]
            }
        }
        
        # if archive, support shim mode
        if binget_type == "archive":
            bin_win, bin_unix = get_bin_name(pkg_name)
            bin_path = bin_win if os_name == "windows" else bin_unix
            manifest["install_modes"]["shim"] = [
                {
                    "name": f"JetBrains {pkg_name} {version}",
                    "type": binget_type,
                    "url": link,
                    "format": format_type,
                    "bin": [f"bin/{bin_path}"]
                }
            ]
            manifest["install_modes"]["global"][0]["bin"] = [f"bin/{bin_path}"]
            manifest["install_modes"]["user"][0]["bin"] = [f"bin/{bin_path}"]
            
        manifest_path = os.path.join(version_dir, f"manifest.{os_name}.{arch}.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

    # Windows AMD64
    if "windowsZip" in downloads:
        write_manifest("windows", "amd64", "windowsZip", "zip", "archive")
    elif "windows" in downloads:
        write_manifest("windows", "amd64", "windows", "exe", "installer")

    # Windows ARM64
    write_manifest("windows", "arm64", "windowsARM64", "exe", "installer")
    
    # macOS AMD64
    write_manifest("macos", "amd64", "mac", "dmg", "installer")
    
    # macOS ARM64
    write_manifest("macos", "aarch64", "macM1", "dmg", "installer")
    
    # Linux AMD64
    write_manifest("linux", "amd64", "linux", "tar.gz", "archive")
    
    # Linux ARM64
    write_manifest("linux", "aarch64", "linuxARM64", "tar.gz", "archive")

    print(f"Generated advanced manifests for {pkg_name} v{version}")

def main():
    data = fetch_data()
    for pkg_name, code in PRODUCTS.items():
        generate_manifest(pkg_name, code, data)

if __name__ == "__main__":
    main()
