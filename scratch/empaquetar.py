import os
import zipfile

def build_zip():
    zip_path = "bitlab_entrega_final.zip"
    exclude_dirs = {'.git', '.gemini', 'node_modules', '__pycache__', '.pytest_cache'}
    exclude_files = {'.DS_Store', 'bitlab_entrega_final.zip'}
    
    count = 0
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk('.'):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.git')]
            for f in files:
                if f in exclude_files or f.endswith('.pyc'):
                    continue
                file_path = os.path.join(root, f)
                # Store relative path
                arcname = os.path.relpath(file_path, '.')
                zf.write(file_path, arcname)
                count += 1
                
    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"Empaquetado exitoso: {count} archivos agregados a {zip_path} ({size_mb:.2f} MB)")

if __name__ == '__main__':
    build_zip()
