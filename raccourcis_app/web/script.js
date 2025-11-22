console.log('script.js chargé, début exécution');
// Placeholder (1x1 transparent gif) used when an icon is missing or invalid
const DEFAULT_ICON_JS = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

// Folder management
let currentFolder = '';
let folders = [];
let currentSort = 'custom'; // az, za, recent, custom
let folderOrders = {};

// DOM Elements
const toggleFormBtn = document.getElementById('toggleFormBtn');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const shortcutForm = document.getElementById('shortcutForm');
const addShortcutForm = document.getElementById('addShortcutForm');
const itemsContainer = document.getElementById('itemsContainer');
const previewIcon = document.getElementById('previewIcon');
const previewName = document.getElementById('previewName');
const cancelFormBtn = document.getElementById('cancelForm');
const descriptionInput = document.getElementById('description');
const sortBtn = document.getElementById('sortBtn');
const sortMenu = document.getElementById('sortMenu');

// Auto-capitalize description
descriptionInput.addEventListener('input', (e) => {
    const value = e.target.value;
    if (value.length > 0 && value[0] !== value[0].toUpperCase()) {
        const cursorPos = e.target.selectionStart;
        e.target.value = value.charAt(0).toUpperCase() + value.slice(1);
        e.target.setSelectionRange(cursorPos, cursorPos);
    }
});

// Toggle form visibility
toggleFormBtn.addEventListener('click', () => {
    shortcutForm.classList.toggle('hidden');
    // Pré-sélectionner le dossier actuel
    if (!shortcutForm.classList.contains('hidden')) {
        document.getElementById('folder').value = currentFolder;
    }
});

cancelFormBtn.addEventListener('click', () => {
    shortcutForm.classList.add('hidden');
    addShortcutForm.reset();
    previewIcon.src = '';
    previewName.textContent = '';
});

// Sort menu toggle
sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle('hidden');
});

// Close sort menu when clicking outside
document.addEventListener('click', () => {
    sortMenu.classList.add('hidden');
});

// Sort menu options
sortMenu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        currentSort = btn.dataset.sort;
        sortMenu.classList.add('hidden');
        await renderItems();
    });
});

// View mode toggle
const toggleViewBtn = document.getElementById('toggleViewBtn');
let isGridView = true;

toggleViewBtn.addEventListener('click', () => {
    isGridView = !isGridView;
    toggleViewBtn.textContent = isGridView ? 'Mode Liste' : 'Mode Grille';
    itemsContainer.className = isGridView ? 'grid-view' : 'list-view';
});

// File browsing
document.getElementById('browseFile').addEventListener('click', async () => {
    const result = await window.pywebview.api.pickFile();
    if (result) {
        document.getElementById('path').value = result.path;
        document.getElementById('iconPath').value = result.iconPath || result.path;
        // Request icon extraction for preview
        const iconData = await window.pywebview.api.getIconForPath(result.iconPath || result.path);
        previewIcon.src = iconData;
        updatePreview();
    }
});

document.getElementById('browseIcon').addEventListener('click', async () => {
    try {
        const result = await window.pywebview.api.pickIcon();
        if (result && result.iconPath) {
            document.getElementById('iconPath').value = result.iconPath;
            previewIcon.src = result.preview;
            updatePreview();
        }
    } catch (error) {
        console.error('Erreur lors de la sélection de l\'icône:', error);
    }
});

// Preview updates
document.getElementById('name').addEventListener('input', updatePreview);

function updatePreview() {
    const nameInput = document.getElementById('name');
    previewName.textContent = nameInput.value || 'Aperçu';
}

// Form submission
addShortcutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('name').value,
        path: document.getElementById('path').value,
        iconPath: document.getElementById('iconPath').value || document.getElementById('path').value,
        description: document.getElementById('description').value,
        folder: document.getElementById('folder').value
    };
    
    const editIndex = addShortcutForm.dataset.editIndex;
    if (editIndex !== undefined) {
        // Mode édition
        await window.pywebview.api.updateShortcut(parseInt(editIndex), data);
        delete addShortcutForm.dataset.editIndex;
        const submitBtn = addShortcutForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Ajouter';
    } else {
        // Mode ajout
        await window.pywebview.api.addShortcut(data);
    }
    
    await loadFolders();
    await renderItems();
    
    // Reset form and hide
    addShortcutForm.reset();
    previewIcon.src = '';
    previewName.textContent = '';
    shortcutForm.classList.add('hidden');
});

// Gestion du menu contextuel
function showContextMenu(e, shortcutEl, shortcut, index) {
    e.preventDefault();
    // Supprimer tout menu contextuel existant
    const oldMenu = document.querySelector('.context-menu');
    if (oldMenu) oldMenu.remove();

    // Créer le nouveau menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="menu-item edit">Modifier</div>
        <div class="menu-item delete">Supprimer</div>
    `;
    
    // Positionner le menu
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    document.body.appendChild(menu);

    // Gestionnaires d'événements
    menu.querySelector('.edit').onclick = () => {
        openEditForm(shortcut, index);
        menu.remove();
    };

    menu.querySelector('.delete').onclick = async () => {
        if (confirm('Voulez-vous vraiment supprimer ce raccourci ?')) {
            await window.pywebview.api.deleteShortcut(index);
            await renderShortcuts();
        }
        menu.remove();
    };

    // Fermer le menu au clic ailleurs
    document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });
}

// Menu contextuel pour les dossiers
function showFolderContextMenu(e, folderEl, item) {
    e.preventDefault();
    e.stopPropagation();
    
    // Supprimer tout menu contextuel existant
    const oldMenu = document.querySelector('.context-menu');
    if (oldMenu) oldMenu.remove();

    // Créer le nouveau menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="menu-item delete">Supprimer le dossier</div>
    `;
    
    // Positionner le menu
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    document.body.appendChild(menu);

    // Gestionnaire de suppression
    menu.querySelector('.delete').onclick = async () => {
        await deleteFolder(item.fullPath);
        menu.remove();
    };

    // Fermer le menu au clic ailleurs
    document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });
}

// Formulaire d'édition
async function openEditForm(shortcut, index) {
    shortcutForm.classList.remove('hidden');
    document.getElementById('name').value = shortcut.name;
    document.getElementById('path').value = shortcut.path;
    document.getElementById('iconPath').value = shortcut.iconPath || shortcut.path;
    document.getElementById('description').value = shortcut.description || '';
    document.getElementById('folder').value = shortcut.folder || '';
    
    // Load icon for preview
    const iconPath = shortcut.iconPath || shortcut.path;
    const iconData = await window.pywebview.api.getIconForPath(iconPath);
    previewIcon.src = iconData;
    previewName.textContent = shortcut.name;
    
    // Modifier le formulaire pour le mode édition
    const submitBtn = addShortcutForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Modifier';
    addShortcutForm.dataset.editIndex = index;
}

// Shortcuts rendering
// Unified render function for folders and shortcuts
async function renderItems() {
    try {
        const allShortcuts = await window.pywebview.api.getShortcuts();
        // Refresh folder orders
        folderOrders = await window.pywebview.api.getFolderOrders();

        itemsContainer.innerHTML = '';
        
        // Get subfolders at current level
        const currentPrefix = currentFolder ? currentFolder + '/' : '';
        const subfolders = new Set();
        folders.forEach(folder => {
            if (folder.startsWith(currentPrefix)) {
                const remainder = folder.substring(currentPrefix.length);
                if (remainder && !remainder.includes('/')) {
                    subfolders.add(folder);
                }
            } else if (!currentFolder && !folder.includes('/')) {
                subfolders.add(folder);
            }
        });
        
        // Filter shortcuts by current folder
        const shortcuts = allShortcuts.filter(s => (s.folder || '') === currentFolder);
        
        // Build items array (folders + shortcuts)
        let items = [];
        
        // Add folders
        subfolders.forEach(folder => {
            const displayName = folder.split('/').pop();
            const count = allShortcuts.filter(s => 
                s.folder && (s.folder === folder || s.folder.startsWith(folder + '/'))
            ).length;

            // Use API stored order
            let customOrder = 999999;
            if (folderOrders[folder] !== undefined) {
                customOrder = folderOrders[folder];
            }

            items.push({
                type: 'folder',
                name: displayName,
                fullPath: folder,
                count,
                customOrder: customOrder
            });
        });
        
        // Add shortcuts
        shortcuts.forEach((shortcut, idx) => {
            items.push({
                type: 'shortcut',
                data: shortcut,
                index: allShortcuts.indexOf(shortcut),
                name: shortcut.name,
                customOrder: shortcut.customOrder !== undefined ? shortcut.customOrder : 999999,
                lastOpened: shortcut.lastOpened || 0
            });
        });
        
        // Apply sorting
        sortItems(items);
        
        if (items.length === 0) {
            itemsContainer.innerHTML = '<div style="opacity:0.5;text-align:center;margin-top:2em">Aucun élément dans ce dossier</div>';
            return;
        }
        
        // Render items
        items.forEach((item, position) => {
            if (item.type === 'folder') {
                const folderEl = createFolderElement(item, position);
                itemsContainer.appendChild(folderEl);
            } else {
                const shortcutEl = createShortcutElement(item, position);
                itemsContainer.appendChild(shortcutEl);
            }
        });
    } catch (e) {
        itemsContainer.innerHTML = '<div style="color:red;text-align:center;margin-top:2em">Erreur lors du chargement</div>';
        console.error('Erreur lors du chargement:', e);
    }
}

function sortItems(items) {
    switch (currentSort) {
        case 'az':
            items.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'za':
            items.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'recent':
            items.sort((a, b) => {
                const aTime = a.lastOpened || 0;
                const bTime = b.lastOpened || 0;
                return bTime - aTime;
            });
            break;
        case 'custom':
            items.sort((a, b) => (a.customOrder) - (b.customOrder));
            break;
    }
}

function createFolderElement(item, position) {
    const folderEl = document.createElement('div');
    folderEl.className = 'shortcut folder-item-card';
    folderEl.dataset.position = position;
    folderEl.dataset.type = 'folder';
    folderEl.dataset.fullPath = item.fullPath;
    folderEl.draggable = currentSort === 'custom';
    
    folderEl.innerHTML = `
        <div class="folder-icon">📁</div>
        <div class="shortcut-info">
            <div class="shortcut-name">${item.name}</div>
            <div class="shortcut-description">${item.count} élément${item.count > 1 ? 's' : ''}</div>
        </div>
    `;
    
    folderEl.onclick = (e) => {
        navigateToFolder(item.fullPath);
    };
    
    folderEl.oncontextmenu = (e) => showFolderContextMenu(e, folderEl, item);
    
    return folderEl;
}

function createShortcutElement(item, position) {
    const shortcut = item.data;
    const shortcutEl = document.createElement('div');
    shortcutEl.className = 'shortcut';
    shortcutEl.dataset.position = position;
    shortcutEl.dataset.type = 'shortcut';
    shortcutEl.dataset.index = item.index;
    shortcutEl.draggable = currentSort === 'custom';
    
    shortcutEl.onclick = (e) => {
        if (e.button === 0) {
            window.pywebview.api.openShortcut(shortcut.path);
            // Update lastOpened
            updateLastOpened(item.index);
        }
    };
    shortcutEl.oncontextmenu = (e) => showContextMenu(e, shortcutEl, shortcut, item.index);
    
    const img = document.createElement('img');
    img.alt = shortcut.name;
    img.src = `/icon/${item.index}`;
    img.onerror = () => {
        img.src = DEFAULT_ICON_JS;
        img.classList.add('missing');
    };
    
    const info = document.createElement('div');
    info.className = 'shortcut-info';
    const name = document.createElement('div');
    name.className = 'shortcut-name';
    name.textContent = shortcut.name;
    
    if (shortcut.description) {
        const desc = document.createElement('div');
        desc.className = 'shortcut-description';
        desc.textContent = shortcut.description;
        info.appendChild(name);
        info.appendChild(desc);
    } else {
        info.appendChild(name);
    }
    
    shortcutEl.appendChild(img);
    shortcutEl.appendChild(info);
    
    return shortcutEl;
}

async function updateLastOpened(index) {
    try {
        const shortcuts = await window.pywebview.api.getShortcuts();
        const shortcut = shortcuts[index];
        if (shortcut) {
            shortcut.lastOpened = Date.now();
            await window.pywebview.api.updateShortcut(index, shortcut);
        }
    } catch (e) {
        console.error('Error updating lastOpened:', e);
    }
}

// Keep old function name for compatibility
async function renderShortcuts() {
    await renderItems();
}

// Theme management
const stylePanel = document.getElementById('stylePanel');
const toggleStyleBtn = document.getElementById('toggleStyleBtn');
const presetTheme = document.getElementById('presetTheme');
const bannerColor = document.getElementById('bannerColor');
const primaryColor = document.getElementById('primaryColor');
const backgroundPageColor = document.getElementById('backgroundPageColor');
const cardsColor = document.getElementById('cardsColor');
const accentColor = document.getElementById('accentColor');
const buttonColor = document.getElementById('buttonColor');
const textColor = document.getElementById('textColor');
const borderRadius = document.getElementById('borderRadius');
const shadowSize = document.getElementById('shadowSize');
const iconSizeInput = document.getElementById('iconSize');
// New Theme Controls
const wallpaperPathInput = document.getElementById('wallpaperPath');
const browseWallpaperBtn = document.getElementById('browseWallpaper');
const clearWallpaperBtn = document.getElementById('clearWallpaper');
const wallpaperBlurInput = document.getElementById('wallpaperBlur');
const cardsOpacityInput = document.getElementById('cardsOpacity');
const fontFamilyInput = document.getElementById('fontFamily');

const saveThemeBtn = document.getElementById('saveTheme');
const themeNameInput = document.getElementById('themeName');
const savedThemesContainer = document.getElementById('savedThemes');

// Predefined themes
const presetThemes = {
    default: {
        bannerColor: '#2c3e50',
        primaryColor: '#f5f6fa',
        backgroundPageColor: '#e8eaf0',
        cardsColor: '#ffffff',
        accentColor: '#3498db',
        buttonColor: '#3498db',
        textColor: '#333333',
        borderRadius: 4,
        shadowSize: 4,
        iconSize: 64,
        cardsOpacity: 100,
        wallpaperBlur: 0,
        fontFamily: "'Segoe UI', Arial, sans-serif"
    },
    modern: {
        bannerColor: '#1a237e',
        primaryColor: '#fafafa',
        backgroundPageColor: '#eeeeee',
        cardsColor: '#ffffff',
        accentColor: '#00bcd4',
        buttonColor: '#00bcd4',
        textColor: '#212121',
        borderRadius: 8,
        shadowSize: 8,
        iconSize: 80,
        cardsOpacity: 100,
        wallpaperBlur: 0,
        fontFamily: "'Roboto', sans-serif"
    },
    soft: {
        bannerColor: '#5d4037',
        primaryColor: '#efebe9',
        backgroundPageColor: '#d7ccc8',
        cardsColor: '#fafafa',
        accentColor: '#8d6e63',
        buttonColor: '#a1887f',
        textColor: '#3e2723',
        borderRadius: 16,
        shadowSize: 12,
        iconSize: 72,
        cardsOpacity: 90,
        wallpaperBlur: 5,
        fontFamily: "'Lato', sans-serif"
    },
    glass: {
        bannerColor: 'rgba(44, 62, 80, 0.8)',
        primaryColor: 'rgba(245, 246, 250, 0.5)',
        backgroundPageColor: '#2c3e50',
        cardsColor: 'rgba(255, 255, 255, 0.7)',
        accentColor: '#3498db',
        buttonColor: '#3498db',
        textColor: '#333333',
        borderRadius: 12,
        shadowSize: 8,
        iconSize: 64,
        cardsOpacity: 70,
        wallpaperBlur: 10,
        fontFamily: "'Segoe UI', Arial, sans-serif"
    }
};

// Load current theme values into inputs
function loadCurrentTheme() {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    bannerColor.value = computedStyle.getPropertyValue('--banner-color').trim();
    primaryColor.value = computedStyle.getPropertyValue('--primary-color').trim();
    backgroundPageColor.value = computedStyle.getPropertyValue('--background-page-color').trim();
    cardsColor.value = computedStyle.getPropertyValue('--cards-color').trim();
    accentColor.value = computedStyle.getPropertyValue('--accent-color').trim();
    buttonColor.value = computedStyle.getPropertyValue('--button-color').trim();
    textColor.value = computedStyle.getPropertyValue('--text-color').trim();
    borderRadius.value = parseInt(computedStyle.getPropertyValue('--border-radius')) || 4;
    shadowSize.value = parseInt(computedStyle.getPropertyValue('--shadow-size')) || 10;
    iconSizeInput.value = parseInt(computedStyle.getPropertyValue('--icon-size')) || 64;

    // New controls
    const opacity = parseFloat(computedStyle.getPropertyValue('--cards-opacity'));
    cardsOpacityInput.value = isNaN(opacity) ? 100 : Math.round(opacity * 100);

    const blur = computedStyle.getPropertyValue('--wallpaper-blur');
    wallpaperBlurInput.value = parseInt(blur) || 0;

    // Remove quotes for comparison if needed
    let font = computedStyle.getPropertyValue('--font-family').trim();
    if (font.startsWith('"') && font.endsWith('"')) {
        font = font.substring(1, font.length - 1);
    }
    // Try to match font
    Array.from(fontFamilyInput.options).forEach(opt => {
        if (opt.value.includes(font.split(',')[0].replace(/['"]/g, ''))) {
            fontFamilyInput.value = opt.value;
        }
    });
}

// Apply theme in real-time
function applyThemeRealtime() {
    const theme = {
        bannerColor: bannerColor.value,
        primaryColor: primaryColor.value,
        backgroundPageColor: backgroundPageColor.value,
        cardsColor: cardsColor.value,
        accentColor: accentColor.value,
        buttonColor: buttonColor.value,
        textColor: textColor.value,
        borderRadius: parseInt(borderRadius.value),
        shadowSize: parseInt(shadowSize.value),
        iconSize: parseInt(iconSizeInput.value),
        cardsOpacity: parseInt(cardsOpacityInput.value),
        wallpaperBlur: parseInt(wallpaperBlurInput.value),
        fontFamily: fontFamilyInput.value,
        wallpaperPath: wallpaperPathInput.value // Keep current wallpaper
    };
    applyTheme(theme);
}

// Add real-time listeners
bannerColor.addEventListener('input', applyThemeRealtime);
primaryColor.addEventListener('input', applyThemeRealtime);
backgroundPageColor.addEventListener('input', applyThemeRealtime);
cardsColor.addEventListener('input', applyThemeRealtime);
accentColor.addEventListener('input', applyThemeRealtime);
buttonColor.addEventListener('input', applyThemeRealtime);
textColor.addEventListener('input', applyThemeRealtime);
borderRadius.addEventListener('input', applyThemeRealtime);
shadowSize.addEventListener('input', applyThemeRealtime);
iconSizeInput.addEventListener('input', applyThemeRealtime);
wallpaperBlurInput.addEventListener('input', applyThemeRealtime);
cardsOpacityInput.addEventListener('input', applyThemeRealtime);
fontFamilyInput.addEventListener('change', applyThemeRealtime);

// Wallpaper browse
browseWallpaperBtn.addEventListener('click', async () => {
    try {
        const path = await window.pywebview.api.pickWallpaper();
        if (path) {
            wallpaperPathInput.value = path;
            applyThemeRealtime();
        }
    } catch (e) {
        console.error("Error picking wallpaper:", e);
    }
});

clearWallpaperBtn.addEventListener('click', () => {
    wallpaperPathInput.value = '';
    applyThemeRealtime();
});

// Toggle style panel
toggleStyleBtn.addEventListener('click', () => {
    stylePanel.classList.toggle('hidden');
    settingsPanel.classList.add('hidden'); // Close settings if open
    if (!stylePanel.classList.contains('hidden')) {
        loadCurrentTheme(); // Load current values when opening
    }
});

document.getElementById('closeStyle').addEventListener('click', () => {
    stylePanel.classList.add('hidden');
});

// Toggle settings panel
const settingsPanel = document.getElementById('settingsPanel');
document.getElementById('toggleSettingsBtn').addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    stylePanel.classList.add('hidden'); // Close style if open
});

document.getElementById('closeSettings').addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
});

// Apply theme from inputs
document.getElementById('applyStyle').addEventListener('click', async () => {
    const theme = {
        bannerColor: bannerColor.value,
        primaryColor: primaryColor.value,
        backgroundPageColor: backgroundPageColor.value,
        cardsColor: cardsColor.value,
        accentColor: accentColor.value,
        buttonColor: buttonColor.value,
        textColor: textColor.value,
        borderRadius: parseInt(borderRadius.value),
        shadowSize: parseInt(shadowSize.value),
        iconSize: parseInt(iconSizeInput.value),
        cardsOpacity: parseInt(cardsOpacityInput.value),
        wallpaperBlur: parseInt(wallpaperBlurInput.value),
        fontFamily: fontFamilyInput.value,
        wallpaperPath: wallpaperPathInput.value
    };
    applyTheme(theme);
    await window.pywebview.api.saveTheme(theme);
});

// Load preset theme and apply immediately
presetTheme.addEventListener('change', () => {
    const theme = presetThemes[presetTheme.value];
    if (theme) {
        // Keep current wallpaper if preset doesn't specify one (presets usually don't)
        if (!theme.wallpaperPath) {
            theme.wallpaperPath = wallpaperPathInput.value;
        }
        // Update inputs and apply immediately
        applyTheme(theme);
        // Also update inputs visually
        setThemeInputs(theme);
    }
});

// Save custom theme
saveThemeBtn.addEventListener('click', async () => {
    const name = themeNameInput.value.trim();
    if (!name) return;
    
    const theme = {
        name,
        bannerColor: bannerColor.value,
        primaryColor: primaryColor.value,
        backgroundPageColor: backgroundPageColor.value,
        cardsColor: cardsColor.value,
        accentColor: accentColor.value,
        buttonColor: buttonColor.value,
        textColor: textColor.value,
        borderRadius: parseInt(borderRadius.value),
        shadowSize: parseInt(shadowSize.value),
        iconSize: parseInt(iconSizeInput.value),
        cardsOpacity: parseInt(cardsOpacityInput.value),
        wallpaperBlur: parseInt(wallpaperBlurInput.value),
        fontFamily: fontFamilyInput.value,
        wallpaperPath: wallpaperPathInput.value
    };
    
    await window.pywebview.api.saveCustomTheme(theme);
    themeNameInput.value = '';
    await loadSavedThemes();
});

// Apply theme function
function applyTheme(theme) {
    document.documentElement.style.setProperty('--banner-color', theme.bannerColor);
    document.documentElement.style.setProperty('--primary-color', theme.primaryColor);
    document.documentElement.style.setProperty('--background-page-color', theme.backgroundPageColor);
    document.documentElement.style.setProperty('--cards-color', theme.cardsColor);
    document.documentElement.style.setProperty('--accent-color', theme.accentColor);
    document.documentElement.style.setProperty('--button-color', theme.buttonColor);
    document.documentElement.style.setProperty('--text-color', theme.textColor);
    document.documentElement.style.setProperty('--border-radius', `${theme.borderRadius}px`);
    document.documentElement.style.setProperty('--icon-size', `${theme.iconSize}px`);
    
    // New properties
    if (theme.cardsOpacity !== undefined) {
        document.documentElement.style.setProperty('--cards-opacity', theme.cardsOpacity / 100);
    } else {
        document.documentElement.style.setProperty('--cards-opacity', 1);
    }

    if (theme.wallpaperBlur !== undefined) {
        document.documentElement.style.setProperty('--wallpaper-blur', `${theme.wallpaperBlur}px`);
    }

    if (theme.fontFamily) {
        document.documentElement.style.setProperty('--font-family', theme.fontFamily);
    }

    const shadowValue = `0 ${theme.shadowSize/2}px ${theme.shadowSize}px rgba(0,0,0,0.1)`;
    document.documentElement.style.setProperty('--shadow', shadowValue);
    document.documentElement.style.setProperty('--shadow-size', theme.shadowSize);
    
    // Apply wallpaper
    if (theme.wallpaperPath) {
        document.body.style.backgroundImage = `url('/wallpaper?t=${Date.now()}')`;
        document.body.classList.add('has-wallpaper');
        // If we are previewing a new wallpaper path that isn't saved yet,
        // the /wallpaper endpoint will still serve the saved one.
        // We can't easily preview a local file path in webview without serving it.
        // But since we picked it via API, we might be able to handle it if we passed it back.
        // Actually, the /wallpaper endpoint reads from theme.json.
        // Since we haven't saved theme.json yet during preview, this is tricky.
        // However, we can update the background image using a direct file protocol if allowed,
        // or we need to temporary save it? No.
        // Let's rely on the input value.
        // If theme.wallpaperPath matches the input, we assume it's valid.
    } else {
        document.body.style.backgroundImage = 'none';
        document.body.classList.remove('has-wallpaper');
    }

    // Update inputs to reflect current theme
    // (This might be redundant if triggered by input change, but safe)
    if (document.activeElement !== bannerColor) bannerColor.value = theme.bannerColor;
    if (document.activeElement !== primaryColor) primaryColor.value = theme.primaryColor;
    if (document.activeElement !== backgroundPageColor) backgroundPageColor.value = theme.backgroundPageColor;
    if (document.activeElement !== cardsColor) cardsColor.value = theme.cardsColor;
    if (document.activeElement !== accentColor) accentColor.value = theme.accentColor;
    if (document.activeElement !== buttonColor) buttonColor.value = theme.buttonColor;
    if (document.activeElement !== textColor) textColor.value = theme.textColor;
    if (document.activeElement !== borderRadius) borderRadius.value = theme.borderRadius;
    if (document.activeElement !== shadowSize) shadowSize.value = theme.shadowSize;
    if (document.activeElement !== iconSizeInput) iconSizeInput.value = theme.iconSize || 64;

    if (document.activeElement !== cardsOpacityInput && theme.cardsOpacity !== undefined)
        cardsOpacityInput.value = theme.cardsOpacity;
    if (document.activeElement !== wallpaperBlurInput && theme.wallpaperBlur !== undefined)
        wallpaperBlurInput.value = theme.wallpaperBlur;
    if (document.activeElement !== fontFamilyInput && theme.fontFamily)
        fontFamilyInput.value = theme.fontFamily;
    if (document.activeElement !== wallpaperPathInput && theme.wallpaperPath !== undefined)
        wallpaperPathInput.value = theme.wallpaperPath;
}

// Load saved themes
async function loadSavedThemes() {
    const themes = await window.pywebview.api.getCustomThemes();
    savedThemesContainer.innerHTML = '';
    
    themes.forEach(theme => {
        const themeEl = document.createElement('div');
        themeEl.className = 'theme-item';
        themeEl.innerHTML = `
            <span>${theme.name}</span>
            <button class="btn small" onclick="applyCustomTheme('${theme.name}')">Appliquer</button>
        `;
        savedThemesContainer.appendChild(themeEl);
    });
}

// Apply a saved custom theme by name
async function applyCustomTheme(name) {
    try {
        const themes = await window.pywebview.api.getCustomThemes();
        let theme = themes.find(t => t.name === name);
        if (!theme) return;
        
        // Migrate old theme format to new one
        if (theme.backgroundColor && !theme.bannerColor) {
            theme.bannerColor = theme.backgroundColor;
            theme.backgroundPageColor = theme.primaryColor || '#f5f6fa';
            theme.primaryColor = '#f5f6fa';
            theme.cardsColor = '#ffffff';
        }
        
        // Apply default values for missing properties
        theme.bannerColor = theme.bannerColor || '#2c3e50';
        theme.primaryColor = theme.primaryColor || '#f5f6fa';
        theme.backgroundPageColor = theme.backgroundPageColor || '#e8eaf0';
        theme.cardsColor = theme.cardsColor || '#ffffff';
        theme.accentColor = theme.accentColor || '#3498db';
        theme.buttonColor = theme.buttonColor || '#3498db';
        theme.textColor = theme.textColor || '#333333';
        theme.borderRadius = theme.borderRadius || 4;
        theme.shadowSize = theme.shadowSize || 10;
        theme.iconSize = theme.iconSize || 64;
        
        // New defaults
        savedTheme.cardsOpacity = (savedTheme.cardsOpacity !== undefined) ? savedTheme.cardsOpacity : 100;
        savedTheme.wallpaperBlur = (savedTheme.wallpaperBlur !== undefined) ? savedTheme.wallpaperBlur : 0;
        savedTheme.fontFamily = savedTheme.fontFamily || "'Segoe UI', Arial, sans-serif";

        applyTheme(savedTheme);
        setThemeInputs(savedTheme);
    } catch (e) {
        console.error('Erreur en appliquant le thème personnalisé:', e);
    }
}

function setThemeInputs(theme) {
    try {
        bannerColor.value = theme.bannerColor || bannerColor.value;
        primaryColor.value = theme.primaryColor || primaryColor.value;
        backgroundPageColor.value = theme.backgroundPageColor || backgroundPageColor.value;
        cardsColor.value = theme.cardsColor || cardsColor.value;
        accentColor.value = theme.accentColor || accentColor.value;
        buttonColor.value = theme.buttonColor || buttonColor.value;
        textColor.value = theme.textColor || textColor.value;
        borderRadius.value = (typeof theme.borderRadius !== 'undefined') ? theme.borderRadius : borderRadius.value;
        shadowSize.value = (typeof theme.shadowSize !== 'undefined') ? theme.shadowSize : shadowSize.value;
        iconSizeInput.value = (typeof theme.iconSize !== 'undefined') ? theme.iconSize : iconSizeInput.value;
        cardsOpacityInput.value = (typeof theme.cardsOpacity !== 'undefined') ? theme.cardsOpacity : 100;
        wallpaperBlurInput.value = (typeof theme.wallpaperBlur !== 'undefined') ? theme.wallpaperBlur : 0;
        fontFamilyInput.value = theme.fontFamily || "'Segoe UI', Arial, sans-serif";
        wallpaperPathInput.value = theme.wallpaperPath || '';
    } catch (e) {
        console.error('Erreur en mettant à jour les contrôles de thème:', e);
    }
}

// Initial load
async function initializeApp() {
    try {
        console.log('Initialisation...');
        await loadFolders();
        await renderItems();
        const savedTheme = await window.pywebview.api.getTheme();
        if (savedTheme) {
            // Migrate old theme format to new one
            if (savedTheme.backgroundColor && !savedTheme.bannerColor) {
                // Old format: backgroundColor was banner, primaryColor was content
                savedTheme.bannerColor = savedTheme.backgroundColor;
                savedTheme.backgroundPageColor = savedTheme.primaryColor || '#f5f6fa';
                savedTheme.primaryColor = '#f5f6fa';
                savedTheme.cardsColor = '#ffffff';
                // Save migrated theme
                await window.pywebview.api.saveTheme(savedTheme);
            }
            // Apply default values for missing properties
            savedTheme.bannerColor = savedTheme.bannerColor || '#2c3e50';
            savedTheme.primaryColor = savedTheme.primaryColor || '#f5f6fa';
            savedTheme.backgroundPageColor = savedTheme.backgroundPageColor || '#e8eaf0';
            savedTheme.cardsColor = savedTheme.cardsColor || '#ffffff';
            savedTheme.accentColor = savedTheme.accentColor || '#3498db';
            savedTheme.buttonColor = savedTheme.buttonColor || '#3498db';
            savedTheme.textColor = savedTheme.textColor || '#333333';
            savedTheme.borderRadius = savedTheme.borderRadius || 4;
            savedTheme.shadowSize = savedTheme.shadowSize || 10;
            savedTheme.iconSize = savedTheme.iconSize || 64;

            // New defaults
            savedTheme.cardsOpacity = (savedTheme.cardsOpacity !== undefined) ? savedTheme.cardsOpacity : 100;
            savedTheme.wallpaperBlur = (savedTheme.wallpaperBlur !== undefined) ? savedTheme.wallpaperBlur : 0;
            savedTheme.fontFamily = savedTheme.fontFamily || "'Segoe UI', Arial, sans-serif";

            applyTheme(savedTheme);
            setThemeInputs(savedTheme);
        } else {
            // Load default theme if no saved theme
            loadCurrentTheme();
        }
        await loadSavedThemes();
        setupDragAndDrop();
        console.log('Initialisation terminée');
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
    }
}
