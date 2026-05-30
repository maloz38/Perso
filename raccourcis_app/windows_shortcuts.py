import os
import sys
import shutil
import datetime
import ctypes
from ctypes import wintypes
try:
    import win32file
    import pywintypes
except Exception:
    win32file = None
    pywintypes = None
from win32com.client import Dispatch

# Pour définir AppUserModelID dans le raccourci
try:
    import pythoncom
    from win32com.propsys import propsys, pscon
    HAS_PROPSYS = True
except ImportError:
    HAS_PROPSYS = False


def get_start_menu_dir():
    """Return per-user Start Menu\Programs path for placing shortcuts."""
    appdata = os.environ.get('APPDATA')
    if not appdata:
        return None
    path = os.path.join(appdata, r"Microsoft\Windows\Start Menu\Programs\Perso Raccourcis")
    os.makedirs(path, exist_ok=True)
    return path


def sanitize_name(name: str) -> str:
    # Keep filesystem-safe name
    bad = '\\/:*?"<>|'
    out = ''.join(c for c in name if c not in bad).strip()
    if not out:
        out = 'raccourci'
    return out


def create_shortcut(name: str, target: str, args: str = '', icon: str = '', work_dir: str = None, app_id: str = None):
    """Create or update a .lnk in the user's Start Menu Programs folder.

    Returns the full path to the .lnk file.
    """
    start_dir = get_start_menu_dir()
    if not start_dir:
        raise RuntimeError('Could not determine Start Menu folder')

    safe_name = sanitize_name(name)
    lnk_path = os.path.join(start_dir, f"{safe_name}.lnk")

    shell = Dispatch('WScript.Shell')
    shortcut = shell.CreateShortcut(lnk_path)
    shortcut.TargetPath = target
    shortcut.Arguments = args or ''
    if work_dir:
        shortcut.WorkingDirectory = work_dir
    # If icon provided and exists, set it (WScript accepts 'path, index' or just path)
    if icon and os.path.exists(icon):
        shortcut.IconLocation = icon
    try:
        shortcut.save()
    except Exception:
        # On some systems retpath may fail; fall back to a safe save via temporary file
        tmp = lnk_path + '.tmp'
        try:
            shortcut.Save()
            if os.path.exists(tmp):
                shutil.move(tmp, lnk_path)
        except Exception:
            pass

    # Définir AppUserModelID pour que Windows utilise la bonne icône dans la barre des tâches
    if app_id and HAS_PROPSYS and os.path.exists(lnk_path):
        try:
            # Constantes
            GPS_READWRITE = 2  # GETPROPERTYSTOREFLAGS
            
            # Ouvrir le raccourci via IPropertyStore
            store = propsys.SHGetPropertyStoreFromParsingName(
                lnk_path, None, 
                GPS_READWRITE,
                propsys.IID_IPropertyStore
            )
            # Définir System.AppUserModel.ID
            store.SetValue(
                pscon.PKEY_AppUserModel_ID,
                propsys.PROPVARIANTType(app_id, pythoncom.VT_LPWSTR)
            )
            store.Commit()
            print(f"AppUserModelID '{app_id}' set on shortcut")
        except Exception as e:
            print(f"Failed to set AppUserModelID: {e}")

    # Try to set the file times to an older date so Windows doesn't mark it as "Recently added"
    try:
        if win32file and pywintypes:
            # Open the file and set creation, access and modification times
            handle = win32file.CreateFile(
                lnk_path,
                win32file.GENERIC_WRITE,
                0,
                None,
                win32file.OPEN_EXISTING,
                0,
                0,
            )
            past = datetime.datetime.now() - datetime.timedelta(days=365)
            ft = pywintypes.Time(past)
            try:
                win32file.SetFileTime(handle, ft, ft, ft)
            except Exception:
                pass
            try:
                handle.Close()
            except Exception:
                pass
    except Exception:
        pass

    return lnk_path
