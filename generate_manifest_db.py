import os
import json
import sqlite3

def generate_db():
    if os.path.exists('manifest.db'):
        os.remove('manifest.db')
        
    conn = sqlite3.connect('manifest.db')
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE packages (id TEXT PRIMARY KEY, description TEXT)')
    
    count = 0
    for first_char in os.listdir('.'):
        if not os.path.isdir(first_char) or len(first_char) != 1:
            continue
            
        for pkg_name in os.listdir(first_char):
            pkg_path = os.path.join(first_char, pkg_name)
            if not os.path.isdir(pkg_path):
                continue
                
            desc = ""
            versions_file = os.path.join(pkg_path, "versions.json")
            if os.path.exists(versions_file):
                with open(versions_file, "r") as f:
                    try:
                        vdata = json.load(f)
                        latest = vdata.get("latest")
                        if latest:
                            manifest_file = os.path.join(pkg_path, latest, "manifest.json")
                            if os.path.exists(manifest_file):
                                with open(manifest_file, "r") as mf:
                                    mdata = json.load(mf)
                                    desc = mdata.get("description", "")
                    except Exception:
                        pass
                        
            cursor.execute('INSERT INTO packages (id, description) VALUES (?, ?)', (pkg_name, desc))
            count += 1
            
    conn.commit()
    conn.close()
    print(f"Generated manifest.db with {count} packages")

if __name__ == '__main__':
    generate_db()
