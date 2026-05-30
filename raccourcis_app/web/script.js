console.log('script.js chargé, début exécution');

// ==================== POLYFILL pywebview.api -> HTTP API ====================
// Remplace les appels pywebview.api par des appels HTTP fetch
window.pywebview = {
    api: {
        getTheme: async () => (await fetch('/api/getTheme')).json(),
        getShortcuts: async () => (await fetch('/api/getShortcuts')).json(),
        getSettings: async () => (await fetch('/api/getSettings')).json(),
        getFolderOrder: async () => (await fetch('/api/getFolderOrder')).json(),
        getFolderIcons: async () => (await fetch('/api/getFolderIcons')).json(),
        getDashboardLayout: async () => (await fetch('/api/getDashboardLayout')).json(),
        getRecentHistory: async () => (await fetch('/api/getRecentHistory')).json(),
        getCustomThemes: async () => (await fetch('/api/getCustomThemes')).json(),
        
        saveTheme: async (data) => (await fetch('/api/saveTheme', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        })).json(),
        
        addShortcut: async (data) => (await fetch('/api/addShortcut', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        })).json(),
        
        updateShortcut: async (index, data) => (await fetch('/api/updateShortcut', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({index, data})
        })).json(),
        
        deleteShortcut: async (index) => (await fetch('/api/deleteShortcut', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({index})
        })).json(),
        
        saveFolderOrder: async (data) => (await fetch('/api/saveFolderOrder', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        })).json(),
        
        saveFolderIcons: async (data) => (await fetch('/api/saveFolderIcons', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        })).json(),
        
        saveDashboardLayout: async (data) => (await fetch('/api/saveDashboardLayout', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        })).json(),
        
        saveSettings: async (data) => (await fetch('/api/saveSettings', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        })).json(),
        
        openShortcut: async (path, inApp, name) => (await fetch('/api/openShortcut', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path, inApp, name})
        })).json(),
        
        getIconForPath: async (path) => (await fetch('/api/getIconForPath?path=' + encodeURIComponent(path))).json(),
        
        browseFile: async (fileTypes) => {
            const params = fileTypes ? '?fileTypes=' + encodeURIComponent(fileTypes.join(',')) : '';
            return (await fetch('/api/browseFile' + params)).json();
        },
        
        pickFile: async () => (await fetch('/api/pickFile')).json(),
        pickIcon: async () => (await fetch('/api/pickIcon')).json(),
        
        saveCustomTheme: async (name, theme) => (await fetch('/api/saveCustomTheme', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, theme})
        })).json(),
        
        deleteCustomTheme: async (name) => (await fetch('/api/deleteCustomTheme', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name})
        })).json(),
        
        addToRecentHistory: async (shortcut) => (await fetch('/api/addToRecentHistory', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({shortcut})
        })).json(),
        
        clearRecentHistory: async () => (await fetch('/api/clearRecentHistory', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({})
        })).json(),
        
        // Ces fonctions ne sont pas implémentées côté HTTP, retourner null/erreur
        openActionRecorder: async () => ({ error: 'Not implemented in browser mode' }),
        openSelectorPicker: async () => ({ error: 'Not implemented in browser mode' }),
        setWindowTitle: async () => null,
        closeWindow: async () => null,
    }
};
console.log('pywebview.api polyfill loaded');
// ==================== END POLYFILL ====================

// Placeholder (1x1 transparent gif) used when an icon is missing or invalid
const DEFAULT_ICON_JS = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

// Cache pour les canvas des icônes (hit-test)
const iconCanvasCache = new Map();

// Fonction pour vérifier si un pixel est transparent
function isPixelTransparent(img, clickX, clickY) {
    try {
        // Vérifier si l'image est chargée
        if (!img.complete || img.naturalWidth === 0) {
            return false; // Image pas chargée, considérer comme cliquable
        }
        
        // Créer ou récupérer le canvas en cache
        let canvasData = iconCanvasCache.get(img.src);
        if (!canvasData) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 64;
            canvas.height = img.naturalHeight || img.height || 64;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            // Essayer de dessiner l'image
            try {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Tester si on peut lire les pixels (CORS)
                ctx.getImageData(0, 0, 1, 1);
                canvasData = { canvas, ctx, valid: true };
            } catch (corsError) {
                console.warn('CORS error, icon click will work normally');
                canvasData = { valid: false };
            }
            iconCanvasCache.set(img.src, canvasData);
        }
        
        // Si le canvas n'est pas valide (CORS), considérer comme cliquable
        if (!canvasData.valid) {
            return false;
        }
        
        // Calculer les coordonnées sur l'image
        const rect = img.getBoundingClientRect();
        const scaleX = canvasData.canvas.width / rect.width;
        const scaleY = canvasData.canvas.height / rect.height;
        const x = Math.floor((clickX - rect.left) * scaleX);
        const y = Math.floor((clickY - rect.top) * scaleY);
        
        // Vérifier les limites
        if (x < 0 || y < 0 || x >= canvasData.canvas.width || y >= canvasData.canvas.height) {
            return true; // Hors limites = transparent
        }
        
        // Lire le pixel
        const pixel = canvasData.ctx.getImageData(x, y, 1, 1).data;
        
        // Alpha < 30 = considéré transparent
        return pixel[3] < 30;
    } catch (e) {
        console.error('Hit-test error:', e);
        return false; // En cas d'erreur, considérer comme cliquable
    }
}

// Détection si un chemin est une URL
function isUrlPath(path) {
    if (!path) return false;
    const urlPattern = /^(https?:\/\/|ftp:\/\/|file:\/\/|www\.)/i;
    return urlPattern.test(path.trim());
}

// Fonction pour gérer les icônes avec fallback robuste
function setupIconWithFallback(img, fallbackEmoji) {
    // Détecter les erreurs de chargement
    img.onerror = function() {
        this.style.display = 'none';
        this.parentElement.innerHTML = fallbackEmoji;
    };
    
    // Détecter les images chargées mais invalides (trop petites, transparentes)
    img.onload = function() {
        // Vérifier si l'image est valide (pas trop petite)
        if (this.naturalWidth < 5 || this.naturalHeight < 5) {
            this.style.display = 'none';
            this.parentElement.innerHTML = fallbackEmoji;
        }
    };
}

// ==================== ACTION RECORDER ====================
// Enregistrer les actions de manière interactive
async function openActionRecorder() {
    console.log('[ActionRecorder] Starting...');
    
    // Récupérer l'URL du raccourci en cours d'édition
    const editPath = document.getElementById('editPath')?.value || '';
    console.log('[ActionRecorder] URL:', editPath);
    
    if (!editPath || !editPath.startsWith('http')) {
        alert('Veuillez d\'abord entrer une URL valide dans le champ "Chemin"');
        return;
    }
    
    // Récupérer les actions existantes
    const existingActions = gatherAutomationActions();
    console.log('[ActionRecorder] Existing actions:', existingActions.length);
    
    try {
        const result = await window.pywebview.api.openActionRecorder(editPath, existingActions);
        console.log('[ActionRecorder] Result:', result);
        
        if (result && result.success && result.actions && result.actions.length > 0) {
            // Remplacer les actions par celles enregistrées
            const container = document.getElementById('automationActionsList');
            container.innerHTML = '';
            
            result.actions.forEach((action, index) => {
                addAutomationActionUI(action, index);
            });
            
            updateActionNumbers();
            console.log('[ActionRecorder] Loaded', result.actions.length, 'actions');
        } else if (result && result.error === 'Cancelled') {
            console.log('[ActionRecorder] Cancelled by user');
        } else if (result && result.error) {
            console.error('[ActionRecorder] Error:', result.error);
        }
    } catch (e) {
        console.error('[ActionRecorder] Exception:', e);
        alert('Erreur: ' + e.message);
    }
}

// ==================== SELECTOR PICKER ====================
// Ouvrir le site en mode sélection pour choisir un élément
let pendingSelectorInput = null;

async function openSelectorPicker(inputElement) {
    console.log('[SelectorPicker] Starting openSelectorPicker...');
    
    // Récupérer l'URL du raccourci en cours d'édition
    const editPath = document.getElementById('editPath')?.value || '';
    console.log('[SelectorPicker] URL:', editPath);
    
    if (!editPath || !editPath.startsWith('http')) {
        alert('Veuillez d\'abord entrer une URL valide dans le champ "Chemin"');
        return;
    }
    
    pendingSelectorInput = inputElement;
    
    // Récupérer les actions précédentes (avant l'action courante)
    const actionEl = inputElement.closest('.automation-action');
    const previousActions = [];
    if (actionEl) {
        const container = document.getElementById('automationActionsList');
        const allActions = Array.from(container.children);
        const currentIndex = allActions.indexOf(actionEl);
        console.log('[SelectorPicker] Current action index:', currentIndex, 'Total actions:', allActions.length);
        
        // Collecter toutes les actions avant celle-ci
        for (let i = 0; i < currentIndex; i++) {
            const action = gatherSingleAction(allActions[i]);
            if (action) {
                previousActions.push(action);
                console.log('[SelectorPicker] Collected action', i, ':', action.type, action.selector || '');
            }
        }
    }
    
    console.log('[SelectorPicker] Previous actions count:', previousActions.length);
    console.log('[SelectorPicker] Calling Python API...');
    
    // Ouvrir le site en mode sélection via l'API Python
    try {
        const result = await window.pywebview.api.openSelectorPicker(editPath, previousActions);
        console.log('[SelectorPicker] Result from Python:', result);
        if (result && result.success && result.selector) {
            inputElement.value = result.selector;
            inputElement.focus();
            console.log('[SelectorPicker] Selector set:', result.selector);
        } else if (result && result.error) {
            console.error('[SelectorPicker] Error:', result.error);
        }
    } catch (e) {
        console.error('[SelectorPicker] Exception:', e);
        alert('Erreur: ' + e.message);
    }
}

// Callback appelé quand un sélecteur est choisi
function onSelectorPicked(selector) {
    if (pendingSelectorInput && selector) {
        pendingSelectorInput.value = selector;
        pendingSelectorInput.focus();
        pendingSelectorInput = null;
    }
}

// ==================== AUTOMATION ACTIONS ====================
// Types d'actions disponibles
const AUTOMATION_ACTION_TYPES = [
    { value: 'wait', label: '⏱️ Attendre', fields: ['delay'] },
    { value: 'waitForElement', label: '🔍 Attendre élément', fields: ['selector', 'timeout'] },
    { value: 'click', label: '👆 Cliquer', fields: ['selector'] },
    { value: 'type', label: '⌨️ Taper du texte', fields: ['selector', 'text', 'clear'] },
    { value: 'keyboard', label: '🔤 Touche clavier', fields: ['key', 'modifiers'] },
    { value: 'submit', label: '📤 Soumettre formulaire', fields: ['selector'] },
    { value: 'script', label: '📜 Script JS', fields: ['script'] }
];

// Charger les actions d'automatisation dans l'UI
function loadAutomationActions(actions) {
    const container = document.getElementById('automationActionsList');
    container.innerHTML = '';
    
    actions.forEach((action, index) => {
        addAutomationActionUI(action, index);
    });
}

// Ajouter une action d'automatisation dans l'UI
function addAutomationActionUI(action = { type: 'wait', delay: 1000 }, index = null) {
    const container = document.getElementById('automationActionsList');
    const actionIndex = index !== null ? index : container.children.length;
    
    const actionEl = document.createElement('div');
    actionEl.className = 'automation-action';
    actionEl.dataset.index = actionIndex;
    
    const actionType = AUTOMATION_ACTION_TYPES.find(t => t.value === action.type) || AUTOMATION_ACTION_TYPES[0];
    
    let fieldsHtml = '';
    
    // Générer les champs selon le type d'action
    switch(action.type) {
        case 'wait':
            fieldsHtml = `
                <input type="number" class="action-delay" value="${action.delay || 1000}" min="0" step="100" placeholder="Délai (ms)">
                <span style="font-size: 12px; opacity: 0.7;">ms</span>
            `;
            break;
        case 'waitForElement':
            fieldsHtml = `
                <div class="selector-input-group">
                    <input type="text" class="action-selector" value="${action.selector || ''}" placeholder="Sélecteur CSS (ex: #btn, .class)">
                    <button type="button" class="btn-pick-selector" title="Sélectionner sur le site">🎯</button>
                </div>
                <input type="number" class="action-timeout" value="${action.timeout || 10000}" min="0" step="1000" placeholder="Timeout" style="width: 80px;">
                <span style="font-size: 12px; opacity: 0.7;">ms</span>
            `;
            break;
        case 'click':
            fieldsHtml = `
                <div class="selector-input-group">
                    <input type="text" class="action-selector" value="${action.selector || ''}" placeholder="Sélecteur CSS (ex: button.submit)">
                    <button type="button" class="btn-pick-selector" title="Sélectionner sur le site">🎯</button>
                </div>
            `;
            break;
        case 'type':
            fieldsHtml = `
                <div class="selector-input-group">
                    <input type="text" class="action-selector" value="${action.selector || ''}" placeholder="Sélecteur CSS (ex: input#email)">
                    <button type="button" class="btn-pick-selector" title="Sélectionner sur le site">🎯</button>
                </div>
                <input type="text" class="action-text" value="${action.text || ''}" placeholder="Texte à taper">
                <label style="font-size: 12px; display: flex; align-items: center; gap: 4px;">
                    <input type="checkbox" class="action-clear" ${action.clear ? 'checked' : ''}>
                    Effacer avant
                </label>
            `;
            break;
        case 'keyboard':
            const modifiers = action.modifiers || [];
            fieldsHtml = `
                <input type="text" class="action-key" value="${action.key || ''}" placeholder="Touche (Enter, Tab, a, etc.)" style="width: 120px;">
                <div class="automation-action-modifiers">
                    <label><input type="checkbox" class="action-mod-ctrl" ${modifiers.includes('ctrl') ? 'checked' : ''}> Ctrl</label>
                    <label><input type="checkbox" class="action-mod-shift" ${modifiers.includes('shift') ? 'checked' : ''}> Shift</label>
                    <label><input type="checkbox" class="action-mod-alt" ${modifiers.includes('alt') ? 'checked' : ''}> Alt</label>
                </div>
            `;
            break;
        case 'submit':
            fieldsHtml = `
                <div class="selector-input-group">
                    <input type="text" class="action-selector" value="${action.selector || 'form'}" placeholder="Sélecteur du formulaire">
                    <button type="button" class="btn-pick-selector" title="Sélectionner sur le site">🎯</button>
                </div>
            `;
            break;
        case 'script':
            fieldsHtml = `
                <textarea class="action-script" placeholder="Code JavaScript à exécuter" rows="2" style="flex: 1; font-family: monospace; font-size: 12px;">${action.script || ''}</textarea>
            `;
            break;
    }
    
    // Générer les options du select
    const typeOptions = AUTOMATION_ACTION_TYPES.map(t => 
        `<option value="${t.value}" ${t.value === action.type ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    
    actionEl.innerHTML = `
        <span class="automation-action-number">${actionIndex + 1}</span>
        <div class="automation-action-config">
            <div class="automation-action-row">
                <select class="action-type">${typeOptions}</select>
                ${fieldsHtml}
            </div>
        </div>
        <button type="button" class="automation-action-delete" title="Supprimer">🗑️</button>
    `;
    
    // Event listener pour le changement de type
    const typeSelect = actionEl.querySelector('.action-type');
    typeSelect.addEventListener('change', (e) => {
        const newType = e.target.value;
        const newAction = { type: newType };
        // Conserver certaines valeurs si elles existent
        const currentAction = gatherSingleAction(actionEl);
        if (currentAction.selector) newAction.selector = currentAction.selector;
        if (currentAction.delay) newAction.delay = currentAction.delay;
        
        // Recréer l'élément avec le nouveau type
        const idx = parseInt(actionEl.dataset.index);
        actionEl.remove();
        addAutomationActionUI(newAction, idx);
        updateActionNumbers();
    });
    
    // Event listener pour supprimer
    actionEl.querySelector('.automation-action-delete').addEventListener('click', () => {
        actionEl.remove();
        updateActionNumbers();
    });
    
    // Event listener pour le bouton de sélection CSS
    const pickBtn = actionEl.querySelector('.btn-pick-selector');
    if (pickBtn) {
        pickBtn.addEventListener('click', () => {
            const selectorInput = actionEl.querySelector('.action-selector');
            openSelectorPicker(selectorInput);
        });
    }
    
    container.appendChild(actionEl);
}

// Mettre à jour les numéros des actions
function updateActionNumbers() {
    const container = document.getElementById('automationActionsList');
    Array.from(container.children).forEach((el, i) => {
        el.dataset.index = i;
        el.querySelector('.automation-action-number').textContent = i + 1;
    });
}

// Récupérer une seule action depuis son élément DOM
function gatherSingleAction(actionEl) {
    const type = actionEl.querySelector('.action-type').value;
    const action = { type };
    
    switch(type) {
        case 'wait':
            action.delay = parseInt(actionEl.querySelector('.action-delay')?.value) || 1000;
            break;
        case 'waitForElement':
            action.selector = actionEl.querySelector('.action-selector')?.value || '';
            action.timeout = parseInt(actionEl.querySelector('.action-timeout')?.value) || 10000;
            break;
        case 'click':
        case 'submit':
            action.selector = actionEl.querySelector('.action-selector')?.value || '';
            break;
        case 'type':
            action.selector = actionEl.querySelector('.action-selector')?.value || '';
            action.text = actionEl.querySelector('.action-text')?.value || '';
            action.clear = actionEl.querySelector('.action-clear')?.checked || false;
            break;
        case 'keyboard':
            action.key = actionEl.querySelector('.action-key')?.value || '';
            action.modifiers = [];
            if (actionEl.querySelector('.action-mod-ctrl')?.checked) action.modifiers.push('ctrl');
            if (actionEl.querySelector('.action-mod-shift')?.checked) action.modifiers.push('shift');
            if (actionEl.querySelector('.action-mod-alt')?.checked) action.modifiers.push('alt');
            break;
        case 'script':
            action.script = actionEl.querySelector('.action-script')?.value || '';
            break;
    }
    
    return action;
}

// Récupérer toutes les actions d'automatisation
function gatherAutomationActions() {
    const container = document.getElementById('automationActionsList');
    const actions = [];
    
    Array.from(container.children).forEach(actionEl => {
        const action = gatherSingleAction(actionEl);
        // Ne pas inclure les actions vides
        if (action.type === 'wait' || action.type === 'script' || action.selector || action.key) {
            actions.push(action);
        }
    });
    
    return actions;
}

// Event listener pour ajouter une nouvelle action
document.getElementById('addAutomationAction')?.addEventListener('click', () => {
    addAutomationActionUI();
});

// Event listener pour enregistrer les actions
document.getElementById('recordAutomationActions')?.addEventListener('click', () => {
    openActionRecorder();
});
// ==================== END AUTOMATION ACTIONS ====================

// Afficher une notification temporaire
function showNotification(message, duration = 2000) {
    // Supprimer notification existante
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Animation d'entrée
    requestAnimationFrame(() => toast.classList.add('show'));
    
    // Suppression après délai
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Custom modal functions
function showModal(title, message, showInput = false, inputValue = '') {
    return new Promise((resolve) => {
        try {
            const modal = document.getElementById('customModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalMessage = document.getElementById('modalMessage');
            const modalInput = document.getElementById('modalInput');
            const modalConfirm = document.getElementById('modalConfirm');
            const modalCancel = document.getElementById('modalCancel');

            // Vérification que tous les éléments existent
            if (!modal || !modalTitle || !modalMessage || !modalConfirm || !modalCancel) {
                console.error('Modal elements missing:', { modal, modalTitle, modalMessage, modalConfirm, modalCancel });
                resolve(false);
                return;
            }

            modalTitle.textContent = title;
            modalMessage.textContent = message;
            
            if (showInput && modalInput) {
                modalInput.classList.remove('hidden');
                modalInput.value = inputValue;
                setTimeout(() => modalInput.focus(), 100);
            } else if (modalInput) {
                modalInput.classList.add('hidden');
            }

            modal.classList.remove('hidden');

            const cleanup = () => {
                modal.classList.add('hidden');
                modalConfirm.onclick = null;
                modalCancel.onclick = null;
                if (modalInput) modalInput.onkeypress = null;
            };

            modalConfirm.onclick = () => {
                cleanup();
                resolve(showInput ? (modalInput ? modalInput.value : '') : true);
            };

            modalCancel.onclick = () => {
                cleanup();
                resolve(showInput ? null : false);
            };

            // Support Enter key for input
            if (showInput && modalInput) {
                modalInput.onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        cleanup();
                        resolve(modalInput.value);
                    }
                };
            }
        } catch (e) {
            console.error('Erreur showModal:', e);
            resolve(false);
        }
    });
}

function customConfirm(message) {
    return showModal('Confirmation', message, false);
}

function customPrompt(message, defaultValue = '') {
    return showModal('Saisie', message, true, defaultValue);
}

// Folder management
let currentFolder = '';
let folders = [];
let currentSort = 'custom'; // az, za, recent, custom
let folderOrdersCache = {}; // Cache for item orders per folder
let isDragging = false; // Flag to prevent click during drag
let isReorderMode = false; // Reorder mode flag

// Virtual folder for recently opened
const RECENT_FOLDER = '__recent__';
let recentHistory = []; // List of recently opened shortcuts

// Dashboard management - now per-folder
let allDashboardLayouts = {}; // { "folderPath": { enabled: true, tiles: [...] } }
let isDashboardEditMode = false;
let dashboardDraggedTile = null;

// Helper to get current folder's dashboard layout
function getCurrentDashboardLayout() {
    const key = currentFolder || '__root__';
    if (!allDashboardLayouts[key]) {
        // Le dossier "Récemment ouvert" a un dashboard activé par défaut
        const defaultEnabled = key === '__root__' || key === RECENT_FOLDER;
        allDashboardLayouts[key] = { enabled: defaultEnabled, tiles: [] };
    }
    return allDashboardLayouts[key];
}

// DOM Elements
const toggleFormBtn = document.getElementById('toggleFormBtn');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const addShortcutModal = document.getElementById('addShortcutModal');
const addShortcutForm = document.getElementById('addShortcutForm');
const itemsContainer = document.getElementById('itemsContainer');
const previewIcon = document.getElementById('previewIcon');
const previewName = document.getElementById('previewName');
const cancelFormBtn = document.getElementById('cancelForm');
const descriptionInput = document.getElementById('description');
const sortBtn = document.getElementById('sortBtn');
const sortMenu = document.getElementById('sortMenu');

// Auto-capitalize description
if (descriptionInput) {
    descriptionInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value.length > 0 && value[0] !== value[0].toUpperCase()) {
            const cursorPos = e.target.selectionStart;
            e.target.value = value.charAt(0).toUpperCase() + value.slice(1);
            e.target.setSelectionRange(cursorPos, cursorPos);
        }
    });
}

// Toggle form visibility (modal)
if (toggleFormBtn && addShortcutModal) {
    toggleFormBtn.addEventListener('click', () => {
        addShortcutModal.classList.remove('hidden');
        // Pre-select current folder in checkboxes
        updateFolderCheckboxes('folderCheckboxes', [currentFolder]);
        document.getElementById('name').focus();
    });
}

if (cancelFormBtn && addShortcutModal) {
    cancelFormBtn.addEventListener('click', () => {
        addShortcutModal.classList.add('hidden');
        addShortcutForm.reset();
        if (previewIcon) previewIcon.src = '';
        if (previewName) previewName.textContent = 'Nouveau raccourci';
    });
}

// Close modal on overlay click
if (addShortcutModal) {
    addShortcutModal.addEventListener('click', (e) => {
        if (e.target === addShortcutModal) {
            addShortcutModal.classList.add('hidden');
            addShortcutForm.reset();
            if (previewIcon) previewIcon.src = '';
            if (previewName) previewName.textContent = 'Nouveau raccourci';
        }
    });
}

// Sort menu toggle
if (sortBtn && sortMenu) {
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
            console.log(`📊 Tri changé: ${currentSort}`);
            await renderItems();
        });
    });
}

// View mode toggle
const toggleViewBtn = document.getElementById('toggleViewBtn');
let isGridView = true;

if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
        isGridView = !isGridView;
        toggleViewBtn.textContent = isGridView ? 'Mode Liste' : 'Mode Grille';
        itemsContainer.className = isGridView ? 'grid-view' : 'list-view';
        
    // Appliquer aussi à homeRootItems (page accueil)
    const homeRootItems = document.getElementById('homeRootItems');
    if (homeRootItems) {
        if (isGridView) {
            homeRootItems.classList.remove('list-view');
            homeRootItems.classList.add('grid-view');
        } else {
            homeRootItems.classList.remove('grid-view');
            homeRootItems.classList.add('list-view');
        }
    }
    });
}

// Reorder mode toggle
const toggleReorderBtn = document.getElementById('toggleReorderBtn');

if (toggleReorderBtn) {
    toggleReorderBtn.addEventListener('click', async () => {
    isReorderMode = !isReorderMode;
    
    if (isReorderMode) {
        // Enter reorder mode
        toggleReorderBtn.textContent = '✓ Terminer';
        toggleReorderBtn.classList.add('active');
        currentSort = 'custom'; // Force custom sort for reorder
        document.body.classList.add('reorder-mode');
    } else {
        // Exit reorder mode - save order
        toggleReorderBtn.textContent = 'Réorganiser';
        toggleReorderBtn.classList.remove('active');
        document.body.classList.remove('reorder-mode');
        await saveCurrentOrder();
    }
    
    await renderItems();
    });
}

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

// Détecter les URLs dans le champ path
document.getElementById('path').addEventListener('input', (e) => {
    const urlOptionsGroup = document.getElementById('urlOptionsGroup');
    if (isUrlPath(e.target.value)) {
        urlOptionsGroup.classList.remove('hidden');
    } else {
        urlOptionsGroup.classList.add('hidden');
    }
});

function updatePreview() {
    const nameInput = document.getElementById('name');
    previewName.textContent = nameInput.value || 'Aperçu';
}

// Form submission
addShortcutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pathValue = document.getElementById('path').value;
    
    // Récupérer le comportement URL si applicable
    let openInApp = null;
    if (isUrlPath(pathValue)) {
        const urlBehavior = document.querySelector('input[name="urlBehavior"]:checked')?.value || 'default';
        if (urlBehavior === 'app') openInApp = true;
        else if (urlBehavior === 'browser') openInApp = false;
        // 'default' reste null
    }
    
    const data = {
        name: document.getElementById('name').value,
        path: pathValue,
        iconPath: document.getElementById('iconPath').value || pathValue,
        description: document.getElementById('description').value,
        folders: getSelectedFolders('folderCheckboxes'),
        openInApp: openInApp
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
    
    // Reset form and hide modal
    addShortcutForm.reset();
    previewIcon.src = '';
    previewName.textContent = 'Nouveau raccourci';
    addShortcutModal.classList.add('hidden');
    document.getElementById('urlOptionsGroup').classList.add('hidden');
});

// Gestion du menu contextuel
function showContextMenu(e, shortcutEl, shortcut, index) {
    e.preventDefault();
    
    // Supprimer tout menu contextuel existant
    const oldMenu = document.querySelector('.context-menu');
    if (oldMenu) oldMenu.remove();

    // Déterminer si c'est une URL
    const isUrl = isUrlPath(shortcut.path);

    // Créer le nouveau menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    
    let menuHTML = '';
    
    if (isUrl) {
        // Options spécifiques aux URLs - condensé
        menuHTML += `<div class="menu-item open-app">🪟 App</div>`;
        menuHTML += `<div class="menu-item open-browser">🌐 Navigateur</div>`;
        menuHTML += `<div class="menu-item copy-url">📋 Copier</div>`;
        menuHTML += `<div class="menu-separator"></div>`;
    } else {
        // Option pour ouvrir les fichiers/dossiers
        menuHTML += `<div class="menu-item open-item">▶️ Ouvrir</div>`;
        menuHTML += `<div class="menu-item copy-path">📋 Copier</div>`;
        menuHTML += `<div class="menu-separator"></div>`;
    }
    
    menuHTML += `
        <div class="menu-item edit">✏️ Modifier</div>
        <div class="menu-item move">📁 Déplacer...</div>
        <div class="menu-separator"></div>
        <div class="menu-item delete danger">🗑️ Supprimer</div>
    `;
    
    menu.innerHTML = menuHTML;
    
    // Positionner le menu
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    document.body.appendChild(menu);

    // Ajuster la position si le menu dépasse de l'écran
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
    }

    // Gestionnaires d'événements spécifiques aux URLs
    if (isUrl) {
        menu.querySelector('.open-app').onclick = async () => {
            menu.remove();
            await window.pywebview.api.openShortcut(shortcut.path, true, shortcut.name);
            showNotification(`🌐 ${shortcut.name} ouvert dans l'application`);
        };
        
        menu.querySelector('.open-browser').onclick = async () => {
            menu.remove();
            await window.pywebview.api.openShortcut(shortcut.path, false, shortcut.name);
            showNotification(`🌐 ${shortcut.name} ouvert dans le navigateur`);
        };
        
        menu.querySelector('.copy-url').onclick = () => {
            navigator.clipboard.writeText(shortcut.path);
            showNotification('📋 URL copiée !');
            menu.remove();
        };
    } else {
        menu.querySelector('.open-item').onclick = async () => {
            menu.remove();
            await window.pywebview.api.openShortcut(shortcut.path, null, shortcut.name);
        };
        
        menu.querySelector('.copy-path').onclick = () => {
            navigator.clipboard.writeText(shortcut.path);
            showNotification('📋 Chemin copié !');
            menu.remove();
        };
    }

    // Gestionnaires d'événements communs
    menu.querySelector('.edit').onclick = () => {
        openEditForm(shortcut, index);
        menu.remove();
    };

    menu.querySelector('.move').onclick = () => {
        openMoveShortcutModal(shortcut, index);
        menu.remove();
    };

    menu.querySelector('.delete').onclick = async () => {
        menu.remove();
        try {
            const confirmed = await customConfirm('Voulez-vous vraiment supprimer ce raccourci ?');
            if (confirmed) {
                console.log('Suppression du raccourci index:', index);
                const result = await window.pywebview.api.deleteShortcut(index);
                console.log('Résultat suppression:', result);
                await renderShortcuts();
            }
        } catch (e) {
            console.error('Erreur suppression raccourci:', e);
        }
    };

    // Fermer le menu au clic ailleurs
    const closeMenuHandler = (e) => {
        // Ne pas fermer si le menu n'existe plus dans le DOM
        if (!document.body.contains(menu)) {
            document.removeEventListener('click', closeMenuHandler);
            return;
        }
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenuHandler);
        }
    };
    // Délai pour éviter que le clic d'ouverture ferme immédiatement
    setTimeout(() => {
        document.addEventListener('click', closeMenuHandler);
    }, 10);
}

// Ouvrir le modal pour déplacer un raccourci vers un autre dossier
function openMoveShortcutModal(shortcut, index) {
    const modal = document.getElementById('moveShortcutModal');
    if (!modal) return;
    
    // Support both old 'folder' and new 'folders' format
    const currentFolders = shortcut.folders || (shortcut.folder !== undefined ? [shortcut.folder] : ['']);
    const primaryFolder = currentFolders[0] || '';
    
    modal.dataset.shortcutIndex = index;
    modal.dataset.moveType = 'shortcut';
    modal.dataset.currentFolder = primaryFolder;
    modal.classList.remove('hidden');
    
    // Afficher l'arborescence par défaut
    document.getElementById('moveFolderTree').classList.remove('hidden');
    document.getElementById('moveFolderList').classList.add('hidden');
    
    renderMoveTree(primaryFolder, (targetFolder) => moveShortcutToFolder(index, targetFolder));
}

// Construire l'arborescence des dossiers
function buildFolderTree() {
    const tree = { name: 'Racine', path: '', children: [], expanded: true };
    const nodeMap = { '': tree };
    
    // Trier les dossiers pour traiter les parents avant les enfants
    const sortedFolders = [...folders].sort((a, b) => a.localeCompare(b));
    
    sortedFolders.forEach(folderPath => {
        const parts = folderPath.split('/');
        const name = parts.pop();
        const parentPath = parts.join('/');
        
        const node = {
            name: name,
            path: folderPath,
            children: [],
            expanded: true
        };
        
        nodeMap[folderPath] = node;
        
        const parent = nodeMap[parentPath] || tree;
        parent.children.push(node);
    });
    
    return tree;
}

// Rendre l'arborescence des dossiers
function renderMoveTree(currentFolder, onSelect) {
    const treeContainer = document.getElementById('moveFolderTree');
    if (!treeContainer) return;
    
    treeContainer.innerHTML = '';
    const tree = buildFolderTree();
    
    function renderNode(node, depth = 0) {
        const div = document.createElement('div');
        div.className = 'tree-node';
        
        const isCurrent = node.path === currentFolder;
        const hasChildren = node.children.length > 0;
        
        const row = document.createElement('div');
        row.className = `tree-row${isCurrent ? ' current' : ''}`;
        row.style.paddingLeft = `${depth * 20 + 10}px`;
        
        // Icône expand/collapse
        const expandIcon = document.createElement('span');
        expandIcon.className = 'tree-expand';
        if (hasChildren) {
            expandIcon.textContent = node.expanded ? '▼' : '▶';
            expandIcon.onclick = (e) => {
                e.stopPropagation();
                node.expanded = !node.expanded;
                renderMoveTree(currentFolder, onSelect);
            };
        } else {
            expandIcon.textContent = ' ';
            expandIcon.style.opacity = '0';
        }
        
        // Icône dossier
        const folderIcon = document.createElement('span');
        folderIcon.className = 'tree-icon';
        folderIcon.textContent = node.path === '' ? '🏠' : '📁';
        
        // Nom
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-name';
        nameSpan.textContent = node.name;
        
        // Badge actuel
        if (isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'current-badge';
            badge.textContent = 'Actuel';
            nameSpan.appendChild(badge);
        }
        
        row.appendChild(expandIcon);
        row.appendChild(folderIcon);
        row.appendChild(nameSpan);
        
        // Click pour sélectionner
        row.onclick = () => {
            if (!isCurrent) {
                onSelect(node.path);
            }
        };
        
        div.appendChild(row);
        
        // Enfants
        if (hasChildren && node.expanded) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'tree-children';
            node.children.forEach(child => {
                childrenDiv.appendChild(renderNode(child, depth + 1));
            });
            div.appendChild(childrenDiv);
        }
        
        return div;
    }
    
    treeContainer.appendChild(renderNode(tree));
}

// Rendre la liste plate (vue alternative)
function renderMoveFlatList(currentFolder, onSelect) {
    const listContainer = document.getElementById('moveFolderList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // Option racine
    const rootItem = document.createElement('div');
    rootItem.className = `move-folder-item${currentFolder === '' ? ' current' : ''}`;
    rootItem.innerHTML = `
        <span class="move-folder-icon">🏠</span>
        <span class="move-folder-name">Racine</span>
        ${currentFolder === '' ? '<span class="current-badge">Actuel</span>' : ''}
    `;
    rootItem.addEventListener('click', () => onSelect(''));
    listContainer.appendChild(rootItem);
    
    // Tous les dossiers triés
    const sortedFolders = [...folders].sort((a, b) => a.localeCompare(b));
    sortedFolders.forEach(folder => {
        const item = document.createElement('div');
        item.className = `move-folder-item${currentFolder === folder ? ' current' : ''}`;
        
        const depth = folder.split('/').length - 1;
        const folderName = folder.split('/').pop();
        
        item.innerHTML = `
            <span class="move-folder-icon" style="margin-left: ${depth * 15}px">📁</span>
            <span class="move-folder-name">${folderName}</span>
            <span class="move-folder-path">${folder}</span>
            ${currentFolder === folder ? '<span class="current-badge">Actuel</span>' : ''}
        `;
        item.addEventListener('click', () => onSelect(folder));
        listContainer.appendChild(item);
    });
}

// Déplacer un raccourci vers un dossier
async function moveShortcutToFolder(index, targetFolder) {
    try {
        const shortcuts = await window.pywebview.api.getShortcuts();
        const shortcut = shortcuts[index];
        if (!shortcut) return;
        
        // Mettre à jour les dossiers (remplace tous les dossiers par le nouveau)
        shortcut.folders = [targetFolder];
        // Supprimer l'ancien format si présent
        delete shortcut.folder;
        await window.pywebview.api.updateShortcut(index, shortcut);
        
        // Fermer le modal
        document.getElementById('moveShortcutModal').classList.add('hidden');
        
        // Rafraîchir l'affichage
        await renderItems();
        
        // Notification
        showNotification(`"${shortcut.name}" déplacé vers ${targetFolder || 'Racine'}`);
    } catch (e) {
        console.error('Erreur lors du déplacement:', e);
    }
}

// Fermer le modal de déplacement
function closeMoveShortcutModal() {
    document.getElementById('moveShortcutModal').classList.add('hidden');
}

// Ouvrir le modal pour déplacer un dossier vers un autre dossier
function openMoveFolderModal(folderItem) {
    const modal = document.getElementById('moveShortcutModal');
    if (!modal) return;
    
    modal.dataset.folderPath = folderItem.fullPath;
    modal.dataset.moveType = 'folder';
    modal.classList.remove('hidden');
    
    // Déterminer le dossier parent actuel
    const parts = folderItem.fullPath.split('/');
    const currentParent = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    
    // Afficher l'arborescence par défaut
    document.getElementById('moveFolderTree').classList.remove('hidden');
    document.getElementById('moveFolderList').classList.add('hidden');
    
    // Filtrer les dossiers (exclure le dossier lui-même et ses enfants)
    const filteredFolders = folders.filter(f => 
        f !== folderItem.fullPath && !f.startsWith(folderItem.fullPath + '/')
    );
    
    renderMoveTreeForFolder(currentParent, filteredFolders, (targetFolder) => {
        moveFolderToFolder(folderItem.fullPath, targetFolder);
    });
}

// Rendre l'arborescence pour déplacer un dossier (avec dossiers filtrés)
function renderMoveTreeForFolder(currentParent, availableFolders, onSelect) {
    const treeContainer = document.getElementById('moveFolderTree');
    if (!treeContainer) return;
    
    // Construire l'arborescence avec les dossiers filtrés
    const tree = { name: 'Racine', path: '', children: [], expanded: true };
    const nodeMap = { '': tree };
    
    const sortedFolders = [...availableFolders].sort((a, b) => a.localeCompare(b));
    
    sortedFolders.forEach(folderPath => {
        const parts = folderPath.split('/');
        const name = parts.pop();
        const parentPath = parts.join('/');
        
        const node = {
            name: name,
            path: folderPath,
            children: [],
            expanded: true
        };
        
        nodeMap[folderPath] = node;
        
        const parent = nodeMap[parentPath] || tree;
        parent.children.push(node);
    });
    
    treeContainer.innerHTML = '';
    
    function renderNode(node, depth = 0) {
        const div = document.createElement('div');
        div.className = 'tree-node';
        
        const isCurrent = node.path === currentParent;
        const hasChildren = node.children.length > 0;
        
        const row = document.createElement('div');
        row.className = `tree-row${isCurrent ? ' current' : ''}`;
        row.style.paddingLeft = `${depth * 20 + 10}px`;
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'tree-expand';
        if (hasChildren) {
            expandIcon.textContent = node.expanded ? '▼' : '▶';
            expandIcon.onclick = (e) => {
                e.stopPropagation();
                node.expanded = !node.expanded;
                renderMoveTreeForFolder(currentParent, availableFolders, onSelect);
            };
        } else {
            expandIcon.textContent = ' ';
            expandIcon.style.opacity = '0';
        }
        
        const folderIcon = document.createElement('span');
        folderIcon.className = 'tree-icon';
        folderIcon.textContent = node.path === '' ? '🏠' : '📁';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-name';
        nameSpan.textContent = node.name;
        
        if (isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'current-badge';
            badge.textContent = 'Actuel';
            nameSpan.appendChild(badge);
        }
        
        row.appendChild(expandIcon);
        row.appendChild(folderIcon);
        row.appendChild(nameSpan);
        
        row.onclick = () => {
            if (!isCurrent) {
                onSelect(node.path);
            }
        };
        
        div.appendChild(row);
        
        if (hasChildren && node.expanded) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'tree-children';
            node.children.forEach(child => {
                childrenDiv.appendChild(renderNode(child, depth + 1));
            });
            div.appendChild(childrenDiv);
        }
        
        return div;
    }
    
    treeContainer.appendChild(renderNode(tree));
}

// Rendre la liste plate pour déplacer un dossier (avec dossiers filtrés)
function renderMoveFlatListForFolder(currentParent, availableFolders, onSelect) {
    const listContainer = document.getElementById('moveFolderList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // Option racine
    const rootItem = document.createElement('div');
    rootItem.className = `move-folder-item${currentParent === '' ? ' current' : ''}`;
    rootItem.innerHTML = `
        <span class="move-folder-icon">🏠</span>
        <span class="move-folder-name">Racine</span>
        ${currentParent === '' ? '<span class="current-badge">Actuel</span>' : ''}
    `;
    rootItem.addEventListener('click', () => onSelect(''));
    listContainer.appendChild(rootItem);
    
    // Dossiers disponibles triés
    const sortedFolders = [...availableFolders].sort((a, b) => a.localeCompare(b));
    sortedFolders.forEach(folder => {
        const item = document.createElement('div');
        item.className = `move-folder-item${currentParent === folder ? ' current' : ''}`;
        
        const depth = folder.split('/').length - 1;
        const folderName = folder.split('/').pop();
        
        item.innerHTML = `
            <span class="move-folder-icon" style="margin-left: ${depth * 15}px">📁</span>
            <span class="move-folder-name">${folderName}</span>
            <span class="move-folder-path">${folder}</span>
            ${currentParent === folder ? '<span class="current-badge">Actuel</span>' : ''}
        `;
        item.addEventListener('click', () => onSelect(folder));
        listContainer.appendChild(item);
    });
}

// Créer un nouveau dossier (à la racine par défaut)
async function createNewFolder(name) {
    if (!name || !name.trim()) return;
    
    let fullPath = name.trim();
    // Si on est dans un dossier, créer en sous-dossier
    if (currentFolder) {
        fullPath = currentFolder + '/' + fullPath;
    }
    
    if (!folders.includes(fullPath)) {
        folders.push(fullPath);
        folders.sort();
        updateFolderSelect();
        renderFolders();
        showNotification(`Dossier "${name}" créé`);
    } else {
        showNotification('Ce dossier existe déjà');
    }
}

// Déplacer un dossier vers un autre dossier (changer son chemin)
async function moveFolderToFolder(oldPath, newParent) {
    try {
        const folderName = oldPath.split('/').pop();
        const newPath = newParent ? `${newParent}/${folderName}` : folderName;
        
        // Vérifier si le nouveau chemin existe déjà
        if (folders.includes(newPath)) {
            showNotification('Un dossier avec ce nom existe déjà à cet emplacement');
            return;
        }
        
        // Mettre à jour tous les raccourcis qui sont dans ce dossier ou ses sous-dossiers
        const allShortcuts = await window.pywebview.api.getShortcuts();
        for (let i = 0; i < allShortcuts.length; i++) {
            const s = allShortcuts[i];
            // Support both old 'folder' and new 'folders' format
            let shortcutFolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
            let needsUpdate = false;
            
            shortcutFolders = shortcutFolders.map(folder => {
                if (folder === oldPath) {
                    needsUpdate = true;
                    return newPath;
                } else if (folder && folder.startsWith(oldPath + '/')) {
                    needsUpdate = true;
                    return newPath + folder.substring(oldPath.length);
                }
                return folder;
            });
            
            if (needsUpdate) {
                s.folders = shortcutFolders;
                delete s.folder;
                await window.pywebview.api.updateShortcut(i, s);
            }
        }
        
        // Mettre à jour l'ordre des dossiers
        const folderOrder = await window.pywebview.api.getFolderOrder();
        if (folderOrder[oldPath]) {
            folderOrder[newPath] = folderOrder[oldPath];
            delete folderOrder[oldPath];
        }
        // Mettre à jour les sous-dossiers dans l'ordre
        for (const key of Object.keys(folderOrder)) {
            if (key.startsWith(oldPath + '/')) {
                const newKey = newPath + key.substring(oldPath.length);
                folderOrder[newKey] = folderOrder[key];
                delete folderOrder[key];
            }
        }
        await window.pywebview.api.saveFolderOrder(folderOrder);
        
        // Fermer le modal
        document.getElementById('moveShortcutModal').classList.add('hidden');
        
        // Rafraîchir l'affichage
        await renderItems();
        
        // Notification
        showNotification(`"${folderName}" déplacé vers ${newParent || 'Racine'}`);
    } catch (e) {
        console.error('Erreur lors du déplacement du dossier:', e);
        showNotification('Erreur lors du déplacement');
    }
}

// Menu contextuel pour les tuiles du dashboard
function showTileContextMenu(e, tile, index, allShortcuts) {
    // Supprimer tout menu contextuel existant
    const oldMenu = document.querySelector('.context-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    
    if (tile.type === 'shortcut') {
        // Menu pour raccourci
        const shortcut = allShortcuts?.find(s => s.name === tile.shortcutName);
        const isUrl = shortcut ? isUrlPath(shortcut.path) : false;
        
        let menuHTML = '';
        
        if (isUrl) {
            menuHTML += `<div class="menu-item open-app">🪟 App</div>`;
            menuHTML += `<div class="menu-item open-browser">🌐 Navigateur</div>`;
            menuHTML += `<div class="menu-item copy-path">📋 Copier</div>`;
        } else {
            menuHTML += `<div class="menu-item open-item">▶️ Ouvrir</div>`;
            menuHTML += `<div class="menu-item copy-path">📋 Copier</div>`;
        }
        
        menuHTML += `
            <div class="menu-separator"></div>
            <div class="menu-item edit">✏️ Modifier</div>
            <div class="menu-item move">📁 Déplacer...</div>
            <div class="menu-separator"></div>
            <div class="menu-item delete-tile">❌ Retirer</div>
            <div class="menu-item delete danger">🗑️ Supprimer</div>
        `;
        
        menu.innerHTML = menuHTML;
        
        // Actions spécifiques URL
        if (isUrl && shortcut) {
            menu.querySelector('.open-app').onclick = async () => {
                menu.remove();
                await window.pywebview.api.openShortcut(shortcut.path, true, shortcut.name);
            };
            
            menu.querySelector('.open-browser').onclick = async () => {
                menu.remove();
                await window.pywebview.api.openShortcut(shortcut.path, false, shortcut.name);
            };
        } else if (shortcut) {
            menu.querySelector('.open-item').onclick = async () => {
                menu.remove();
                await window.pywebview.api.openShortcut(shortcut.path, null, shortcut.name);
            };
        }
        
        // Copier chemin/URL
        menu.querySelector('.copy-path').onclick = () => {
            if (shortcut) {
                navigator.clipboard.writeText(shortcut.path);
                showNotification('📋 Copié !');
            }
            menu.remove();
        };
        
        // Modifier
        menu.querySelector('.edit').onclick = () => {
            menu.remove();
            if (shortcut) {
                const globalIndex = allShortcuts.indexOf(shortcut);
                openEditForm(shortcut, globalIndex);
            }
        };
        
        // Déplacer
        menu.querySelector('.move').onclick = () => {
            menu.remove();
            if (shortcut) {
                const globalIndex = allShortcuts.indexOf(shortcut);
                openMoveShortcutModal(shortcut, globalIndex);
            }
        };
        
        // Supprimer le raccourci
        menu.querySelector('.delete').onclick = async () => {
            menu.remove();
            if (shortcut) {
                try {
                    const confirmed = await customConfirm('Voulez-vous vraiment supprimer ce raccourci ?');
                    if (confirmed) {
                        const globalIndex = allShortcuts.indexOf(shortcut);
                        await window.pywebview.api.deleteShortcut(globalIndex);
                        const layout = getCurrentDashboardLayout();
                        layout.tiles.splice(index, 1);
                        await saveAllDashboardLayouts();
                        await renderItems();
                    }
                } catch (err) {
                    console.error('Erreur suppression:', err);
                }
            }
        };
    } else {
        // Menu pour dossier - condensé
        menu.innerHTML = `
            <div class="menu-item open-folder">📂 Ouvrir</div>
            <div class="menu-separator"></div>
            <div class="menu-item edit-tile">⚙️ Configurer</div>
            <div class="menu-item move">📁 Déplacer...</div>
            <div class="menu-separator"></div>
            <div class="menu-item delete-tile">❌ Retirer</div>
            <div class="menu-item delete danger">🗑️ Supprimer</div>
        `;
        
        menu.querySelector('.open-folder').onclick = () => {
            menu.remove();
            navigateToFolder(tile.folderId);
        };
        
        menu.querySelector('.edit-tile').onclick = () => {
            menu.remove();
            openTileEditModal(index);
        };
        
        menu.querySelector('.move').onclick = () => {
            menu.remove();
            const item = {
                name: tile.folderId.split('/').pop(),
                fullPath: tile.folderId
            };
            openMoveFolderModal(item);
        };
        
        menu.querySelector('.delete').onclick = async () => {
            menu.remove();
            await deleteFolder(tile.folderId);
            const layout = getCurrentDashboardLayout();
            layout.tiles.splice(index, 1);
            await saveAllDashboardLayouts();
        };
    }
    
    // Action commune: retirer du dashboard
    menu.querySelector('.delete-tile').onclick = async () => {
        menu.remove();
        await deleteDashboardTile(index);
    };

    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    document.body.appendChild(menu);

    const closeMenuHandler = (ev) => {
        if (!document.body.contains(menu)) {
            document.removeEventListener('click', closeMenuHandler);
            return;
        }
        if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenuHandler);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenuHandler);
    }, 10);
}

// Menu contextuel pour les dossiers
function showFolderContextMenu(e, folderEl, item) {
    e.preventDefault();
    e.stopPropagation();
    
    // Supprimer tout menu contextuel existant
    const oldMenu = document.querySelector('.context-menu');
    if (oldMenu) oldMenu.remove();

    // Créer le nouveau menu - condensé avec emojis
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="menu-item rename">✏️ Renommer</div>
        <div class="menu-item move">📁 Déplacer...</div>
        <div class="menu-item change-icon">🖼️ Icône</div>
        <div class="menu-separator"></div>
        <div class="menu-item delete danger">🗑️ Supprimer</div>
    `;
    
    // Positionner le menu
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    document.body.appendChild(menu);

    // Gestionnaire de renommage
    menu.querySelector('.rename').onclick = async () => {
        const newName = await customPrompt('Nouveau nom du dossier:', item.name);
        if (newName && newName.trim() && newName !== item.name) {
            await renameFolderAndShortcuts(item.fullPath, newName.trim());
        }
        menu.remove();
    };

    // Gestionnaire de déplacement
    menu.querySelector('.move').onclick = () => {
        openMoveFolderModal(item);
        menu.remove();
    };

    // Gestionnaire de changement d'icône
    menu.querySelector('.change-icon').onclick = async () => {
        menu.remove();
        const result = await window.pywebview.api.pickIcon();
        console.log('pickIcon result:', result);
        if (result && result.iconPath) {
            // Sauvegarder l'icône du dossier
            await saveFolderIcon(item.fullPath, result.iconPath);
            console.log('Icône sauvegardée pour:', item.fullPath);
            await renderItems();
            showNotification('Icône du dossier mise à jour');
        }
    };

    // Gestionnaire de suppression
    menu.querySelector('.delete').onclick = async () => {
        menu.remove();
        await deleteFolder(item.fullPath);
    };

    // Fermer le menu au clic ailleurs
    const closeMenuHandler = (e) => {
        if (!document.body.contains(menu)) {
            document.removeEventListener('click', closeMenuHandler);
            return;
        }
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenuHandler);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenuHandler);
    }, 10);
}

// Formulaire d'édition - Modale propre
async function openEditForm(shortcut, index) {
    const modal = document.getElementById('editShortcutModal');
    const form = document.getElementById('editShortcutForm');
    
    // Remplir les champs
    document.getElementById('editName').value = shortcut.name;
    document.getElementById('editPath').value = shortcut.path;
    document.getElementById('editIconPath').value = shortcut.iconPath || shortcut.path;
    document.getElementById('editDescription').value = shortcut.description || '';
    
    // Remplir les checkboxes des dossiers (support ancien et nouveau format)
    const selectedFolders = shortcut.folders || (shortcut.folder ? [shortcut.folder] : ['']);
    updateFolderCheckboxes('editFolderCheckboxes', selectedFolders);
    
    // Charger l'icône de prévisualisation
    const iconPath = shortcut.iconPath || shortcut.path;
    const iconData = await window.pywebview.api.getIconForPath(iconPath);
    document.getElementById('editPreviewIcon').src = iconData;
    document.getElementById('editPreviewName').textContent = shortcut.name;
    
    // Afficher les options URL si c'est un lien web
    const urlOptionsGroup = document.getElementById('editUrlOptionsGroup');
    const automationGroup = document.getElementById('editAutomationGroup');
    if (isUrlPath(shortcut.path)) {
        urlOptionsGroup.classList.remove('hidden');
        automationGroup.classList.remove('hidden');
        const behavior = shortcut.openInApp === true ? 'app' : 
                        shortcut.openInApp === false ? 'browser' : 'default';
        document.querySelector(`input[name="editUrlBehavior"][value="${behavior}"]`).checked = true;
        
        // Charger les actions d'automatisation existantes
        loadAutomationActions(shortcut.automationActions || []);
    } else {
        urlOptionsGroup.classList.add('hidden');
        automationGroup.classList.add('hidden');
    }
    
    // Stocker l'index pour la sauvegarde
    form.dataset.editIndex = index;
    
    // Afficher la modale
    modal.classList.remove('hidden');
    
    // Focus sur le nom
    setTimeout(() => document.getElementById('editName').focus(), 100);
}

// Gestionnaires pour la modale d'édition
document.getElementById('cancelEditShortcut')?.addEventListener('click', () => {
    document.getElementById('editShortcutModal').classList.add('hidden');
});

document.getElementById('editShortcutModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editShortcutModal') {
        document.getElementById('editShortcutModal').classList.add('hidden');
    }
});

document.getElementById('editShortcutForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const index = parseInt(form.dataset.editIndex);
    
    const name = document.getElementById('editName').value.trim();
    const path = document.getElementById('editPath').value.trim();
    const iconPath = document.getElementById('editIconPath').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    const selectedFolders = getSelectedFolders('editFolderCheckboxes');
    
    // Déterminer le comportement URL
    let openInApp = null;
    let automationActions = [];
    if (isUrlPath(path)) {
        const behavior = document.querySelector('input[name="editUrlBehavior"]:checked')?.value;
        if (behavior === 'app') openInApp = true;
        else if (behavior === 'browser') openInApp = false;
        
        // Récupérer les actions d'automatisation
        automationActions = gatherAutomationActions();
    }
    
    const shortcut = {
        name,
        path,
        iconPath: iconPath || path,
        description,
        folders: selectedFolders,
        type: isUrlPath(path) ? 'url' : 'file',
        openInApp,
        automationActions
    };
    
    await window.pywebview.api.updateShortcut(index, shortcut);
    document.getElementById('editShortcutModal').classList.add('hidden');
    showNotification('✅ Raccourci modifié !');
    await loadFolders();
    await renderItems();
});

// Parcourir fichier dans modale d'édition
document.getElementById('editBrowseFile')?.addEventListener('click', async () => {
    const result = await window.pywebview.api.browseFile();
    if (result) {
        document.getElementById('editPath').value = result;
        const iconData = await window.pywebview.api.getIconForPath(result);
        document.getElementById('editPreviewIcon').src = iconData;
        
        // Mettre à jour les options URL
        const urlOptions = document.getElementById('editUrlOptionsGroup');
        const automationGroup = document.getElementById('editAutomationGroup');
        if (isUrlPath(result)) {
            urlOptions.classList.remove('hidden');
            automationGroup.classList.remove('hidden');
        } else {
            urlOptions.classList.add('hidden');
            automationGroup.classList.add('hidden');
        }
    }
});

document.getElementById('editBrowseIcon')?.addEventListener('click', async () => {
    const result = await window.pywebview.api.browseIcon();
    if (result) {
        document.getElementById('editIconPath').value = result;
        const iconData = await window.pywebview.api.getIconForPath(result);
        document.getElementById('editPreviewIcon').src = iconData;
    }
});

// Mise à jour de l'aperçu en temps réel
document.getElementById('editName')?.addEventListener('input', (e) => {
    document.getElementById('editPreviewName').textContent = e.target.value;
});

// Shortcuts rendering
// Unified render function for folders and shortcuts
async function renderItems() {
    try {
        const allShortcuts = await window.pywebview.api.getShortcuts();
        const homeScreen = document.getElementById('homeScreen');
        const layout = getCurrentDashboardLayout();
        
        // Cas spécial : dossier "Récemment ouvert"
        if (currentFolder === RECENT_FOLDER) {
            // Recharger l'historique
            try {
                recentHistory = await window.pywebview.api.getRecentHistory() || [];
            } catch (e) {
                recentHistory = [];
            }
            
            // Si le mode dashboard est activé, afficher le dashboard
            if (layout.enabled) {
                itemsContainer.classList.add('hidden');
                homeScreen.classList.remove('hidden');
                await renderRecentDashboard(allShortcuts);
                return;
            }
            
            // Sinon afficher la vue grille
            homeScreen.classList.add('hidden');
            itemsContainer.classList.remove('hidden');
            await renderRecentGridView(allShortcuts);
            return;
        }
        
        // Si le mode dashboard est activé pour ce dossier
        if (layout.enabled) {
            itemsContainer.classList.add('hidden');
            homeScreen.classList.remove('hidden');
            await renderDashboard(allShortcuts, currentFolder);
            return;
        }
        
        // Sinon afficher la vue grille normale
        homeScreen.classList.add('hidden');
        itemsContainer.classList.remove('hidden');
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
        
        // Filter shortcuts by current folder (support both old 'folder' and new 'folders' format)
        const shortcuts = allShortcuts.filter(s => {
            const shortcutFolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
            return shortcutFolders.includes(currentFolder);
        });
        
        // Build items array (folders + shortcuts)
        let items = [];
        
        // Add folders
        subfolders.forEach(folder => {
            const displayName = folder.split('/').pop();
            // Count shortcuts in this folder (support both formats)
            const count = allShortcuts.filter(s => {
                const sfolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
                return sfolders.some(f => f === folder || f.startsWith(folder + '/'));
            }).length;
            const folderIcon = getFolderIcon(folder);
            items.push({
                type: 'folder',
                name: displayName,
                fullPath: folder,
                count,
                iconPath: folderIcon
            });
        });
        
        // Add shortcuts
        shortcuts.forEach((shortcut, idx) => {
            const globalIndex = allShortcuts.indexOf(shortcut);
            items.push({
                type: 'shortcut',
                data: shortcut,
                index: globalIndex,
                name: shortcut.name,
                path: shortcut.path,
                lastOpened: shortcut.lastOpened || 0
            });
        });
        
        // Apply sorting
        await sortItems(items);
        
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
            // Sort by saved order for current folder
            const savedOrder = folderOrdersCache[currentFolder] || [];
            items.sort((a, b) => {
                const aKey = getItemKey(a);
                const bKey = getItemKey(b);
                const aIdx = savedOrder.indexOf(aKey);
                const bIdx = savedOrder.indexOf(bKey);
                // Items not in saved order go to the end
                const aOrder = aIdx === -1 ? 999999 : aIdx;
                const bOrder = bIdx === -1 ? 999999 : bIdx;
                return aOrder - bOrder;
            });
            break;
    }
}

// Generate a unique key for an item
function getItemKey(item) {
    if (item.type === 'folder') {
        return `folder:${item.fullPath}`;
    } else {
        return `shortcut:${item.path}`;
    }
}

function createFolderElement(item, position) {
    const folderEl = document.createElement('div');
    folderEl.className = 'shortcut folder-item-card';
    folderEl.dataset.position = position;
    folderEl.dataset.type = 'folder';
    folderEl.dataset.fullPath = item.fullPath;
    folderEl.dataset.itemKey = getItemKey(item);
    folderEl.draggable = isReorderMode;
    
    // Position badge in reorder mode
    const positionBadge = isReorderMode ? `<div class="position-badge">${position + 1}</div>` : '';
    
    // Utiliser l'icône personnalisée si disponible
    let folderIcon = '📁';
    if (item.iconPath) {
        // Si c'est un chemin de fichier, récupérer l'icône
        folderIcon = `<img src="${item.iconPath}" class="folder-custom-icon" onerror="this.style.display='none'; this.parentElement.innerHTML='📁';">`;
    }
    
    folderEl.innerHTML = `
        ${positionBadge}
        <div class="folder-icon">${folderIcon}</div>
        <div class="shortcut-info">
            <div class="shortcut-name">${item.name}</div>
            <div class="shortcut-description">${item.count} élément${item.count > 1 ? 's' : ''}</div>
        </div>
    `;
    
    folderEl.onclick = (e) => {
        // Don't navigate if in reorder mode or dragging
        if (isDragging || isReorderMode) {
            e.preventDefault();
            return;
        }
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
    // Add robust identification data
    shortcutEl.dataset.path = shortcut.path;
    shortcutEl.dataset.name = shortcut.name;
    shortcutEl.dataset.itemKey = getItemKey(item);
    shortcutEl.draggable = isReorderMode;
    
    // Determine shortcut type for styling
    const shortcutType = getShortcutType(shortcut);
    shortcutEl.dataset.shortcutType = shortcutType;
    
    shortcutEl.onclick = async (e) => {
        // Don't open if in reorder mode or dragging
        if (isDragging || isReorderMode) {
            e.preventDefault();
            return;
        }
        if (e.button === 0) {
            // Open shortcut with URL handling
            const openInApp = shortcut.openInApp !== false;
            await window.pywebview.api.openShortcut(shortcut.path, openInApp, shortcut.name);
            // Update lastOpened
            updateLastOpened(item.index);
        }
    };
    shortcutEl.oncontextmenu = (e) => showContextMenu(e, shortcutEl, shortcut, item.index);
    
    // Position badge in reorder mode
    if (isReorderMode) {
        const badge = document.createElement('div');
        badge.className = 'position-badge';
        badge.textContent = position + 1;
        shortcutEl.appendChild(badge);
    }
    
    // Type badge for URLs
    if (shortcutType === 'url') {
        const typeBadge = document.createElement('div');
        typeBadge.className = 'shortcut-type-badge url';
        typeBadge.textContent = '🌐';
        typeBadge.title = 'Lien web';
        shortcutEl.appendChild(typeBadge);
    }
    
    // Container for icon with fallback support
    const iconContainer = document.createElement('div');
    iconContainer.className = 'shortcut-icon-container';
    iconContainer.style.cssText = 'display: flex; align-items: center; justify-content: center;';
    
    const img = document.createElement('img');
    img.alt = shortcut.name;
    img.src = `/icon/${item.index}`;
    
    // Determine fallback emoji based on shortcut type
    const isUrl = shortcutType === 'url' || shortcut.path?.startsWith('http');
    const fallbackEmoji = isUrl ? '🌐' : '🎮';
    
    // Use robust fallback handler
    img.onerror = () => {
        img.style.display = 'none';
        iconContainer.innerHTML = `<span style="font-size: 32px;">${fallbackEmoji}</span>`;
    };
    img.onload = () => {
        // Check if image is valid (not too small)
        if (img.naturalWidth < 5 || img.naturalHeight < 5) {
            img.style.display = 'none';
            iconContainer.innerHTML = `<span style="font-size: 32px;">${fallbackEmoji}</span>`;
        }
    };
    
    iconContainer.appendChild(img);
    
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
    
    shortcutEl.appendChild(iconContainer);
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
const stylePanel = document.getElementById('stylePanelModal');
const toggleStyleBtn = document.getElementById('toggleStyleBtn');
const presetTheme = document.getElementById('presetTheme');
const bannerColor = document.getElementById('bannerColor');
const primaryColor = document.getElementById('primaryColor');
const backgroundPageColor = document.getElementById('backgroundPageColor');
const cardsColor = document.getElementById('cardsColor');
const accentColor = document.getElementById('accentColor');
const buttonColor = document.getElementById('buttonColor');
const textColor = document.getElementById('textColor');
const inputColor = document.getElementById('inputColor');
const borderRadius = document.getElementById('borderRadius');
const shadowSize = document.getElementById('shadowSize');
const iconSizeInput = document.getElementById('iconSize');
const saveThemeBtn = document.getElementById('saveTheme');
const themeNameInput = document.getElementById('themeName');
const savedThemesContainer = document.getElementById('savedThemes');

// New controls
const globalFont = document.getElementById('globalFont');
const titleFont = document.getElementById('titleFont');
const titleColor = document.getElementById('titleColor');
const bodyFont = document.getElementById('bodyFont');
const descFont = document.getElementById('descFont');
const descColor = document.getElementById('descColor');
const buttonFont = document.getElementById('buttonFont');
const buttonTextColor = document.getElementById('buttonTextColor');
const borderStyle = document.getElementById('borderStyle');
const borderWidth = document.getElementById('borderWidth');
const borderColor = document.getElementById('borderColor');
const borderOpacity = document.getElementById('borderOpacity');

// Opacity inputs
const bannerOpacity = document.getElementById('bannerOpacity');
const primaryOpacity = document.getElementById('primaryOpacity');
const backgroundPageOpacity = document.getElementById('backgroundPageOpacity');
const cardsOpacity = document.getElementById('cardsOpacity');
const buttonOpacity = document.getElementById('buttonOpacity');
const accentOpacity = document.getElementById('accentOpacity');
const inputOpacity = document.getElementById('inputOpacity');

// Application settings controls
const appNameInput = document.getElementById('appName');
const appIconPreview = document.getElementById('appIconPreview');
const pickAppIconBtn = document.getElementById('pickAppIcon');
const resetAppIconBtn = document.getElementById('resetAppIcon');
const windowWidthInput = document.getElementById('windowWidth');
const windowHeightInput = document.getElementById('windowHeight');
const windowMinWidthInput = document.getElementById('windowMinWidth');
const windowMinHeightInput = document.getElementById('windowMinHeight');
const zoomLevelInput = document.getElementById('zoomLevel');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');

// Gradient modal elements
const gradientModal = document.getElementById('gradientModal');
const gradientPreview = document.getElementById('gradientPreview');
const gradientType = document.getElementById('gradientType');
const gradientAngle = document.getElementById('gradientAngle');
const anglePicker = document.getElementById('anglePicker');
const anglePickerHandle = document.getElementById('anglePickerHandle');
const gradientAngleSection = document.getElementById('gradientAngleSection');
const gradientColorsList = document.getElementById('gradientColorsList');
const addColorStopBtn = document.getElementById('addColorStop');

// Gradient state
let currentGradientTarget = null;
let gradients = {};
let currentColorStops = []; // Array of {color, opacity, position}

// Style tabs handling
document.querySelectorAll('.style-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active from all tabs and contents
        document.querySelectorAll('.style-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.style-tab-content').forEach(c => c.classList.remove('active'));
        
        // Activate clicked tab and corresponding content
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.querySelector(`.style-tab-content[data-tab="${tabName}"]`).classList.add('active');
    });
});

// Predefined themes with all new properties
const presetThemes = {
    default: {
        bannerColor: '#2c3e50',
        primaryColor: '#f5f6fa',
        backgroundPageColor: '#e8eaf0',
        cardsColor: '#ffffff',
        accentColor: '#3498db',
        buttonColor: '#3498db',
        textColor: '#333333',
        inputColor: '#ffffff',
        borderRadius: 4,
        shadowSize: 4,
        iconSize: 64,
        // New properties
        globalFont: "'Segoe UI', Arial, sans-serif",
        titleFont: 'inherit',
        titleColor: '#333333',
        bodyFont: 'inherit',
        descFont: 'inherit',
        descColor: '#333333',
        buttonFont: 'inherit',
        buttonTextColor: '#ffffff',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#000000',
        borderColorOpacity: 10,
        gradients: {}
    },
    modern: {
        bannerColor: '#1a237e',
        primaryColor: '#fafafa',
        backgroundPageColor: '#eeeeee',
        cardsColor: '#ffffff',
        accentColor: '#00bcd4',
        buttonColor: '#00bcd4',
        textColor: '#212121',
        inputColor: '#ffffff',
        borderRadius: 8,
        shadowSize: 8,
        iconSize: 80,
        globalFont: "'Roboto', sans-serif",
        titleFont: "'Montserrat', sans-serif",
        titleColor: '#1a237e',
        bodyFont: 'inherit',
        descFont: 'inherit',
        descColor: '#666666',
        buttonFont: "'Roboto', sans-serif",
        buttonTextColor: '#ffffff',
        borderStyle: 'none',
        borderWidth: 0,
        borderColor: '#000000',
        borderColorOpacity: 0,
        gradients: {}
    },
    soft: {
        bannerColor: '#5d4037',
        primaryColor: '#efebe9',
        backgroundPageColor: '#d7ccc8',
        cardsColor: '#fafafa',
        accentColor: '#8d6e63',
        buttonColor: '#a1887f',
        textColor: '#3e2723',
        inputColor: '#ffffff',
        borderRadius: 16,
        shadowSize: 12,
        iconSize: 72,
        globalFont: "'Open Sans', sans-serif",
        titleFont: 'Georgia, serif',
        titleColor: '#5d4037',
        bodyFont: 'inherit',
        descFont: 'inherit',
        descColor: '#6d4c41',
        buttonFont: 'inherit',
        buttonTextColor: '#ffffff',
        borderStyle: 'solid',
        borderWidth: 2,
        borderColor: '#8d6e63',
        borderColorOpacity: 30,
        gradients: {}
    },
    sharp: {
        bannerColor: '#212121',
        primaryColor: '#ffffff',
        backgroundPageColor: '#f5f5f5',
        cardsColor: '#ffffff',
        accentColor: '#f44336',
        buttonColor: '#f44336',
        textColor: '#000000',
        inputColor: '#ffffff',
        borderRadius: 0,
        shadowSize: 2,
        iconSize: 56,
        globalFont: "Arial, sans-serif",
        titleFont: 'inherit',
        titleColor: '#000000',
        bodyFont: 'inherit',
        descFont: 'inherit',
        descColor: '#444444',
        buttonFont: 'inherit',
        buttonTextColor: '#ffffff',
        borderStyle: 'solid',
        borderWidth: 2,
        borderColor: '#212121',
        borderColorOpacity: 100,
        gradients: {}
    },
    dark: {
        bannerColor: '#263238',
        primaryColor: '#37474f',
        backgroundPageColor: '#263238',
        cardsColor: '#455a64',
        accentColor: '#4caf50',
        buttonColor: '#66bb6a',
        textColor: '#ffffff',
        inputColor: '#546e7a',
        borderRadius: 6,
        shadowSize: 10,
        iconSize: 64,
        globalFont: "'Segoe UI', Arial, sans-serif",
        titleFont: 'inherit',
        titleColor: '#ffffff',
        bodyFont: 'inherit',
        descFont: 'inherit',
        descColor: '#b0bec5',
        buttonFont: 'inherit',
        buttonTextColor: '#ffffff',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#ffffff',
        borderColorOpacity: 20,
        gradients: {}
    }
};

// Helper: convert hex + opacity to rgba
function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

// Helper: build gradient CSS (supports both old format and new colorStops format)
// Returns the gradient string or empty string if not enabled (for CSS fallback)
function buildGradientCSS(gradientConfig, fallbackColor = null) {
    if (!gradientConfig || !gradientConfig.enabled) {
        // Return empty string so CSS var() fallback works
        return '';
    }
    
    // New format with colorStops
    if (gradientConfig.colorStops && gradientConfig.colorStops.length >= 2) {
        const sortedStops = [...gradientConfig.colorStops].sort((a, b) => a.position - b.position);
        const stopsStr = sortedStops.map(stop => {
            const rgba = hexToRgba(stop.color, stop.opacity);
            return `${rgba} ${stop.position}%`;
        }).join(', ');
        
        const type = gradientConfig.type || 'linear';
        const angle = gradientConfig.angle || 90;
        
        if (type === 'radial') {
            return `radial-gradient(circle, ${stopsStr})`;
        } else if (type === 'conic') {
            return `conic-gradient(from ${angle}deg, ${stopsStr})`;
        }
        return `linear-gradient(${angle}deg, ${stopsStr})`;
    }
    
    // Old format fallback
    const { type, direction, color1, opacity1, color2, opacity2 } = gradientConfig;
    const rgba1 = hexToRgba(color1 || '#3498db', opacity1 || 100);
    const rgba2 = hexToRgba(color2 || '#9b59b6', opacity2 || 100);
    
    if (type === 'radial') {
        return `radial-gradient(circle, ${rgba1}, ${rgba2})`;
    }
    return `linear-gradient(${direction || 'to right'}, ${rgba1}, ${rgba2})`;
}

// Load current theme values into inputs
function loadCurrentTheme() {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    bannerColor.value = rgbToHex(computedStyle.getPropertyValue('--banner-color').trim()) || '#2c3e50';
    primaryColor.value = rgbToHex(computedStyle.getPropertyValue('--primary-color').trim()) || '#f5f6fa';
    backgroundPageColor.value = rgbToHex(computedStyle.getPropertyValue('--background-page-color').trim()) || '#e8eaf0';
    cardsColor.value = rgbToHex(computedStyle.getPropertyValue('--cards-color').trim()) || '#ffffff';
    accentColor.value = rgbToHex(computedStyle.getPropertyValue('--accent-color').trim()) || '#3498db';
    buttonColor.value = rgbToHex(computedStyle.getPropertyValue('--button-color').trim()) || '#3498db';
    textColor.value = rgbToHex(computedStyle.getPropertyValue('--text-color').trim()) || '#333333';
    inputColor.value = rgbToHex(computedStyle.getPropertyValue('--input-color').trim()) || '#ffffff';
    cardsColor.value = computedStyle.getPropertyValue('--cards-color').trim();
    accentColor.value = computedStyle.getPropertyValue('--accent-color').trim();
    buttonColor.value = computedStyle.getPropertyValue('--button-color').trim();
    textColor.value = computedStyle.getPropertyValue('--text-color').trim();
    inputColor.value = rgbToHex(computedStyle.getPropertyValue('--input-color').trim()) || '#ffffff';
    borderRadius.value = parseInt(computedStyle.getPropertyValue('--border-radius')) || 4;
    shadowSize.value = parseInt(computedStyle.getPropertyValue('--shadow-size')) || 10;
    iconSizeInput.value = parseInt(computedStyle.getPropertyValue('--icon-size')) || 64;
    
    // Update slider value displays
    updateSliderDisplay('borderRadius', 'borderRadiusVal');
    updateSliderDisplay('shadowSize', 'shadowSizeVal');
    updateSliderDisplay('iconSize', 'iconSizeVal');
    
    // Set default opacity values
    bannerOpacity.value = 100;
    primaryOpacity.value = 100;
    backgroundPageOpacity.value = 100;
    cardsOpacity.value = 100;
    buttonOpacity.value = 100;
    accentOpacity.value = 100;
    inputOpacity.value = 100;
    
    // Set default typography values
    if (titleColor) titleColor.value = textColor.value;
    if (descColor) descColor.value = textColor.value;
    if (buttonTextColor) buttonTextColor.value = '#ffffff';
    if (borderColor) borderColor.value = '#000000';
    if (borderOpacity) borderOpacity.value = 10;
    if (borderWidth) borderWidth.value = 1;
    
    // Update border slider displays
    updateSliderDisplay('borderWidth', 'borderWidthVal');
    updateSliderDisplay('borderOpacity', 'borderOpacityVal');
}

// Helper to update slider display value
function updateSliderDisplay(sliderId, displayId) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (slider && display) {
        display.textContent = slider.value;
    }
}

// Helper: rgb to hex
function rgbToHex(rgb) {
    if (!rgb) return null;
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (match) {
        return '#' + [match[1], match[2], match[3]].map(x => {
            const hex = parseInt(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
    return rgb;
}

// Gather all theme values from inputs
function gatherThemeFromInputs() {
    return {
        bannerColor: bannerColor.value,
        primaryColor: primaryColor.value,
        backgroundPageColor: backgroundPageColor.value,
        cardsColor: cardsColor.value,
        accentColor: accentColor.value,
        buttonColor: buttonColor.value,
        textColor: textColor.value,
        inputColor: inputColor.value,
        borderRadius: parseInt(borderRadius.value) || 4,
        shadowSize: parseInt(shadowSize.value) || 10,
        iconSize: parseInt(iconSizeInput.value) || 64,
        showGridIcons: document.getElementById('showGridIcons')?.checked ?? true,
        showTypeBadge: document.getElementById('showTypeBadge')?.checked ?? true,
        showDashboardIcons: document.getElementById('showDashboardIcons')?.checked ?? true,
        // Opacity
        bannerOpacity: parseInt(bannerOpacity?.value) || 100,
        primaryOpacity: parseInt(primaryOpacity?.value) || 100,
        backgroundPageOpacity: parseInt(backgroundPageOpacity?.value) || 100,
        cardsOpacity: parseInt(cardsOpacity?.value) || 100,
        buttonOpacity: parseInt(buttonOpacity?.value) || 100,
        accentOpacity: parseInt(accentOpacity?.value) || 100,
        inputOpacity: parseInt(inputOpacity?.value) || 100,
        // Typography
        globalFont: globalFont?.value || "'Segoe UI', Arial, sans-serif",
        titleFont: titleFont?.value || 'inherit',
        titleColor: titleColor?.value || textColor.value,
        bodyFont: bodyFont?.value || 'inherit',
        descFont: descFont?.value || 'inherit',
        descColor: descColor?.value || textColor.value,
        buttonFont: buttonFont?.value || 'inherit',
        buttonTextColor: buttonTextColor?.value || '#ffffff',
        // Border
        borderStyle: borderStyle?.value || 'solid',
        borderWidth: parseInt(borderWidth?.value) || 1,
        borderColor: borderColor?.value || '#000000',
        borderColorOpacity: parseInt(borderOpacity?.value) || 10,
        // Gradients
        gradients: gradients,
        // Application settings
        appName: appNameInput?.value || '',
        appIcon: appIconPreview?.dataset?.iconData || '',
        appIconPath: appIconPreview?.dataset?.iconPath || '',
        windowWidth: parseInt(windowWidthInput?.value) || 1000,
        windowHeight: parseInt(windowHeightInput?.value) || 800,
        windowMinWidth: parseInt(windowMinWidthInput?.value) || 0,
        windowMinHeight: parseInt(windowMinHeightInput?.value) || 0,
        zoomLevel: parseInt(zoomLevelInput?.value) || 100,
        startFullscreen: document.getElementById('startFullscreen')?.checked || false,
        startScreen: parseInt(document.getElementById('startScreen')?.value) || 0,
        // URL Window settings (per theme)
        themeUrlWindowFullscreen: document.getElementById('themeUrlWindowFullscreen')?.checked || false,
        themeUrlWindowWidth: parseInt(document.getElementById('themeUrlWindowWidth')?.value) || 1200,
        themeUrlWindowHeight: parseInt(document.getElementById('themeUrlWindowHeight')?.value) || 800,
        themeUrlWindowScreen: document.getElementById('themeUrlWindowScreen')?.value || 'primary',
        // Banner configuration
        bannerConfig: bannerConfig,
        // Tile defaults
        tileDefaults: {
            showName: document.getElementById('defaultShowName')?.checked ?? true,
            showCount: document.getElementById('defaultShowCount')?.checked ?? false,
            showBorder: document.getElementById('defaultShowBorder')?.checked ?? false
        },
        // Tile editor options visibility
        tileOptionsVisibility: {
            showName: document.getElementById('optionShowName')?.checked ?? true,
            showCount: document.getElementById('optionShowCount')?.checked ?? true,
            textCustomization: document.getElementById('optionTextCustomization')?.checked ?? true,
            border: document.getElementById('optionBorder')?.checked ?? true,
            background: document.getElementById('optionBackground')?.checked ?? true,
            color: document.getElementById('optionColor')?.checked ?? true,
            iconSize: document.getElementById('optionIconSize')?.checked ?? true,
            borderRadius: document.getElementById('optionBorderRadius')?.checked ?? true
        }
    };
}

// Apply theme in real-time
function applyThemeRealtime() {
    const theme = gatherThemeFromInputs();
    applyTheme(theme);
}

// Add real-time listeners for all inputs
const allThemeInputs = [
    bannerColor, primaryColor, backgroundPageColor, cardsColor, accentColor, buttonColor,
    textColor, inputColor, borderRadius, shadowSize, iconSizeInput,
    bannerOpacity, primaryOpacity, backgroundPageOpacity, cardsOpacity, buttonOpacity, accentOpacity, inputOpacity,
    globalFont, titleFont, titleColor, bodyFont, descFont, descColor, buttonFont, buttonTextColor,
    borderStyle, borderWidth, borderColor, borderOpacity
];

allThemeInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', applyThemeRealtime);
        input.addEventListener('change', applyThemeRealtime);
    }
});

// Listener for showGridIcons checkbox
const showGridIconsCb = document.getElementById('showGridIcons');
if (showGridIconsCb) {
    showGridIconsCb.addEventListener('change', applyThemeRealtime);
}

// Listener for showTypeBadge checkbox
const showTypeBadgeCb = document.getElementById('showTypeBadge');
if (showTypeBadgeCb) {
    showTypeBadgeCb.addEventListener('change', applyThemeRealtime);
}

// Listener for showDashboardIcons checkbox
const showDashboardIconsCb = document.getElementById('showDashboardIcons');
if (showDashboardIconsCb) {
    showDashboardIconsCb.addEventListener('change', applyThemeRealtime);
}

// Listeners pour mettre à jour tileOptionsVisibility en temps réel
const tileOptionsMapping = {
    'optionShowName': 'showName',
    'optionShowCount': 'showCount',
    'optionTextCustomization': 'textCustomization',
    'optionBorder': 'border',
    'optionBackground': 'background',
    'optionColor': 'color',
    'optionIconSize': 'iconSize',
    'optionBorderRadius': 'borderRadius'
};

Object.entries(tileOptionsMapping).forEach(([checkboxId, key]) => {
    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
        checkbox.addEventListener('change', () => {
            tileOptionsVisibility[key] = checkbox.checked;
        });
    }
});

// Setup slider value displays for theme settings
function setupThemeSliderDisplays() {
    const sliderDisplayPairs = [
        ['borderWidth', 'borderWidthVal'],
        ['borderOpacity', 'borderOpacityVal'],
        ['borderRadius', 'borderRadiusVal'],
        ['shadowSize', 'shadowSizeVal'],
        ['iconSize', 'iconSizeVal']
    ];
    
    sliderDisplayPairs.forEach(([sliderId, displayId]) => {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        if (slider && display) {
            // Initial value
            display.textContent = slider.value;
            // Update on input
            slider.addEventListener('input', () => {
                display.textContent = slider.value;
            });
        }
    });
}

// Initialize theme slider displays
setupThemeSliderDisplays();

// Color mode toggle (Uni / Dégradé)
document.querySelectorAll('.color-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const mode = btn.dataset.mode;
        
        // Update toggle button states
        document.querySelectorAll(`.color-mode-btn[data-target="${target}"]`).forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        
        // Show/hide corresponding inputs
        const solidInputs = document.querySelector(`.color-solid-inputs[data-target="${target}"]`);
        const gradientInputs = document.querySelector(`.color-gradient-inputs[data-target="${target}"]`);
        
        if (mode === 'solid') {
            solidInputs?.classList.remove('hidden');
            gradientInputs?.classList.add('hidden');
            // Disable gradient
            if (gradients[target]) {
                gradients[target].enabled = false;
            }
        } else {
            solidInputs?.classList.add('hidden');
            gradientInputs?.classList.remove('hidden');
            // Enable gradient (create default if needed)
            if (!gradients[target]) {
                const colorInput = document.getElementById(target + 'Color');
                gradients[target] = {
                    enabled: true,
                    type: 'linear',
                    angle: 90,
                    colorStops: [
                        { color: colorInput?.value || '#3498db', opacity: 100, position: 0 },
                        { color: '#9b59b6', opacity: 100, position: 100 }
                    ]
                };
            } else {
                gradients[target].enabled = true;
            }
            updateGradientMiniPreview(target);
        }
        
        applyThemeRealtime();
    });
});

// Gradient config buttons
document.querySelectorAll('.btn-gradient-config').forEach(btn => {
    btn.addEventListener('click', () => {
        currentGradientTarget = btn.dataset.target;
        openGradientModal(currentGradientTarget);
    });
});

// ============================================
// GRADIENT MODAL - Multi-color with positions and angle picker
// ============================================

function updateGradientMiniPreview(target) {
    const preview = document.querySelector(`.gradient-mini-preview[data-target="${target}"]`);
    if (preview && gradients[target]) {
        const css = buildGradientCSS(gradients[target]);
        preview.style.background = css ? css : 'linear-gradient(90deg, #ff6b6b, #4ecdc4)';
    }
}

function openGradientModal(target) {
    currentGradientTarget = target;
    gradientModal.classList.remove('hidden');
    
    // Load existing gradient if any
    const existing = gradients[target];
    if (existing && existing.colorStops) {
        gradientType.value = existing.type || 'linear';
        gradientAngle.value = existing.angle || 90;
        currentColorStops = [...existing.colorStops];
    } else {
        // Default values based on current color
        const colorInput = document.getElementById(target + 'Color');
        currentColorStops = [
            { color: colorInput?.value || '#3498db', opacity: 100, position: 0 },
            { color: '#9b59b6', opacity: 100, position: 100 }
        ];
        gradientAngle.value = 90;
        gradientType.value = 'linear';
    }
    
    updateAngleHandle(parseInt(gradientAngle.value));
    updateAngleSectionVisibility();
    renderColorStops();
    updateGradientPreview();
}

// Render color stops list
function renderColorStops() {
    gradientColorsList.innerHTML = '';
    
    currentColorStops.forEach((stop, index) => {
        const stopEl = document.createElement('div');
        stopEl.className = 'gradient-color-stop';
        stopEl.innerHTML = `
            <input type="color" value="${stop.color}" data-index="${index}" class="color-stop-color">
            <div class="color-stop-labels">
                <span>Position</span>
                <span>Opacité</span>
            </div>
            <input type="number" value="${stop.position}" min="0" max="100" class="position-input" data-index="${index}" title="Position %">
            <input type="number" value="${stop.opacity}" min="0" max="100" class="opacity-input" data-index="${index}" title="Opacité %">
            ${currentColorStops.length > 2 ? `<button type="button" class="btn-remove-color" data-index="${index}">✕</button>` : ''}
        `;
        gradientColorsList.appendChild(stopEl);
    });
    
    // Add event listeners
    gradientColorsList.querySelectorAll('.color-stop-color').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            currentColorStops[idx].color = e.target.value;
            updateGradientPreview();
        });
    });
    
    gradientColorsList.querySelectorAll('.position-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            currentColorStops[idx].position = parseInt(e.target.value) || 0;
            updateGradientPreview();
        });
    });
    
    gradientColorsList.querySelectorAll('.opacity-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            currentColorStops[idx].opacity = parseInt(e.target.value) || 100;
            updateGradientPreview();
        });
    });
    
    gradientColorsList.querySelectorAll('.btn-remove-color').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            currentColorStops.splice(idx, 1);
            renderColorStops();
            updateGradientPreview();
        });
    });
}

// Add new color stop
addColorStopBtn?.addEventListener('click', () => {
    // Find a good position for new color (middle of largest gap)
    const sortedStops = [...currentColorStops].sort((a, b) => a.position - b.position);
    let maxGap = 0;
    let newPosition = 50;
    
    for (let i = 0; i < sortedStops.length - 1; i++) {
        const gap = sortedStops[i + 1].position - sortedStops[i].position;
        if (gap > maxGap) {
            maxGap = gap;
            newPosition = sortedStops[i].position + gap / 2;
        }
    }
    
    currentColorStops.push({
        color: '#888888',
        opacity: 100,
        position: Math.round(newPosition)
    });
    
    renderColorStops();
    updateGradientPreview();
});

// Angle picker functionality
function updateAngleHandle(angle) {
    if (anglePickerHandle) {
        anglePickerHandle.style.transform = `rotate(${angle}deg) translateX(30px) translateY(-50%)`;
    }
}

function updateAngleSectionVisibility() {
    if (gradientAngleSection) {
        if (gradientType.value === 'radial') {
            gradientAngleSection.classList.add('hidden');
        } else {
            gradientAngleSection.classList.remove('hidden');
        }
    }
}

// Angle picker drag functionality
let isDraggingAngle = false;

anglePicker?.addEventListener('mousedown', (e) => {
    isDraggingAngle = true;
    updateAngleFromEvent(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingAngle) {
        updateAngleFromEvent(e);
    }
});

document.addEventListener('mouseup', () => {
    isDraggingAngle = false;
});

function updateAngleFromEvent(e) {
    if (!anglePicker) return;
    
    const rect = anglePicker.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    
    let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    angle = Math.round(angle) % 360;
    
    gradientAngle.value = angle;
    updateAngleHandle(angle);
    updateGradientPreview();
}

gradientAngle?.addEventListener('input', () => {
    const angle = parseInt(gradientAngle.value) || 0;
    updateAngleHandle(angle);
    updateGradientPreview();
});

gradientType?.addEventListener('change', () => {
    updateAngleSectionVisibility();
    updateGradientPreview();
});

function updateGradientPreview() {
    const css = buildGradientCSSFromStops();
    if (gradientPreview) {
        gradientPreview.style.background = css;
    }
}

function buildGradientCSSFromStops() {
    if (currentColorStops.length < 2) return 'transparent';
    
    // Sort by position
    const sortedStops = [...currentColorStops].sort((a, b) => a.position - b.position);
    
    // Build color stops string
    const stopsStr = sortedStops.map(stop => {
        const rgba = hexToRgba(stop.color, stop.opacity);
        return `${rgba} ${stop.position}%`;
    }).join(', ');
    
    const type = gradientType?.value || 'linear';
    const angle = parseInt(gradientAngle?.value) || 90;
    
    if (type === 'radial') {
        return `radial-gradient(circle, ${stopsStr})`;
    } else if (type === 'conic') {
        return `conic-gradient(from ${angle}deg, ${stopsStr})`;
    }
    return `linear-gradient(${angle}deg, ${stopsStr})`;
}

document.getElementById('applyGradient')?.addEventListener('click', () => {
    gradients[currentGradientTarget] = {
        enabled: true,
        type: gradientType.value,
        angle: parseInt(gradientAngle.value) || 90,
        colorStops: [...currentColorStops]
    };
    
    // Update mini preview
    updateGradientMiniPreview(currentGradientTarget);
    
    gradientModal.classList.add('hidden');
    applyThemeRealtime();
});

document.getElementById('removeGradient')?.addEventListener('click', () => {
    // Switch back to solid mode
    const target = currentGradientTarget;
    document.querySelectorAll(`.color-mode-btn[data-target="${target}"]`).forEach(b => {
        b.classList.toggle('active', b.dataset.mode === 'solid');
    });
    const solidInputs = document.querySelector(`.color-solid-inputs[data-target="${target}"]`);
    const gradientInputs = document.querySelector(`.color-gradient-inputs[data-target="${target}"]`);
    solidInputs?.classList.remove('hidden');
    gradientInputs?.classList.add('hidden');
    
    if (gradients[target]) {
        gradients[target].enabled = false;
    }
    
    gradientModal.classList.add('hidden');
    applyThemeRealtime();
});

document.getElementById('cancelGradient')?.addEventListener('click', () => {
    gradientModal.classList.add('hidden');
});

// ============================================
// BANNER CUSTOMIZATION
// ============================================

// Default banner buttons configuration
const defaultBannerButtons = [
    { id: 'toggleFormBtn', label: '➕ Ajouter un raccourci', visible: true, position: 'left', type: 'system' },
    { id: 'toggleViewBtn', label: '📋 Mode Liste/Grille', visible: true, position: 'left', type: 'system' },
    { id: 'toggleReorderBtn', label: '↕️ Réorganiser', visible: true, position: 'left', type: 'system' },
    { id: 'sortBtn', label: '🔤 Trier', visible: true, position: 'left', type: 'system' },
    { id: 'toggleSettingsBtn', label: '⚙️ Paramètres', visible: true, position: 'right', type: 'system' },
    { id: 'toggleStyleBtn', label: '🎨 Personnaliser', visible: true, position: 'right', type: 'system' }
];

let bannerConfig = {
    buttons: [...defaultBannerButtons],
    customButtons: [], // Custom buttons (shortcuts, themes, folders)
    layout: 'split', // split, left, right, center
    showTitle: true
};

// Tile defaults (from theme)
let tileDefaults = {
    showName: true,
    showCount: false,
    showBorder: false
};

// Tile options visibility (from theme)
let tileOptionsVisibility = {
    showName: true,
    showCount: true,
    textCustomization: true,
    border: true,
    background: true,
    color: true,
    iconSize: true,
    borderRadius: true
};

// Load banner buttons list into the config panel
function loadBannerButtonsList() {
    const container = document.getElementById('bannerButtonsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Only show system buttons in the main list
    const systemButtons = bannerConfig.buttons.filter(b => b.type === 'system' || !b.type);
    
    systemButtons.forEach((btn, index) => {
        const realIndex = bannerConfig.buttons.indexOf(btn);
        const item = document.createElement('div');
        item.className = 'banner-button-item';
        item.draggable = true;
        item.dataset.index = realIndex;
        item.innerHTML = `
            <span class="drag-handle">⠿</span>
            <input type="checkbox" ${btn.visible ? 'checked' : ''} data-id="${btn.id}">
            <span class="button-label">${btn.label}</span>
            <span class="button-position">${btn.position === 'left' ? '◀ Gauche' : 'Droite ▶'}</span>
        `;
        
        // Toggle visibility
        item.querySelector('input').addEventListener('change', (e) => {
            const btnId = e.target.dataset.id;
            const btnConfig = bannerConfig.buttons.find(b => b.id === btnId);
            if (btnConfig) {
                btnConfig.visible = e.target.checked;
                applyBannerConfig();
            }
        });
        
        // Toggle position on click
        item.querySelector('.button-position').addEventListener('click', () => {
            bannerConfig.buttons[realIndex].position = bannerConfig.buttons[realIndex].position === 'left' ? 'right' : 'left';
            loadBannerButtonsList();
            applyBannerConfig();
        });
        
        // Drag events
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.setData('text/plain', realIndex);
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
        
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = container.querySelector('.dragging');
            if (dragging && dragging !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(dragging, item);
                } else {
                    container.insertBefore(dragging, item.nextSibling);
                }
            }
        });
        
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            // Reorder the config based on DOM order
            const newOrder = [];
            container.querySelectorAll('.banner-button-item').forEach(el => {
                const idx = parseInt(el.dataset.index);
                newOrder.push(bannerConfig.buttons[idx]);
            });
            // Keep custom buttons at the end
            const customButtons = bannerConfig.buttons.filter(b => b.type === 'custom');
            bannerConfig.buttons = [...newOrder, ...customButtons];
            loadBannerButtonsList();
            applyBannerConfig();
        });
        
        container.appendChild(item);
    });
    
    // Load custom buttons list
    loadCustomBannerButtonsList();
    
    // Load layout radio
    const layoutRadio = document.querySelector(`input[name="bannerLayout"][value="${bannerConfig.layout}"]`);
    if (layoutRadio) layoutRadio.checked = true;
    
    // Load show title checkbox
    const showTitleCheckbox = document.getElementById('showAppTitle');
    if (showTitleCheckbox) showTitleCheckbox.checked = bannerConfig.showTitle;
}

// Load custom banner buttons list
function loadCustomBannerButtonsList() {
    const container = document.getElementById('customBannerButtonsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    const customButtons = bannerConfig.customButtons || [];
    
    if (customButtons.length === 0) {
        container.innerHTML = '<p class="hint-text" style="opacity: 0.5; margin: 10px 0;">Aucun bouton personnalisé</p>';
        return;
    }
    
    customButtons.forEach((btn, index) => {
        const item = document.createElement('div');
        item.className = 'banner-button-item';
        item.innerHTML = `
            <span class="button-icon">${btn.icon || '🔘'}</span>
            <input type="checkbox" ${btn.visible ? 'checked' : ''} data-index="${index}">
            <span class="button-label">${btn.label}</span>
            <span class="button-type">${getCustomButtonTypeLabel(btn.actionType)}</span>
            <span class="button-position">${btn.position === 'left' ? '◀' : '▶'}</span>
            <button type="button" class="btn-delete-custom" data-index="${index}" title="Supprimer">🗑️</button>
        `;
        
        // Toggle visibility
        item.querySelector('input').addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            bannerConfig.customButtons[idx].visible = e.target.checked;
            applyBannerConfig();
        });
        
        // Toggle position on click
        item.querySelector('.button-position').addEventListener('click', () => {
            bannerConfig.customButtons[index].position = bannerConfig.customButtons[index].position === 'left' ? 'right' : 'left';
            loadCustomBannerButtonsList();
            applyBannerConfig();
        });
        
        // Delete button
        item.querySelector('.btn-delete-custom').addEventListener('click', () => {
            bannerConfig.customButtons.splice(index, 1);
            loadCustomBannerButtonsList();
            applyBannerConfig();
        });
        
        container.appendChild(item);
    });
}

function getCustomButtonTypeLabel(type) {
    switch (type) {
        case 'shortcut': return '🎮';
        case 'theme': return '🎨';
        case 'folder': return '📁';
        default: return '🔘';
    }
}

// Apply banner configuration to the actual header
// Store references to original header buttons
const headerButtonsCache = {};

function cacheHeaderButtons() {
    defaultBannerButtons.forEach(btn => {
        const element = document.getElementById(btn.id);
        if (element) {
            headerButtonsCache[btn.id] = element;
        }
    });
    // Also cache the sort dropdown
    const sortDropdown = document.querySelector('.sort-dropdown');
    if (sortDropdown) {
        headerButtonsCache['sortDropdown'] = sortDropdown;
    }
}

function applyBannerConfig() {
    const headerControls = document.querySelector('.header-controls');
    const leftControls = document.querySelector('.left-controls');
    const rightControls = document.querySelector('.right-controls');
    const appTitle = document.querySelector('header h1');
    
    if (!headerControls || !leftControls || !rightControls) return;
    
    // Cache buttons on first call
    if (Object.keys(headerButtonsCache).length === 0) {
        cacheHeaderButtons();
    }
    
    // Clear current buttons
    leftControls.innerHTML = '';
    rightControls.innerHTML = '';
    
    // Remove any existing custom buttons from DOM
    document.querySelectorAll('.custom-banner-btn').forEach(el => el.remove());
    
    // Add system buttons based on config
    bannerConfig.buttons.forEach(btn => {
        if (!btn.visible) return;
        
        // Use cached element reference
        const element = headerButtonsCache[btn.id];
        if (!element) return;
        
        // Special case for sort button - need to include dropdown
        if (btn.id === 'sortBtn' && headerButtonsCache['sortDropdown']) {
            const container = btn.position === 'left' ? leftControls : rightControls;
            container.appendChild(headerButtonsCache['sortDropdown']);
        } else {
            const container = btn.position === 'left' ? leftControls : rightControls;
            container.appendChild(element);
        }
    });
    
    // Add custom buttons
    (bannerConfig.customButtons || []).forEach((btn, index) => {
        if (!btn.visible) return;
        
        const customBtn = document.createElement('button');
        customBtn.className = 'btn custom-banner-btn';
        customBtn.dataset.customIndex = index;
        customBtn.innerHTML = `${btn.icon || ''} ${btn.label}`.trim();
        customBtn.title = btn.label;
        
        // Add click handler based on action type
        customBtn.addEventListener('click', () => executeCustomBannerAction(btn));
        
        const container = btn.position === 'left' ? leftControls : rightControls;
        container.appendChild(customBtn);
    });
    
    // Apply layout
    headerControls.classList.remove('layout-left', 'layout-right', 'layout-center');
    if (bannerConfig.layout !== 'split') {
        headerControls.classList.add(`layout-${bannerConfig.layout}`);
    }
    
    // Show/hide title
    if (appTitle) {
        appTitle.classList.toggle('hidden', !bannerConfig.showTitle);
    }
}

// Execute custom banner button action
async function executeCustomBannerAction(btn) {
    try {
        switch (btn.actionType) {
            case 'shortcut':
                // Find and launch the shortcut
                const shortcuts = await window.pywebview.api.getShortcuts();
                const shortcut = shortcuts.find(s => s.name === btn.actionValue || s.path === btn.actionValue);
                if (shortcut) {
                    await window.pywebview.api.openShortcut(shortcut.path, shortcut.openInApp !== false, shortcut.name);
                }
                break;
                
            case 'theme':
                // Apply the theme
                const savedThemes = await window.pywebview.api.getSavedThemes() || {};
                const theme = savedThemes[btn.actionValue];
                if (theme) {
                    applyTheme(theme);
                    setThemeInputs(theme);
                    await window.pywebview.api.saveTheme(theme);
                }
                break;
                
            case 'folder':
                // Navigate to folder
                navigateToFolder(btn.actionValue);
                break;
        }
    } catch (err) {
        console.error('Error executing custom banner action:', err);
    }
}

// Event listeners for banner config
document.querySelectorAll('input[name="bannerLayout"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        bannerConfig.layout = e.target.value;
        applyBannerConfig();
    });
});

document.getElementById('showAppTitle')?.addEventListener('change', (e) => {
    bannerConfig.showTitle = e.target.checked;
    applyBannerConfig();
});

// Custom banner button modal
document.getElementById('addCustomBannerBtn')?.addEventListener('click', openAddBannerButtonModal);
document.getElementById('cancelAddBannerButton')?.addEventListener('click', () => {
    document.getElementById('addBannerButtonModal').classList.add('hidden');
});
document.getElementById('confirmAddBannerButton')?.addEventListener('click', addCustomBannerButton);
document.getElementById('bannerButtonType')?.addEventListener('change', updateBannerButtonTypeUI);

async function openAddBannerButtonModal() {
    const modal = document.getElementById('addBannerButtonModal');
    if (!modal) return;
    
    // Load shortcuts
    const shortcutSelect = document.getElementById('bannerButtonShortcut');
    if (shortcutSelect) {
        shortcutSelect.innerHTML = '';
        const shortcuts = await window.pywebview.api.getShortcuts();
        shortcuts.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            shortcutSelect.appendChild(opt);
        });
    }
    
    // Load themes
    const themeSelect = document.getElementById('bannerButtonTheme');
    if (themeSelect) {
        themeSelect.innerHTML = '';
        const savedThemes = await window.pywebview.api.getSavedThemes() || {};
        Object.keys(savedThemes).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            themeSelect.appendChild(opt);
        });
    }
    
    // Load folders
    const folderSelect = document.getElementById('bannerButtonFolder');
    if (folderSelect) {
        folderSelect.innerHTML = '<option value="">Accueil (Racine)</option>';
        folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            folderSelect.appendChild(opt);
        });
    }
    
    // Reset form
    document.getElementById('bannerButtonLabel').value = '';
    document.getElementById('bannerButtonIcon').value = '';
    document.getElementById('bannerButtonType').value = 'shortcut';
    updateBannerButtonTypeUI();
    
    modal.classList.remove('hidden');
}

function updateBannerButtonTypeUI() {
    const type = document.getElementById('bannerButtonType').value;
    
    document.getElementById('bannerButtonShortcutSection').classList.toggle('hidden', type !== 'shortcut');
    document.getElementById('bannerButtonThemeSection').classList.toggle('hidden', type !== 'theme');
    document.getElementById('bannerButtonFolderSection').classList.toggle('hidden', type !== 'folder');
    
    // Auto-fill icon based on type
    const iconInput = document.getElementById('bannerButtonIcon');
    if (iconInput && !iconInput.value) {
        switch (type) {
            case 'shortcut': iconInput.value = '🎮'; break;
            case 'theme': iconInput.value = '🎨'; break;
            case 'folder': iconInput.value = '📁'; break;
        }
    }
}

function addCustomBannerButton() {
    const type = document.getElementById('bannerButtonType').value;
    const label = document.getElementById('bannerButtonLabel').value.trim();
    const icon = document.getElementById('bannerButtonIcon').value.trim();
    const position = document.getElementById('bannerButtonPosition').value;
    
    let actionValue = '';
    switch (type) {
        case 'shortcut':
            actionValue = document.getElementById('bannerButtonShortcut').value;
            break;
        case 'theme':
            actionValue = document.getElementById('bannerButtonTheme').value;
            break;
        case 'folder':
            actionValue = document.getElementById('bannerButtonFolder').value;
            break;
    }
    
    if (!label) {
        alert('Veuillez entrer un label pour le bouton');
        return;
    }
    
    // Initialize customButtons if needed
    if (!bannerConfig.customButtons) {
        bannerConfig.customButtons = [];
    }
    
    bannerConfig.customButtons.push({
        id: `custom_${Date.now()}`,
        label: label,
        icon: icon || '',
        visible: true,
        position: position,
        actionType: type,
        actionValue: actionValue
    });
    
    // Close modal and refresh
    document.getElementById('addBannerButtonModal').classList.add('hidden');
    loadBannerButtonsList();
    applyBannerConfig();
}

// Toggle style modal
toggleStyleBtn.addEventListener('click', () => {
    stylePanel.classList.remove('hidden');
    settingsPanel.classList.add('hidden');
    loadCurrentTheme();
    loadBannerButtonsList();
});

document.getElementById('closeStyle').addEventListener('click', () => {
    stylePanel.classList.add('hidden');
});

// Close style modal on overlay click
stylePanel.addEventListener('click', (e) => {
    if (e.target === stylePanel) {
        stylePanel.classList.add('hidden');
    }
});

// Global handler for all modal close buttons (×)
document.querySelectorAll('.modal-close-btn[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.dataset.closeModal;
        const modal = document.getElementById(modalId);
        if (modal) {
            // Pour customModal, déclencher le bouton Annuler si défini
            if (modalId === 'customModal') {
                const cancelBtn = document.getElementById('modalCancel');
                if (cancelBtn && cancelBtn.onclick) {
                    cancelBtn.click();
                    return;
                }
            }
            modal.classList.add('hidden');
        }
    });
});

// Toggle settings modal
const settingsPanel = document.getElementById('settingsPanelModal');
document.getElementById('toggleSettingsBtn').addEventListener('click', async () => {
    settingsPanel.classList.remove('hidden');
    stylePanel.classList.add('hidden');
    await loadSettingsPanel();
});

document.getElementById('closeSettings').addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
});

// Close settings modal on overlay click
settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) {
        settingsPanel.classList.add('hidden');
    }
});

// DevTools button for debug mode
document.getElementById('openDevToolsBtn')?.addEventListener('click', () => {
    if (window.pywebview && window.pywebview.api.openDevTools) {
        window.pywebview.api.openDevTools();
    } else {
        showNotification('DevTools non disponible');
    }
});

// F12 keyboard shortcut for DevTools when debug mode is enabled
document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' && appSettings.debugMode) {
        e.preventDefault();
        if (window.pywebview && window.pywebview.api.openDevTools) {
            window.pywebview.api.openDevTools();
        }
    }
});

// ============================================
// SETTINGS MANAGEMENT
// ============================================

let appSettings = {};

async function loadSettingsPanel() {
    try {
        appSettings = await window.pywebview.api.getSettings();
        
        // Populate settings inputs
        const openUrlsInApp = document.getElementById('openUrlsInApp');
        const urlWindowWidth = document.getElementById('urlWindowWidth');
        const urlWindowHeight = document.getElementById('urlWindowHeight');
        const confirmBeforeDelete = document.getElementById('confirmBeforeDelete');
        const showDescriptions = document.getElementById('showDescriptions');
        const animationsEnabled = document.getElementById('animationsEnabled');
        const maxRecentItems = document.getElementById('maxRecentItems');
        
        if (openUrlsInApp) openUrlsInApp.checked = appSettings.openUrlsInApp !== false;
        if (urlWindowWidth) urlWindowWidth.value = appSettings.urlWindowWidth || 1200;
        if (urlWindowHeight) urlWindowHeight.value = appSettings.urlWindowHeight || 800;
        if (confirmBeforeDelete) confirmBeforeDelete.checked = appSettings.confirmBeforeDelete !== false;
        if (showDescriptions) showDescriptions.checked = appSettings.showDescriptions !== false;
        if (animationsEnabled) animationsEnabled.checked = appSettings.animationsEnabled !== false;
        if (maxRecentItems) maxRecentItems.value = appSettings.maxRecentItems || 10;
        
        // Debug mode
        const debugMode = document.getElementById('debugMode');
        const openDevToolsBtn = document.getElementById('openDevToolsBtn');
        if (debugMode) {
            debugMode.checked = appSettings.debugMode === true;
            if (openDevToolsBtn) {
                openDevToolsBtn.style.display = debugMode.checked ? 'block' : 'none';
            }
            debugMode.addEventListener('change', () => {
                if (openDevToolsBtn) {
                    openDevToolsBtn.style.display = debugMode.checked ? 'block' : 'none';
                }
            });
        }
        
        // URL Window advanced settings
        const urlWindowFullscreen = document.getElementById('urlWindowFullscreen');
        const forceUrlWindowSettings = document.getElementById('forceUrlWindowSettings');
        const urlWindowScreen = document.getElementById('urlWindowScreen');
        
        if (urlWindowFullscreen) urlWindowFullscreen.checked = appSettings.urlWindowFullscreen === true;
        if (forceUrlWindowSettings) forceUrlWindowSettings.checked = appSettings.forceUrlWindowSettings === true;
        if (urlWindowScreen) urlWindowScreen.value = appSettings.urlWindowScreen || 'primary';
        
        // Toggle URL window settings visibility
        updateUrlSettingsVisibility();
        
        // Add listener for toggle
        if (openUrlsInApp) {
            openUrlsInApp.addEventListener('change', updateUrlSettingsVisibility);
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function updateUrlSettingsVisibility() {
    const openUrlsInApp = document.getElementById('openUrlsInApp');
    const urlWindowSettings = document.getElementById('urlWindowSettings');
    const urlWindowFullscreen = document.getElementById('urlWindowFullscreen');
    const urlWindowSizeSettings = document.getElementById('urlWindowSizeSettings');
    
    if (urlWindowSettings && openUrlsInApp) {
        urlWindowSettings.style.display = openUrlsInApp.checked ? 'block' : 'none';
    }
    
    // Hide size settings when fullscreen is enabled
    if (urlWindowSizeSettings && urlWindowFullscreen) {
        urlWindowSizeSettings.style.opacity = urlWindowFullscreen.checked ? '0.5' : '1';
        urlWindowSizeSettings.style.pointerEvents = urlWindowFullscreen.checked ? 'none' : 'auto';
    }
}

// Add listener for URL window fullscreen toggle in settings
document.getElementById('urlWindowFullscreen')?.addEventListener('change', updateUrlSettingsVisibility);

// Save settings button
document.getElementById('saveSettings')?.addEventListener('click', async () => {
    try {
        const settings = {
            openUrlsInApp: document.getElementById('openUrlsInApp')?.checked ?? true,
            urlWindowWidth: parseInt(document.getElementById('urlWindowWidth')?.value) || 1200,
            urlWindowHeight: parseInt(document.getElementById('urlWindowHeight')?.value) || 800,
            urlWindowFullscreen: document.getElementById('urlWindowFullscreen')?.checked ?? false,
            forceUrlWindowSettings: document.getElementById('forceUrlWindowSettings')?.checked ?? false,
            urlWindowScreen: document.getElementById('urlWindowScreen')?.value || 'primary',
            confirmBeforeDelete: document.getElementById('confirmBeforeDelete')?.checked ?? true,
            showDescriptions: document.getElementById('showDescriptions')?.checked ?? true,
            animationsEnabled: document.getElementById('animationsEnabled')?.checked ?? true,
            maxRecentItems: parseInt(document.getElementById('maxRecentItems')?.value) || 10,
            debugMode: document.getElementById('debugMode')?.checked ?? false
        };
        
        await window.pywebview.api.saveSettings(settings);
        appSettings = settings;
        
        // Apply animations setting immediately
        document.body.classList.toggle('no-animations', !settings.animationsEnabled);
        
        showNotification('Paramètres enregistrés');
        settingsPanel.classList.add('hidden');
    } catch (e) {
        console.error('Error saving settings:', e);
        showNotification('Erreur lors de l\'enregistrement');
    }
});

// Helper function to check if path is URL
function isUrl(path) {
    if (!path) return false;
    return /^(https?:\/\/|ftp:\/\/|file:\/\/)|^www\.|^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(path);
}

// Get shortcut type
function getShortcutType(shortcut) {
    if (shortcut.type) return shortcut.type;
    const path = shortcut.path || '';
    if (isUrlPath(path)) return 'url';
    return 'file';
}

// ============================================
// APPLICATION SETTINGS EVENT HANDLERS
// ============================================

// Fullscreen toggle - hide/show window size options
const startFullscreenCheckbox = document.getElementById('startFullscreen');
const windowSizeSection = document.getElementById('windowSizeSection');

if (startFullscreenCheckbox) {
    startFullscreenCheckbox.addEventListener('change', () => {
        if (windowSizeSection) {
            // Masquer la taille de fenêtre en plein écran (mais pas la taille min)
            windowSizeSection.style.opacity = startFullscreenCheckbox.checked ? '0.5' : '1';
            windowSizeSection.style.pointerEvents = startFullscreenCheckbox.checked ? 'none' : 'auto';
        }
    });
}

// URL Window fullscreen toggle - hide/show URL window size options
const themeUrlWindowFullscreenCheckbox = document.getElementById('themeUrlWindowFullscreen');
const themeUrlWindowSizeSection = document.getElementById('themeUrlWindowSizeSection');

if (themeUrlWindowFullscreenCheckbox) {
    themeUrlWindowFullscreenCheckbox.addEventListener('change', () => {
        if (themeUrlWindowSizeSection) {
            themeUrlWindowSizeSection.style.opacity = themeUrlWindowFullscreenCheckbox.checked ? '0.5' : '1';
            themeUrlWindowSizeSection.style.pointerEvents = themeUrlWindowFullscreenCheckbox.checked ? 'none' : 'auto';
        }
    });
}

// Zoom controls
if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
        const current = parseInt(zoomLevelInput.value) || 100;
        const newZoom = Math.min(200, current + 10);
        zoomLevelInput.value = newZoom;
        applyZoom(newZoom);
    });
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
        const current = parseInt(zoomLevelInput.value) || 100;
        const newZoom = Math.max(50, current - 10);
        zoomLevelInput.value = newZoom;
        applyZoom(newZoom);
    });
}

if (zoomLevelInput) {
    zoomLevelInput.addEventListener('change', () => {
        let zoom = parseInt(zoomLevelInput.value) || 100;
        zoom = Math.max(50, Math.min(200, zoom));
        zoomLevelInput.value = zoom;
        applyZoom(zoom);
    });
}

// Apply zoom to the interface
function applyZoom(zoomPercent) {
    document.body.style.zoom = zoomPercent / 100;
    // Also save to localStorage for immediate persistence
    localStorage.setItem('appZoomLevel', zoomPercent);
}

// Pick app icon
if (pickAppIconBtn) {
    pickAppIconBtn.addEventListener('click', async () => {
        const result = await window.pywebview.api.pickIcon();
        if (result && result.preview) {
            appIconPreview.src = result.preview;
            // Stocker le base64 pour pouvoir le sauvegarder et le réafficher
            appIconPreview.dataset.iconData = result.preview;
            // Stocker aussi le chemin pour pywebview
            appIconPreview.dataset.iconPath = result.iconPath;
            showNotification('Icône sélectionnée - sera appliquée au prochain démarrage');
        }
    });
}

// Reset app icon
if (resetAppIconBtn) {
    resetAppIconBtn.addEventListener('click', () => {
        appIconPreview.src = '';
        appIconPreview.dataset.iconData = '';
        appIconPreview.dataset.iconPath = '';
        showNotification('Icône réinitialisée');
    });
}

// Apply theme from inputs
const applyStyleBtn = document.getElementById('applyStyle');
if (applyStyleBtn) {
    applyStyleBtn.addEventListener('click', async () => {
        const theme = gatherThemeFromInputs();
        console.log('Applying theme, showGridIcons:', theme.showGridIcons);
        applyTheme(theme);
        await window.pywebview.api.saveTheme(theme);
        showNotification('Thème appliqué !');
    });
} else {
    console.error('applyStyle button not found!');
}

// Load preset theme and apply immediately
presetTheme.addEventListener('change', () => {
    const theme = presetThemes[presetTheme.value];
    if (theme) {
        // Update inputs and apply immediately
        applyTheme(theme);
        setThemeInputs(theme);
    }
});

// Save custom theme
if (saveThemeBtn) {
    saveThemeBtn.addEventListener('click', async () => {
        const name = themeNameInput.value.trim();
        if (!name) {
            console.log('Nom de thème vide, sauvegarde annulée');
            return;
        }
        
        console.log('Sauvegarde du thème:', name);
        const theme = gatherThemeFromInputs();
        theme.name = name;
        
        try {
            await window.pywebview.api.saveCustomTheme(theme);
            console.log('Thème sauvegardé avec succès');
            themeNameInput.value = '';
            await loadSavedThemes();
        } catch (err) {
            console.error('Erreur lors de la sauvegarde du thème:', err);
        }
    });
} else {
    console.error('saveThemeBtn non trouvé dans le DOM');
}

// Apply theme function
function applyTheme(theme) {
    const root = document.documentElement;
    
    // Basic colors
    root.style.setProperty('--banner-color', theme.bannerColor);
    root.style.setProperty('--primary-color', theme.primaryColor);
    root.style.setProperty('--background-page-color', theme.backgroundPageColor);
    root.style.setProperty('--cards-color', theme.cardsColor);
    root.style.setProperty('--accent-color', theme.accentColor);
    root.style.setProperty('--button-color', theme.buttonColor);
    root.style.setProperty('--text-color', theme.textColor);
    root.style.setProperty('--input-color', theme.inputColor);
    root.style.setProperty('--border-radius', `${theme.borderRadius || 4}px`);
    root.style.setProperty('--icon-size', `${theme.iconSize || 64}px`);
    const gridIconDisplay = theme.showGridIcons === false ? 'none' : 'flex';
    root.style.setProperty('--grid-icon-display', gridIconDisplay);
    root.style.setProperty('--type-badge-display', theme.showTypeBadge === false ? 'none' : 'block');
    root.style.setProperty('--dashboard-icon-display', theme.showDashboardIcons === false ? 'none' : 'block');
    console.log('showGridIcons:', theme.showGridIcons, '-> display:', gridIconDisplay);
    
    const shadowValue = `0 ${(theme.shadowSize || 10)/2}px ${theme.shadowSize || 10}px rgba(0,0,0,0.1)`;
    root.style.setProperty('--shadow', shadowValue);
    root.style.setProperty('--shadow-size', theme.shadowSize || 10);
    
    // Typography
    root.style.setProperty('--global-font', theme.globalFont || "'Segoe UI', Arial, sans-serif");
    root.style.setProperty('--title-font', theme.titleFont || 'inherit');
    root.style.setProperty('--title-color', theme.titleColor || theme.textColor);
    root.style.setProperty('--body-font', theme.bodyFont || 'inherit');
    root.style.setProperty('--desc-font', theme.descFont || 'inherit');
    root.style.setProperty('--desc-color', theme.descColor || theme.textColor);
    root.style.setProperty('--button-font', theme.buttonFont || 'inherit');
    root.style.setProperty('--button-text-color', theme.buttonTextColor || '#ffffff');
    
    // Border
    root.style.setProperty('--border-style', theme.borderStyle || 'solid');
    root.style.setProperty('--border-width', `${theme.borderWidth || 1}px`);
    const borderColorRgba = hexToRgba(theme.borderColor || '#000000', theme.borderColorOpacity || 10);
    root.style.setProperty('--border-color', borderColorRgba);
    
    // Gradients - Calculate final backgrounds (gradient or solid color)
    const themeGradients = theme.gradients || {};
    
    // Helper: get background value (gradient if enabled, otherwise solid color with opacity)
    const getBackground = (gradientConfig, solidColor, opacity) => {
        const gradient = buildGradientCSS(gradientConfig);
        if (gradient) {
            return gradient;
        }
        // Return solid color with opacity
        return hexToRgba(solidColor, opacity || 100);
    };
    
    // Apply background values directly (not separate gradient vars)
    root.style.setProperty('--banner-bg', getBackground(themeGradients.banner, theme.bannerColor, theme.bannerOpacity));
    root.style.setProperty('--primary-bg', getBackground(themeGradients.primary, theme.primaryColor, theme.primaryOpacity));
    root.style.setProperty('--background-page-bg', getBackground(themeGradients.backgroundPage, theme.backgroundPageColor, theme.backgroundPageOpacity));
    root.style.setProperty('--cards-bg', getBackground(themeGradients.cards, theme.cardsColor, theme.cardsOpacity));
    root.style.setProperty('--button-bg', getBackground(themeGradients.button, theme.buttonColor, theme.buttonOpacity));
    root.style.setProperty('--accent-bg', getBackground(themeGradients.accent, theme.accentColor, theme.accentOpacity));
    root.style.setProperty('--input-bg', getBackground(themeGradients.input, theme.inputColor, theme.inputOpacity));
    
    // Keep the old gradient vars for backwards compatibility / debugging
    root.style.setProperty('--banner-gradient', buildGradientCSS(themeGradients.banner) || 'none');
    root.style.setProperty('--primary-gradient', buildGradientCSS(themeGradients.primary) || 'none');
    root.style.setProperty('--background-page-gradient', buildGradientCSS(themeGradients.backgroundPage) || 'none');
    root.style.setProperty('--cards-gradient', buildGradientCSS(themeGradients.cards) || 'none');
    root.style.setProperty('--button-gradient', buildGradientCSS(themeGradients.button) || 'none');
    root.style.setProperty('--accent-gradient', buildGradientCSS(themeGradients.accent) || 'none');
    root.style.setProperty('--input-gradient', buildGradientCSS(themeGradients.input) || 'none');
    
    // Update global gradients state
    gradients = themeGradients;
    
    // Apply banner configuration (use default if not present)
    if (theme.bannerConfig) {
        bannerConfig = {
            buttons: theme.bannerConfig.buttons || [...defaultBannerButtons],
            customButtons: theme.bannerConfig.customButtons || [],
            layout: theme.bannerConfig.layout || 'split',
            showTitle: theme.bannerConfig.showTitle !== false
        };
    } else {
        // Reset to default banner config
        bannerConfig = {
            buttons: [...defaultBannerButtons],
            customButtons: [],
            layout: 'split',
            showTitle: true
        };
    }
    applyBannerConfig();
    
    // Apply tile defaults and options visibility
    if (theme.tileDefaults) {
        tileDefaults = {
            showName: theme.tileDefaults.showName !== false,
            showCount: theme.tileDefaults.showCount === true,
            showBorder: theme.tileDefaults.showBorder === true
        };
    }
    
    if (theme.tileOptionsVisibility) {
        tileOptionsVisibility = {
            showName: theme.tileOptionsVisibility.showName !== false,
            showCount: theme.tileOptionsVisibility.showCount !== false,
            textCustomization: theme.tileOptionsVisibility.textCustomization !== false,
            border: theme.tileOptionsVisibility.border !== false,
            background: theme.tileOptionsVisibility.background !== false,
            color: theme.tileOptionsVisibility.color !== false,
            iconSize: theme.tileOptionsVisibility.iconSize !== false,
            borderRadius: theme.tileOptionsVisibility.borderRadius !== false
        };
    }
}

// Set theme inputs from theme object
function setThemeInputs(theme) {
    try {
        bannerColor.value = theme.bannerColor || '#2c3e50';
        primaryColor.value = theme.primaryColor || '#f5f6fa';
        backgroundPageColor.value = theme.backgroundPageColor || '#e8eaf0';
        cardsColor.value = theme.cardsColor || '#ffffff';
        accentColor.value = theme.accentColor || '#3498db';
        buttonColor.value = theme.buttonColor || '#3498db';
        textColor.value = theme.textColor || '#333333';
        inputColor.value = theme.inputColor || '#ffffff';
        borderRadius.value = theme.borderRadius || 4;
        shadowSize.value = theme.shadowSize || 10;
        iconSizeInput.value = theme.iconSize || 64;
        
        // Show grid icons checkbox
        const showGridIconsCb = document.getElementById('showGridIcons');
        if (showGridIconsCb) {
            showGridIconsCb.checked = theme.showGridIcons !== false;
            console.log('Setting showGridIcons checkbox to:', showGridIconsCb.checked);
        }
        
        // Show type badge checkbox
        const showTypeBadgeCb = document.getElementById('showTypeBadge');
        if (showTypeBadgeCb) showTypeBadgeCb.checked = theme.showTypeBadge !== false;
        
        // Show dashboard icons checkbox
        const showDashboardIconsCb = document.getElementById('showDashboardIcons');
        if (showDashboardIconsCb) showDashboardIconsCb.checked = theme.showDashboardIcons !== false;
        
        // Opacity inputs
        if (bannerOpacity) bannerOpacity.value = theme.bannerOpacity || 100;
        if (primaryOpacity) primaryOpacity.value = theme.primaryOpacity || 100;
        if (backgroundPageOpacity) backgroundPageOpacity.value = theme.backgroundPageOpacity || 100;
        if (cardsOpacity) cardsOpacity.value = theme.cardsOpacity || 100;
        if (buttonOpacity) buttonOpacity.value = theme.buttonOpacity || 100;
        if (accentOpacity) accentOpacity.value = theme.accentOpacity || 100;
        if (inputOpacity) inputOpacity.value = theme.inputOpacity || 100;
        
        // Typography
        if (globalFont) globalFont.value = theme.globalFont || "'Segoe UI', Arial, sans-serif";
        if (titleFont) titleFont.value = theme.titleFont || 'inherit';
        if (titleColor) titleColor.value = theme.titleColor || theme.textColor || '#333333';
        if (bodyFont) bodyFont.value = theme.bodyFont || 'inherit';
        if (descFont) descFont.value = theme.descFont || 'inherit';
        if (descColor) descColor.value = theme.descColor || theme.textColor || '#333333';
        if (buttonFont) buttonFont.value = theme.buttonFont || 'inherit';
        if (buttonTextColor) buttonTextColor.value = theme.buttonTextColor || '#ffffff';
        
        // Border
        if (borderStyle) borderStyle.value = theme.borderStyle || 'solid';
        if (borderWidth) borderWidth.value = theme.borderWidth || 1;
        if (borderColor) borderColor.value = theme.borderColor || '#000000';
        if (borderOpacity) borderOpacity.value = theme.borderColorOpacity || 10;
        
        // Application settings
        if (appNameInput) appNameInput.value = theme.appName || '';
        if (windowWidthInput) windowWidthInput.value = theme.windowWidth || 1000;
        if (windowHeightInput) windowHeightInput.value = theme.windowHeight || 800;
        if (windowMinWidthInput) windowMinWidthInput.value = theme.windowMinWidth ?? 0;
        if (windowMinHeightInput) windowMinHeightInput.value = theme.windowMinHeight ?? 0;
        if (zoomLevelInput) zoomLevelInput.value = theme.zoomLevel || 100;
        
        // Fullscreen and screen selection
        const startFullscreenCb = document.getElementById('startFullscreen');
        const startScreenSel = document.getElementById('startScreen');
        const windowSizeSec = document.getElementById('windowSizeSection');
        
        if (startFullscreenCb) {
            startFullscreenCb.checked = theme.startFullscreen || false;
            // Update window size section visibility
            if (windowSizeSec) {
                windowSizeSec.style.opacity = startFullscreenCb.checked ? '0.5' : '1';
                windowSizeSec.style.pointerEvents = startFullscreenCb.checked ? 'none' : 'auto';
            }
        }
        if (startScreenSel) startScreenSel.value = theme.startScreen || 0;
        
        // URL Window settings (per theme)
        const themeUrlWindowFullscreen = document.getElementById('themeUrlWindowFullscreen');
        const themeUrlWindowWidth = document.getElementById('themeUrlWindowWidth');
        const themeUrlWindowHeight = document.getElementById('themeUrlWindowHeight');
        const themeUrlWindowScreen = document.getElementById('themeUrlWindowScreen');
        const themeUrlWindowSizeSection = document.getElementById('themeUrlWindowSizeSection');
        
        if (themeUrlWindowFullscreen) {
            themeUrlWindowFullscreen.checked = theme.themeUrlWindowFullscreen || false;
            // Update URL window size section visibility
            if (themeUrlWindowSizeSection) {
                themeUrlWindowSizeSection.style.opacity = themeUrlWindowFullscreen.checked ? '0.5' : '1';
                themeUrlWindowSizeSection.style.pointerEvents = themeUrlWindowFullscreen.checked ? 'none' : 'auto';
            }
        }
        if (themeUrlWindowWidth) themeUrlWindowWidth.value = theme.themeUrlWindowWidth || 1200;
        if (themeUrlWindowHeight) themeUrlWindowHeight.value = theme.themeUrlWindowHeight || 800;
        if (themeUrlWindowScreen) themeUrlWindowScreen.value = theme.themeUrlWindowScreen || 'primary';
        
        // App icon - charger le base64 pour l'affichage
        if (appIconPreview) {
            if (theme.appIcon) {
                appIconPreview.src = theme.appIcon;
                appIconPreview.dataset.iconData = theme.appIcon;
            }
            if (theme.appIconPath) {
                appIconPreview.dataset.iconPath = theme.appIconPath;
            }
        }
        
        // Gradients
        gradients = theme.gradients || {};
        
        // Update color mode toggles based on gradient state
        const colorTargets = ['banner', 'primary', 'backgroundPage', 'cards', 'button', 'accent', 'input'];
        colorTargets.forEach(target => {
            const hasGradient = gradients[target] && gradients[target].enabled;
            
            // Update toggle buttons
            document.querySelectorAll(`.color-mode-btn[data-target="${target}"]`).forEach(btn => {
                btn.classList.toggle('active', hasGradient ? btn.dataset.mode === 'gradient' : btn.dataset.mode === 'solid');
            });
            
            // Show/hide inputs
            const solidInputs = document.querySelector(`.color-solid-inputs[data-target="${target}"]`);
            const gradientInputs = document.querySelector(`.color-gradient-inputs[data-target="${target}"]`);
            
            if (hasGradient) {
                solidInputs?.classList.add('hidden');
                gradientInputs?.classList.remove('hidden');
                updateGradientMiniPreview(target);
            } else {
                solidInputs?.classList.remove('hidden');
                gradientInputs?.classList.add('hidden');
            }
        });
        
        // Tile defaults
        const tileDefaults = theme.tileDefaults || {};
        const defaultShowName = document.getElementById('defaultShowName');
        const defaultShowCount = document.getElementById('defaultShowCount');
        const defaultShowBorder = document.getElementById('defaultShowBorder');
        if (defaultShowName) defaultShowName.checked = tileDefaults.showName !== false;
        if (defaultShowCount) defaultShowCount.checked = tileDefaults.showCount === true;
        if (defaultShowBorder) defaultShowBorder.checked = tileDefaults.showBorder === true;
        
        // Tile options visibility
        const themeTileOptionsVisibility = theme.tileOptionsVisibility || {};
        const optionShowName = document.getElementById('optionShowName');
        const optionShowCount = document.getElementById('optionShowCount');
        const optionTextCustomization = document.getElementById('optionTextCustomization');
        const optionBorder = document.getElementById('optionBorder');
        const optionBackground = document.getElementById('optionBackground');
        const optionColor = document.getElementById('optionColor');
        const optionIconSize = document.getElementById('optionIconSize');
        const optionBorderRadius = document.getElementById('optionBorderRadius');
        if (optionShowName) optionShowName.checked = themeTileOptionsVisibility.showName !== false;
        if (optionShowCount) optionShowCount.checked = themeTileOptionsVisibility.showCount !== false;
        if (optionTextCustomization) optionTextCustomization.checked = themeTileOptionsVisibility.textCustomization !== false;
        if (optionBorder) optionBorder.checked = themeTileOptionsVisibility.border !== false;
        if (optionBackground) optionBackground.checked = themeTileOptionsVisibility.background !== false;
        if (optionColor) optionColor.checked = themeTileOptionsVisibility.color !== false;
        if (optionIconSize) optionIconSize.checked = themeTileOptionsVisibility.iconSize !== false;
        if (optionBorderRadius) optionBorderRadius.checked = themeTileOptionsVisibility.borderRadius !== false;
        
    } catch (e) {
        console.error('Erreur en mettant à jour les contrôles de thème:', e);
    }
}

// Load saved themes
async function loadSavedThemes() {
    try {
        const themes = await window.pywebview.api.getCustomThemes();
        if (!savedThemesContainer) {
            console.error('savedThemesContainer non trouvé');
            return;
        }
        savedThemesContainer.innerHTML = '';
        
        themes.forEach((theme, index) => {
            const themeEl = document.createElement('div');
            themeEl.className = 'theme-item';
            themeEl.innerHTML = `
                <span class="theme-name">${theme.name}</span>
                <div class="theme-actions">
                    <button class="btn small" onclick="applyCustomTheme('${theme.name}')">Appliquer</button>
                    <button class="btn small btn-rename" onclick="renameCustomTheme(${index})" title="Renommer">✏️</button>
                    <button class="btn small btn-delete" onclick="deleteCustomTheme(${index})" title="Supprimer">🗑️</button>
                </div>
            `;
            savedThemesContainer.appendChild(themeEl);
        });
    } catch (e) {
        console.error('Erreur chargement thèmes:', e);
    }
}

// Delete a custom theme
async function deleteCustomTheme(index) {
    try {
        const confirmed = await customConfirm('Voulez-vous vraiment supprimer ce thème ?');
        if (confirmed) {
            const result = await window.pywebview.api.deleteCustomTheme(index);
            console.log('Suppression thème résultat:', result);
            await loadSavedThemes();
        }
    } catch (e) {
        console.error('Erreur suppression thème:', e);
    }
}

// Rename a custom theme
async function renameCustomTheme(index) {
    const themes = await window.pywebview.api.getCustomThemes();
    const theme = themes[index];
    if (!theme) return;
    
    const newName = await customPrompt('Nouveau nom du thème:', theme.name);
    if (newName && newName.trim() && newName !== theme.name) {
        await window.pywebview.api.renameCustomTheme(index, newName.trim());
        await loadSavedThemes();
    }
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
        theme.inputColor = theme.inputColor || '#ffffff';
        theme.borderRadius = theme.borderRadius || 4;
        theme.shadowSize = theme.shadowSize || 10;
        theme.iconSize = theme.iconSize || 64;
        
        applyTheme(theme);
        // Update the inputs so the user sees current values
        setThemeInputs(theme);
        // Persist as current theme
        await window.pywebview.api.saveTheme(theme);
    } catch (e) {
        console.error('Erreur en appliquant le thème personnalisé:', e);
    }
}

// Initial load
async function initializeApp() {
    try {
        console.log('Initialisation...');
        await loadFolderOrders(); // Load saved orders for all folders
        await loadFolderIcons(); // Load folder icons from server
        await loadAllDashboardLayouts(); // Load all dashboard layouts (per-folder) BEFORE renderItems
        await loadFolders();
        await renderItems();
        setupDragAndDrop(); // Enable drag and drop;
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
            savedTheme.inputColor = savedTheme.inputColor || '#ffffff';
            savedTheme.borderRadius = savedTheme.borderRadius || 4;
            savedTheme.shadowSize = savedTheme.shadowSize || 10;
            savedTheme.iconSize = savedTheme.iconSize || 64;
            applyTheme(savedTheme);
            setThemeInputs(savedTheme);
            
            // Apply zoom level from theme
            if (savedTheme.zoomLevel) {
                applyZoom(savedTheme.zoomLevel);
            }
        } else {
            // Load default theme if no saved theme
            loadCurrentTheme();
        }
        
        // Also check localStorage for zoom (in case it was changed and not saved to theme yet)
        const savedZoom = localStorage.getItem('appZoomLevel');
        if (savedZoom) {
            applyZoom(parseInt(savedZoom));
        }
        
        await loadSavedThemes();
        setupDashboardEvents(); // Initialize dashboard event handlers
        setupAddTileModalEvents(); // Initialize add tile modal events
        updateDashboardModeButton(); // Update button state
        console.log('Initialisation terminée');
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
    }
}

// Folder Management
async function loadFolders() {
    try {
        const shortcuts = await window.pywebview.api.getShortcuts();
        const folderSet = new Set();
        shortcuts.forEach(s => {
            // Support both old 'folder' and new 'folders' format
            const shortcutFolders = s.folders || (s.folder ? [s.folder] : []);
            shortcutFolders.forEach(folder => {
                if (folder) {
                    folderSet.add(folder);
                    // Add all parent paths too
                    const parts = folder.split('/');
                    for (let i = 1; i < parts.length; i++) {
                        folderSet.add(parts.slice(0, i).join('/'));
                    }
                }
            });
        });
        folders = Array.from(folderSet).sort();
        
        // Load recent history
        try {
            recentHistory = await window.pywebview.api.getRecentHistory() || [];
        } catch (e) {
            recentHistory = [];
        }
        
        updateFolderCheckboxes();
    } catch (error) {
        console.error('Error loading folders:', error);
    }
}

function updateFolderCheckboxes(containerId = 'folderCheckboxes', selectedFolders = ['']) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    // Add root option
    const rootLabel = document.createElement('label');
    rootLabel.className = 'folder-checkbox-item';
    rootLabel.innerHTML = `
        <input type="checkbox" value="" ${selectedFolders.includes('') ? 'checked' : ''}>
        <span>🏠 Racine</span>
    `;
    container.appendChild(rootLabel);
    
    // Add all folders
    folders.forEach(folder => {
        const label = document.createElement('label');
        label.className = 'folder-checkbox-item';
        const indent = '&nbsp;'.repeat(folder.split('/').length * 2);
        const displayName = folder.split('/').pop();
        label.innerHTML = `
            <input type="checkbox" value="${folder}" ${selectedFolders.includes(folder) ? 'checked' : ''}>
            <span>${indent}📁 ${displayName}</span>
        `;
        container.appendChild(label);
    });
}

function getSelectedFolders(containerId = 'folderCheckboxes') {
    const container = document.getElementById(containerId);
    if (!container) return [''];
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Keep compatibility
async function renderFolders() {
    await renderItems();
}

function navigateToFolder(folder) {
    currentFolder = folder;
    updateBreadcrumb();
    renderItems();
}

function updateBreadcrumb() {
    const breadcrumb = document.querySelector('.folder-breadcrumb');
    breadcrumb.innerHTML = '';
    
    // Bouton accueil/racine
    const rootBtn = document.createElement('button');
    rootBtn.className = 'folder-crumb' + (currentFolder === '' ? ' active' : '');
    rootBtn.textContent = '🏠 Accueil';
    rootBtn.onclick = () => navigateToFolder('');
    breadcrumb.appendChild(rootBtn);
    
    // Gestion spéciale pour le dossier virtuel "Récemment ouvert"
    if (currentFolder === RECENT_FOLDER) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '›';
        breadcrumb.appendChild(sep);
        
        const recentBtn = document.createElement('button');
        recentBtn.className = 'folder-crumb active';
        recentBtn.textContent = '⏱️ Récemment ouvert';
        breadcrumb.appendChild(recentBtn);
        return;
    }
    
    if (currentFolder) {
        // Séparateur
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '›';
        breadcrumb.appendChild(sep);
        
        const parts = currentFolder.split('/');
        let path = '';
        parts.forEach((part, index) => {
            path += (path ? '/' : '') + part;
            const isLast = index === parts.length - 1;
            
            const folderBtn = document.createElement('button');
            folderBtn.className = 'folder-crumb' + (isLast ? ' active' : '');
            folderBtn.textContent = part;
            const btnPath = path;
            folderBtn.onclick = () => navigateToFolder(btnPath);
            breadcrumb.appendChild(folderBtn);
            
            if (!isLast) {
                const sep2 = document.createElement('span');
                sep2.className = 'breadcrumb-sep';
                sep2.textContent = '›';
                breadcrumb.appendChild(sep2);
            }
        });
    }
}

document.getElementById('addFolderBtn').addEventListener('click', async () => {
    const folderName = await customPrompt('Nom du nouveau dossier:');
    if (folderName && folderName.trim()) {
        let fullPath = folderName.trim();
        // If we're in a folder, prefix with current path
        if (currentFolder) {
            fullPath = currentFolder + '/' + fullPath;
        }
        if (!folders.includes(fullPath)) {
            folders.push(fullPath);
            folders.sort();
            updateFolderSelect();
            renderFolders();
        }
    }
});

async function deleteFolder(folder) {
    try {
        const confirmed = await customConfirm(`Supprimer le dossier "${folder}"?\nLes raccourcis seront déplacés à la racine.`);
        if (confirmed) {
            const shortcuts = await window.pywebview.api.getShortcuts();
            let modified = false;
            for (let i = 0; i < shortcuts.length; i++) {
                // Support both old 'folder' and new 'folders' format
                let shortcutFolders = shortcuts[i].folders || (shortcuts[i].folder !== undefined ? [shortcuts[i].folder] : ['']);
                if (shortcutFolders.includes(folder)) {
                    // Remove this folder from the list, add root if empty
                    shortcutFolders = shortcutFolders.filter(f => f !== folder);
                    if (shortcutFolders.length === 0) shortcutFolders = [''];
                    shortcuts[i].folders = shortcutFolders;
                    delete shortcuts[i].folder;
                    modified = true;
                }
            }
            
            if (modified) {
                await window.pywebview.api.saveShortcutsList(shortcuts);
            }
            
            folders = folders.filter(f => f !== folder);
            // Supprimer l'icône du dossier
            delete folderIconsCache[folder];
            await window.pywebview.api.deleteFolderIcon(folder);
            updateFolderCheckboxes();
            await renderItems();
        }
    } catch (e) {
        console.error('Erreur suppression dossier:', e);
    }
}

// Renommer un dossier et mettre à jour tous les raccourcis
async function renameFolderAndShortcuts(oldPath, newName) {
    const shortcuts = await window.pywebview.api.getShortcuts();
    const pathParts = oldPath.split('/');
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join('/');
    
    // Vérifier si le nouveau nom existe déjà
    if (folders.includes(newPath) && newPath !== oldPath) {
        await customConfirm('Un dossier avec ce nom existe déjà !');
        return;
    }
    
    // Mettre à jour tous les raccourcis du dossier (support multi-folders)
    let modified = false;
    for (let i = 0; i < shortcuts.length; i++) {
        let shortcutFolders = shortcuts[i].folders || (shortcuts[i].folder !== undefined ? [shortcuts[i].folder] : ['']);
        let needsUpdate = false;
        
        shortcutFolders = shortcutFolders.map(f => {
            if (f === oldPath) {
                needsUpdate = true;
                return newPath;
            } else if (f && f.startsWith(oldPath + '/')) {
                needsUpdate = true;
                return f.replace(oldPath, newPath);
            }
            return f;
        });
        
        if (needsUpdate) {
            shortcuts[i].folders = shortcutFolders;
            delete shortcuts[i].folder;
            modified = true;
        }
    }
    
    if (modified) {
        await window.pywebview.api.saveShortcutsList(shortcuts);
    }
    
    // Transférer l'icône du dossier
    await window.pywebview.api.renameFolderIcon(oldPath, newPath);
    
    // Mettre à jour la liste des dossiers
    folders = folders.filter(f => f !== oldPath);
    folders.push(newPath);
    folders.sort();
    
    // Si on était dans le dossier renommé, naviguer vers le nouveau nom
    if (currentFolder === oldPath) {
        currentFolder = newPath;
    }
    
    updateFolderSelect();
    await renderItems();
}

// Cache local des icônes de dossiers (chargé depuis le serveur)
let folderIconsCache = {};

// Charger les icônes de dossiers depuis le serveur
async function loadFolderIcons() {
    try {
        folderIconsCache = await window.pywebview.api.getFolderIcons() || {};
        console.log('📁 Icônes de dossiers chargées:', Object.keys(folderIconsCache).length);
    } catch (e) {
        console.error('Erreur chargement icônes dossiers:', e);
        folderIconsCache = {};
    }
}

// Sauvegarder l'icône d'un dossier
async function saveFolderIcon(folderPath, iconPath) {
    try {
        // Récupérer l'icône en base64 depuis Python
        console.log('saveFolderIcon - iconPath:', iconPath);
        const iconData = await window.pywebview.api.getIconForPath(iconPath);
        console.log('saveFolderIcon - iconData reçu:', iconData ? iconData.substring(0, 50) + '...' : 'null');
        if (iconData) {
            // Sauvegarder dans le cache local et sur le serveur
            folderIconsCache[folderPath] = iconData;
            await window.pywebview.api.saveFolderIcon(folderPath, iconData);
            console.log('saveFolderIcon - Sauvegardé sur le serveur');
        }
    } catch (e) {
        console.error('Erreur saveFolderIcon:', e);
    }
}

// Récupérer l'icône d'un dossier
function getFolderIcon(folderPath) {
    return folderIconsCache[folderPath] || null;
}

// ============================================
// DRAG AND DROP SYSTEM FOR CUSTOM ORDER
// ============================================
let draggedElement = null;

function setupDragAndDrop() {
    itemsContainer.addEventListener('dragstart', handleDragStart);
    itemsContainer.addEventListener('dragend', handleDragEnd);
    itemsContainer.addEventListener('dragover', handleDragOver);
    itemsContainer.addEventListener('drop', handleDrop);
}

function handleDragStart(e) {
    const target = e.target.closest('.shortcut');
    if (!target || !isReorderMode) {
        e.preventDefault();
        return;
    }
    
    isDragging = true;
    draggedElement = target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    
    setTimeout(() => target.classList.add('dragging'), 0);
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
    }
    // Save the new order after drag ends
    saveCurrentOrder();
    
    // Reset isDragging after a short delay to prevent click from firing
    setTimeout(() => {
        isDragging = false;
    }, 100);
}

function handleDragOver(e) {
    e.preventDefault();
    if (!draggedElement || !isReorderMode) return;

    const target = e.target.closest('.shortcut');
    if (!target || target === draggedElement) return;

    const rect = target.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    
    // Determine if we should insert before or after
    const isGridView = itemsContainer.classList.contains('grid-view');
    const isAfter = isGridView ? (e.clientX > midX) : (e.clientY > midY);

    if (isAfter) {
        itemsContainer.insertBefore(draggedElement, target.nextSibling);
    } else {
        itemsContainer.insertBefore(draggedElement, target);
    }
}

function handleDrop(e) {
    e.preventDefault();
}

async function saveCurrentOrder() {
    // Collect all item keys in current order
    const items = Array.from(itemsContainer.children);
    const order = items.map(el => el.dataset.itemKey).filter(k => k);
    
    // Save to cache and backend
    folderOrdersCache[currentFolder] = order;
    await window.pywebview.api.saveItemsOrder(currentFolder, order);
    
    console.log(`💾 Saved order for folder "${currentFolder || 'root'}":`, order.length, 'items');
}

async function loadFolderOrders() {
    try {
        folderOrdersCache = await window.pywebview.api.getFolderOrder() || {};
        console.log('📂 Loaded folder orders:', Object.keys(folderOrdersCache).length, 'folders');
    } catch (e) {
        console.error('Error loading folder orders:', e);
        folderOrdersCache = {};
    }
}

// ============================================
// DASHBOARD - PER FOLDER SYSTEM
// ============================================

async function loadAllDashboardLayouts() {
    try {
        // Load old format (backwards compatibility)
        const oldLayout = await window.pywebview.api.getDashboardLayout() || [];
        
        // Try to load new format
        let savedLayouts = {};
        try {
            savedLayouts = await window.pywebview.api.getAllDashboardLayouts() || {};
        } catch (e) {
            // API doesn't exist yet, use old format for root
            savedLayouts = {};
        }
        
        // Migrate old format if needed
        if (oldLayout.length > 0 && !savedLayouts['__root__']) {
            savedLayouts['__root__'] = { enabled: true, tiles: oldLayout };
        }
        
        allDashboardLayouts = savedLayouts;
        console.log('🏠 Loaded dashboard layouts for', Object.keys(allDashboardLayouts).length, 'folders');
    } catch (e) {
        console.error('Error loading dashboard layouts:', e);
        allDashboardLayouts = {};
    }
}

async function saveAllDashboardLayouts() {
    try {
        await window.pywebview.api.saveAllDashboardLayouts(allDashboardLayouts);
        // Also save root in old format for backwards compatibility
        const rootLayout = allDashboardLayouts['__root__'];
        if (rootLayout && rootLayout.tiles) {
            await window.pywebview.api.saveDashboardLayout(rootLayout.tiles);
        }
        console.log('💾 Saved dashboard layouts');
    } catch (e) {
        console.error('Error saving dashboard layouts:', e);
    }
}

// Update the dashboard mode button state
function updateDashboardModeButton() {
    const btn = document.getElementById('toggleDashboardModeBtn');
    if (!btn) return;
    
    const layout = getCurrentDashboardLayout();
    if (layout.enabled) {
        btn.textContent = '📋'; // Grid icon when in dashboard mode (click to go to grid)
        btn.title = 'Passer en mode grille';
    } else {
        btn.textContent = '📊'; // Dashboard icon when in grid mode (click to go to dashboard)
        btn.title = 'Passer en mode dashboard';
    }
}

// Toggle dashboard mode for current folder
async function toggleFolderDashboardMode() {
    const layout = getCurrentDashboardLayout();
    layout.enabled = !layout.enabled;
    await saveAllDashboardLayouts();
    updateDashboardModeButton();
    await renderItems();
    showNotification(layout.enabled ? '📊 Mode dashboard activé' : '📋 Mode grille activé');
}

// Render the "Recently Opened" folder in grid mode
async function renderRecentGridView(allShortcuts) {
    itemsContainer.innerHTML = '';
    
    if (recentHistory.length === 0) {
        itemsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; opacity: 0.7;">
                <p style="font-size: 48px; margin-bottom: 20px;">📭</p>
                <p>Aucun raccourci récent</p>
                <p style="font-size: 13px; margin-top: 10px;">Les raccourcis que vous ouvrirez apparaîtront ici</p>
            </div>
        `;
        return;
    }
    
    // Créer les éléments pour chaque raccourci récent
    recentHistory.forEach((recent, position) => {
        const shortcut = allShortcuts.find(s => s.name === recent.name);
        if (!shortcut) return;
        
        const globalIndex = allShortcuts.indexOf(shortcut);
        
        const item = {
            type: 'shortcut',
            data: shortcut,
            index: globalIndex,
            name: shortcut.name,
            path: shortcut.path,
            lastOpened: recent.timestamp
        };
        
        const shortcutEl = createShortcutElement(item, position);
        
        // Ajouter un badge avec le temps écoulé
        const badge = document.createElement('div');
        badge.className = 'recent-time-badge';
        badge.textContent = formatTimeAgo(recent.timestamp);
        badge.style.cssText = 'position: absolute; top: 5px; right: 5px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 10px; color: #fff;';
        shortcutEl.style.position = 'relative';
        shortcutEl.appendChild(badge);
        
        itemsContainer.appendChild(shortcutEl);
    });
}

// Render the "Recently Opened" dashboard with dynamic positions
async function renderRecentDashboard(allShortcuts) {
    const tilesContainer = document.getElementById('homeTilesContainer');
    const rootItemsContainer = document.getElementById('homeRootItems');
    const homeHeader = document.querySelector('.home-header h2');
    
    if (homeHeader) homeHeader.textContent = '⏱️ Récemment ouvert';
    
    tilesContainer.innerHTML = '';
    rootItemsContainer.innerHTML = '';
    
    const layout = getCurrentDashboardLayout();
    const positionTiles = layout.tiles || []; // Tiles are bound to positions (1st, 2nd, 3rd...)
    
    if (recentHistory.length === 0) {
        rootItemsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; opacity: 0.7;">
                <p style="font-size: 48px; margin-bottom: 20px;">📭</p>
                <p>Aucun raccourci récent</p>
                <p style="font-size: 13px; margin-top: 10px;">Les raccourcis que vous ouvrirez apparaîtront ici</p>
            </div>
        `;
        updateDashboardEditButton();
        return;
    }
    
    // For each position in the layout, find the corresponding recent shortcut
    // Position tiles define the STYLE, recent history defines the CONTENT
    recentHistory.forEach((recent, positionIndex) => {
        const shortcut = allShortcuts.find(s => s.name === recent.name);
        if (!shortcut) return;
        
        const globalIndex = allShortcuts.indexOf(shortcut);
        
        // Get the tile style for this position (if defined)
        const positionTile = positionTiles[positionIndex] || {};
        
        // Get style options
        const iconSize = positionTile.iconSize || 64;
        const fontSize = positionTile.fontSize || 14;
        const borderRadius = positionTile.borderRadius !== undefined ? positionTile.borderRadius : 12;
        const showIcon = positionTile.showIcon !== false; // Default true
        const showName = positionTile.showName !== false;
        const showCount = positionTile.showCount === true; // Default false
        const showBorder = positionTile.showBorder === true;
        const borderColor = positionTile.borderColor || 'var(--accent-color)';
        const borderWidth = positionTile.borderWidth || 2;
        const borderStyle = positionTile.borderStyle || 'solid';
        
        // Options de personnalisation du texte
        const richTextHtml = positionTile.richTextHtml || '';
        const customText = positionTile.customText || '';
        const fontFamily = positionTile.fontFamily || 'inherit';
        const textOffsetX = positionTile.textOffsetX || 0;
        const textOffsetY = positionTile.textOffsetY || 0;
        const textAlign = positionTile.textAlign || 'center';
        const effects = positionTile.effects || {};
        
        const div = document.createElement('div');
        div.className = 'home-tile';
        div.dataset.index = positionIndex;
        div.dataset.tileType = 'recent-shortcut';
        div.dataset.shortcutName = shortcut.name;
        
        // Use position tile's style, or default style
        div.style.position = 'absolute';
        div.style.left = `${positionTile.x || (20 + (positionIndex % 4) * 220)}px`;
        div.style.top = `${positionTile.y || (20 + Math.floor(positionIndex / 4) * 180)}px`;
        div.style.width = `${positionTile.width || 200}px`;
        div.style.height = `${positionTile.height || 150}px`;
        div.style.borderRadius = `${borderRadius}px`;
        
        if (showBorder) {
            div.style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
        } else {
            div.style.border = 'none';
        }
        
        if (positionTile.color) {
            const opacity = positionTile.opacity !== undefined ? positionTile.opacity / 100 : 1;
            div.style.backgroundColor = hexToRgba(positionTile.color, opacity);
        }
        
        // Image de fond
        if (positionTile.backgroundImage) {
            const bgSize = positionTile.backgroundSize || 'cover';
            if (positionTile.backgroundImage.startsWith('http') || positionTile.backgroundImage.startsWith('data:')) {
                div.style.backgroundImage = `url('${positionTile.backgroundImage}')`;
            } else {
                div.style.backgroundImage = `url('/file/${encodeURIComponent(positionTile.backgroundImage)}')`;
            }
            div.style.backgroundSize = bgSize;
            div.style.backgroundPosition = 'center';
            div.style.backgroundRepeat = 'no-repeat';
        }
        
        const iconSrc = `/icon/${globalIndex}`;
        
        // Générer le style du texte personnalisé
        const displayContent = richTextHtml || customText || shortcut.name;
        let textStyle = `font-size: ${fontSize}px; font-family: ${fontFamily}; text-align: ${textAlign};`;
        if (textOffsetX || textOffsetY) textStyle += ` transform: translate(${textOffsetX}px, ${textOffsetY}px);`;
        
        // Appliquer les effets de texte
        let textShadows = [];
        if (effects.shadow?.enabled) {
            const s = effects.shadow;
            textShadows.push(`${s.x || 2}px ${s.y || 2}px ${s.blur || 4}px ${s.color || '#000000'}`);
        }
        if (effects.glow?.enabled) {
            const g = effects.glow;
            for (let i = 1; i <= (g.intensity || 2); i++) {
                textShadows.push(`0 0 ${(g.size || 10) * i / (g.intensity || 2)}px ${g.color || '#ffffff'}`);
            }
        }
        if (textShadows.length > 0) textStyle += ` text-shadow: ${textShadows.join(', ')};`;
        if (effects.outline?.enabled) {
            const o = effects.outline;
            textStyle += ` -webkit-text-stroke: ${o.width || 1}px ${o.color || '#000000'};`;
        }
        
        const isUrl = shortcut.type === 'url' || shortcut.path?.startsWith('http');
        const fallbackEmoji = isUrl ? '🌐' : '🎮';
        div.innerHTML = `
            ${showIcon ? `<div class="home-tile-icon" style="font-size: ${iconSize}px;"><img src="${iconSrc}" alt="${shortcut.name}" style="width: ${iconSize}px; height: ${iconSize}px;" data-fallback="${fallbackEmoji}"></div>` : ''}
            ${showName ? `<div class="home-tile-name" style="${textStyle}">${displayContent}</div>` : ''}
            ${showCount ? `<div class="home-tile-count" style="font-size: ${Math.max(fontSize - 2, 10)}px;">#${positionIndex + 1} • ${formatTimeAgo(recent.timestamp)}</div>` : ''}
            <div class="tile-edit-btn" onclick="event.stopPropagation(); openRecentTileEditModal(${positionIndex})">✏️</div>
            <div class="tile-resize-handle tile-resize-se"></div>
            <div class="tile-resize-handle tile-resize-e"></div>
            <div class="tile-resize-handle tile-resize-s"></div>
        `;
        
        // Configurer le fallback pour l'icône
        const iconImg = div.querySelector('.home-tile-icon img');
        if (iconImg) setupIconWithFallback(iconImg, fallbackEmoji);
        
        // Click to launch
        function handleRecentClick(e) {
            if (isDashboardEditMode) return;
            if (e.target.closest('.tile-edit-btn')) return;
            window.pywebview.api.openShortcut(shortcut.path, shortcut.openInApp !== false, shortcut.name);
        }
        
        div.addEventListener('click', handleRecentClick);
        
        tilesContainer.appendChild(div);
    });
    
    // Adjust container height
    let maxBottom = 0;
    recentHistory.forEach((_, idx) => {
        const tile = positionTiles[idx] || {};
        const y = tile.y || (20 + Math.floor(idx / 4) * 180);
        const h = tile.height || 150;
        if (y + h > maxBottom) maxBottom = y + h;
    });
    tilesContainer.style.minHeight = `${maxBottom + 40}px`;
    
    updateDashboardEditButton();
    
    if (isDashboardEditMode) {
        setupTileDragAndResize();
    }
}

// Format timestamp to "il y a X minutes/heures"
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'à l\'instant';
    if (minutes < 60) return `il y a ${minutes} min`;
    if (hours < 24) return `il y a ${hours}h`;
    if (days === 1) return 'hier';
    return `il y a ${days} jours`;
}

// Open edit modal for a recent tile (position-based)
function openRecentTileEditModal(positionIndex) {
    const layout = getCurrentDashboardLayout();
    if (!layout.tiles) layout.tiles = [];
    
    // Ensure position tile exists
    while (layout.tiles.length <= positionIndex) {
        layout.tiles.push({});
    }
    
    const tile = layout.tiles[positionIndex];
    
    const modal = document.getElementById('tileModal');
    if (!modal) return;
    
    modal.dataset.tileIndex = positionIndex;
    modal.dataset.isRecentTile = 'true';
    
    // Set color
    const colorInput = document.getElementById('tileColor');
    if (colorInput) colorInput.value = tile.color || '#3498db';
    
    // Set opacity
    const opacityInput = document.getElementById('tileOpacity');
    if (opacityInput) opacityInput.value = tile.opacity !== undefined ? tile.opacity : 100;
    
    // Set icon size (slider + input)
    const iconSizeSlider = document.getElementById('tileIconSize');
    const iconSizeInput = document.getElementById('tileIconSizeInput');
    const iconSize = tile.iconSize || 64;
    if (iconSizeSlider) iconSizeSlider.value = iconSize;
    if (iconSizeInput) iconSizeInput.value = iconSize;
    
    // Set font size (slider avec valeur affichée)
    const fontSizeSlider = document.getElementById('tileFontSizeSlider');
    const fontSizeVal = document.getElementById('tileFontSizeVal');
    const fontSize = tile.fontSize || 14;
    if (fontSizeSlider) fontSizeSlider.value = fontSize;
    if (fontSizeVal) fontSizeVal.textContent = fontSize;
    
    // Set text offset sliders
    const textOffsetX = document.getElementById('tileTextOffsetX');
    const textOffsetXVal = document.getElementById('tileTextOffsetXVal');
    const textOffsetY = document.getElementById('tileTextOffsetY');
    const textOffsetYVal = document.getElementById('tileTextOffsetYVal');
    const offsetX = tile.textOffsetX || 0;
    const offsetY = tile.textOffsetY || 0;
    if (textOffsetX) textOffsetX.value = offsetX;
    if (textOffsetXVal) textOffsetXVal.textContent = offsetX;
    if (textOffsetY) textOffsetY.value = offsetY;
    if (textOffsetYVal) textOffsetYVal.textContent = offsetY;
    
    // Set border radius (slider + input)
    const borderRadiusSlider = document.getElementById('tileBorderRadius');
    const borderRadiusInput = document.getElementById('tileBorderRadiusInput');
    const borderRadius = tile.borderRadius !== undefined ? tile.borderRadius : 12;
    if (borderRadiusSlider) borderRadiusSlider.value = borderRadius;
    if (borderRadiusInput) borderRadiusInput.value = borderRadius;
    
    // Set checkboxes
    const showIconCheck = document.getElementById('tileShowIcon');
    if (showIconCheck) showIconCheck.checked = tile.showIcon !== false;
    
    const showNameCheck = document.getElementById('tileShowName');
    if (showNameCheck) showNameCheck.checked = tile.showName !== false;
    
    const showCountCheck = document.getElementById('tileShowCount');
    if (showCountCheck) showCountCheck.checked = tile.showCount === true; // Désactivé par défaut
    
    // Options de bordure
    const showBorderCheck = document.getElementById('tileShowBorder');
    if (showBorderCheck) showBorderCheck.checked = tile.showBorder === true;
    
    const borderOptions = document.getElementById('borderOptions');
    if (borderOptions) {
        borderOptions.classList.toggle('hidden', !tile.showBorder);
    }
    
    const borderColor = document.getElementById('tileBorderColor');
    if (borderColor) borderColor.value = tile.borderColor || '#1abc9c';
    
    const borderWidthSlider = document.getElementById('tileBorderWidth');
    const borderWidthInput = document.getElementById('tileBorderWidthInput');
    const borderWidth = tile.borderWidth || 2;
    if (borderWidthSlider) borderWidthSlider.value = borderWidth;
    if (borderWidthInput) borderWidthInput.value = borderWidth;
    
    const borderStyleSelect = document.getElementById('tileBorderStyle');
    if (borderStyleSelect) borderStyleSelect.value = tile.borderStyle || 'solid';
    
    // Set custom icon
    const iconPathInput = document.getElementById('tileIconPath');
    if (iconPathInput) iconPathInput.value = tile.customIcon || '';
    
    // Définir l'image de fond
    const bgImageInput = document.getElementById('tileBackgroundImage');
    if (bgImageInput) bgImageInput.value = tile.backgroundImage || '';
    const bgSizeSelect = document.getElementById('tileBackgroundSize');
    if (bgSizeSelect) bgSizeSelect.value = tile.backgroundSize || 'cover';
    
    // Options de personnalisation du texte - Éditeur riche
    const richEditor = document.getElementById('tileRichTextEditor');
    if (richEditor) {
        // Charger le contenu HTML riche
        if (tile.richTextHtml) {
            richEditor.innerHTML = tile.richTextHtml;
        } else if (tile.customText) {
            richEditor.textContent = tile.customText;
        } else {
            // Récupérer le nom du raccourci depuis recentHistory
            const recent = recentHistory[positionIndex];
            if (recent) {
                richEditor.textContent = recent.name || 'Raccourci';
            } else {
                richEditor.textContent = 'Raccourci';
            }
        }
    }
    
    const fontFamilySelect = document.getElementById('tileFontFamily');
    if (fontFamilySelect) fontFamilySelect.value = tile.fontFamily || 'inherit';
    
    const textOffsetXInput = document.getElementById('tileTextOffsetX');
    if (textOffsetXInput) textOffsetXInput.value = tile.textOffsetX || 0;
    
    const textOffsetYInput = document.getElementById('tileTextOffsetY');
    if (textOffsetYInput) textOffsetYInput.value = tile.textOffsetY || 0;
    
    const textAlignSelect = document.getElementById('tileTextAlign');
    if (textAlignSelect) textAlignSelect.value = tile.textAlign || 'center';
    
    // Charger les effets de texte
    loadEffectsToModal(tile.effects);
    
    // Hide folder select for recent tiles
    const folderSelectSection = document.querySelector('#tileModal .form-group:has(#tileFolderSelect)');
    if (folderSelectSection) folderSelectSection.style.display = 'none';
    
    modal.classList.remove('hidden');
    
    // Appliquer la visibilité des options selon le thème
    applyTileOptionsVisibility();
}

async function renderDashboard(allShortcuts, folderPath = '') {
    const tilesContainer = document.getElementById('homeTilesContainer');
    const rootItemsContainer = document.getElementById('homeRootItems');
    tilesContainer.innerHTML = '';
    
    const layout = getCurrentDashboardLayout();
    const dashboardLayout = layout.tiles || [];
    
    // Rendre chaque tuile personnalisée
    dashboardLayout.forEach((tile, index) => {
        const tileEl = createDashboardTile(tile, index, allShortcuts);
        tilesContainer.appendChild(tileEl);
    });
    
    // Ajuster la hauteur du conteneur de tuiles
    if (dashboardLayout.length > 0) {
        let maxBottom = 0;
        dashboardLayout.forEach(t => {
            const bottom = (t.y || 0) + (t.height || 150);
            if (bottom > maxBottom) maxBottom = bottom;
        });
        tilesContainer.style.minHeight = `${maxBottom + 20}px`;
    } else {
        tilesContainer.style.minHeight = '100px';
    }
    
    // Rendre les éléments natifs de la racine
    renderRootItems(allShortcuts, rootItemsContainer);
    
    // Appliquer le mode de vue actuel à homeRootItems
    if (isGridView) {
        rootItemsContainer.classList.remove('list-view');
        rootItemsContainer.classList.add('grid-view');
    } else {
        rootItemsContainer.classList.remove('grid-view');
        rootItemsContainer.classList.add('list-view');
    }
    
    // Mettre à jour le bouton d'édition
    updateDashboardEditButton();
    
    // Setup drag & resize pour le mode édition
    if (isDashboardEditMode) {
        setupTileDragAndResize();
    }
}

// Afficher les éléments natifs du dossier courant (sous-dossiers + raccourcis du dossier)
function renderRootItems(allShortcuts, container) {
    if (!container) return;
    container.innerHTML = '';
    
    // Récupérer les sous-dossiers du dossier courant
    const currentPrefix = currentFolder ? currentFolder + '/' : '';
    const subfolders = folders.filter(f => {
        if (currentFolder === '') {
            // À la racine: dossiers sans slash
            return !f.includes('/');
        } else {
            // Dans un sous-dossier: dossiers qui commencent par le préfixe et n'ont pas d'autre slash après
            if (!f.startsWith(currentPrefix)) return false;
            const remainder = f.substring(currentPrefix.length);
            return remainder && !remainder.includes('/');
        }
    });
    
    // Récupérer les raccourcis du dossier courant (support multi-folders)
    const folderShortcuts = allShortcuts.filter(s => {
        const sfolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
        return sfolders.includes(currentFolder);
    });
    
    if (subfolders.length === 0 && folderShortcuts.length === 0) {
        return;
    }
    
    // Header
    const header = document.createElement('div');
    header.className = 'home-root-items-header';
    header.innerHTML = `<h3>📁 Contenu ${currentFolder ? 'du dossier' : 'de la racine'}</h3>`;
    container.appendChild(header);
    
    // Grille des éléments
    const grid = document.createElement('div');
    grid.className = 'items-grid';
    
    // Ajouter le dossier virtuel "Récemment ouvert" à la racine
    if (currentFolder === '' && recentHistory.length > 0) {
        const recentItem = {
            type: 'folder',
            name: 'Récemment ouvert',
            fullPath: RECENT_FOLDER,
            count: recentHistory.length,
            iconPath: null,
            isVirtual: true
        };
        const recentDiv = createFolderElement(recentItem, -1);
        recentDiv.querySelector('.folder-icon').textContent = '⏱️';
        grid.appendChild(recentDiv);
    }
    
    // Ajouter les sous-dossiers
    subfolders.forEach((folder, idx) => {
        const count = allShortcuts.filter(s => {
            const sfolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
            return sfolders.some(f => f === folder || f.startsWith(folder + '/'));
        }).length;
        const folderIcon = getFolderIcon(folder);
        const item = {
            type: 'folder',
            name: folder.split('/').pop() || folder,
            fullPath: folder,
            count: count,
            iconPath: folderIcon
        };
        const div = createFolderElement(item, idx);
        grid.appendChild(div);
    });
    
    // Ajouter les raccourcis
    folderShortcuts.forEach((shortcut, idx) => {
        const globalIndex = allShortcuts.indexOf(shortcut);
        const item = {
            type: 'shortcut',
            data: shortcut,
            index: globalIndex,
            name: shortcut.name,
            path: shortcut.path
        };
        const div = createShortcutElement(item, idx);
        grid.appendChild(div);
    });
    
    container.appendChild(grid);
}

function createDashboardTile(tile, index, allShortcuts) {
    const div = document.createElement('div');
    div.className = 'home-tile';
    div.dataset.index = index;
    div.dataset.tileType = tile.type || 'folder';
    
    // Positionnement absolu
    div.style.position = 'absolute';
    div.style.left = `${tile.x || 0}px`;
    div.style.top = `${tile.y || 0}px`;
    div.style.width = `${tile.width || 150}px`;
    div.style.height = `${tile.height || 150}px`;
    
    // Couleur personnalisée
    if (tile.color) {
        const opacity = tile.opacity !== undefined ? tile.opacity / 100 : 1;
        div.style.backgroundColor = hexToRgba(tile.color, opacity);
    }
    
    // Image de fond
    if (tile.backgroundImage) {
        const bgSize = tile.backgroundSize || 'cover';
        // Vérifier si c'est un chemin local ou une URL
        if (tile.backgroundImage.startsWith('http') || tile.backgroundImage.startsWith('data:')) {
            div.style.backgroundImage = `url('${tile.backgroundImage}')`;
        } else {
            div.style.backgroundImage = `url('/file/${encodeURIComponent(tile.backgroundImage)}')`;
        }
        div.style.backgroundSize = bgSize;
        div.style.backgroundPosition = 'center';
        div.style.backgroundRepeat = 'no-repeat';
    }
    
    // Appliquer les nouvelles options de style
    const iconSize = tile.iconSize || 64;
    const fontSize = tile.fontSize || 14;
    const borderRadius = tile.borderRadius !== undefined ? tile.borderRadius : 12;
    const showIcon = tile.showIcon !== false; // Default true
    const showName = tile.showName !== false;
    const showCount = tile.showCount === true; // Désactivé par défaut
    const showBorder = tile.showBorder === true;
    
    // Options de personnalisation du texte
    const richTextHtml = tile.richTextHtml || '';
    const customText = tile.customText || '';
    const fontFamily = tile.fontFamily || 'inherit';
    const textOffsetX = tile.textOffsetX || 0;
    const textOffsetY = tile.textOffsetY || 0;
    const textAlign = tile.textAlign || 'center';
    const effects = tile.effects || {};
    
    div.style.borderRadius = `${borderRadius}px`;
    
    // Bordure avancée
    if (showBorder) {
        const borderColor = tile.borderColor || '#1abc9c';
        const borderWidth = tile.borderWidth || 2;
        const borderStyle = tile.borderStyle || 'solid';
        div.style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
    } else {
        div.style.border = 'none';
    }
    
    // Contenu selon le type
    let iconHtml, nameText, countText;
    
    if (tile.type === 'shortcut') {
        // C'est un raccourci
        const shortcut = allShortcuts?.find(s => s.name === tile.shortcutName);
        if (shortcut) {
            // Utiliser l'URL du serveur pour l'icône
            const globalIndex = allShortcuts.indexOf(shortcut);
            const iconSrc = `/icon/${globalIndex}`;
            const isUrl = shortcut.type === 'url' || shortcut.path?.startsWith('http');
            const fallbackEmoji = isUrl ? '🌐' : '🎮';
            iconHtml = `<div class="home-tile-icon" style="font-size: ${iconSize}px;"><img src="${iconSrc}" alt="${shortcut.name}" style="width: ${iconSize}px; height: ${iconSize}px;" data-fallback="${fallbackEmoji}"></div>`;
            nameText = shortcut.name;
            countText = shortcut.description || '';
        } else {
            iconHtml = `<div class="home-tile-icon" style="font-size: ${iconSize}px;">❓</div>`;
            nameText = tile.shortcutName || 'Raccourci';
            countText = 'Non trouvé';
        }
        div.dataset.shortcutName = tile.shortcutName;
    } else {
        // C'est un dossier
        // Cas spécial : dossier "Récemment ouvert"
        if (tile.folderId === RECENT_FOLDER) {
            iconHtml = `<div class="home-tile-icon" style="font-size: ${iconSize}px;">⏱️</div>`;
            nameText = 'Récemment ouvert';
            const count = recentHistory.length;
            countText = `${count} élément${count > 1 ? 's' : ''}`;
            div.dataset.folderId = tile.folderId;
        } else {
            // Utiliser l'icône personnalisée si elle existe, sinon l'icône du dossier
            let folderIcon = getFolderIcon(tile.folderId);
            
            // Si icône personnalisée définie et en cache
            if (tile.customIcon) {
                const cachedIcon = localStorage.getItem(`tile_icon_${index}`);
                if (cachedIcon) {
                    folderIcon = cachedIcon;
                }
            }
            
            iconHtml = folderIcon 
                ? `<div class="home-tile-icon" style="font-size: ${iconSize}px;"><img src="${folderIcon}" alt="${tile.folderId}" style="width: ${iconSize}px; height: ${iconSize}px;"></div>`
                : `<div class="home-tile-icon" style="font-size: ${iconSize}px;">📁</div>`;
            nameText = tile.folderId || 'Dossier';
            
            // Compter les raccourcis dans ce dossier (support multi-folders)
            const count = allShortcuts ? allShortcuts.filter(s => {
                const sfolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
                return sfolders.some(f => f === tile.folderId || f.startsWith(tile.folderId + '/'));
            }).length : 0;
            countText = `${count} élément${count > 1 ? 's' : ''}`;
            div.dataset.folderId = tile.folderId;
        }
    }
    
    // Générer le style du texte personnalisé
    // Utiliser le HTML riche si disponible, sinon texte personnalisé ou nom par défaut
    const displayContent = richTextHtml || customText || nameText;
    let textStyle = `font-size: ${fontSize}px; font-family: ${fontFamily}; text-align: ${textAlign};`;
    if (textOffsetX || textOffsetY) textStyle += ` transform: translate(${textOffsetX}px, ${textOffsetY}px);`;
    
    // Appliquer les effets de texte
    let textShadows = [];
    if (effects.shadow?.enabled) {
        const s = effects.shadow;
        textShadows.push(`${s.x || 2}px ${s.y || 2}px ${s.blur || 4}px ${s.color || '#000000'}`);
    }
    if (effects.glow?.enabled) {
        const g = effects.glow;
        for (let i = 1; i <= (g.intensity || 2); i++) {
            textShadows.push(`0 0 ${(g.size || 10) * i / (g.intensity || 2)}px ${g.color || '#ffffff'}`);
        }
    }
    if (textShadows.length > 0) textStyle += ` text-shadow: ${textShadows.join(', ')};`;
    if (effects.outline?.enabled) {
        const o = effects.outline;
        textStyle += ` -webkit-text-stroke: ${o.width || 1}px ${o.color || '#000000'};`;
    }
    
    div.innerHTML = `
        ${showIcon ? iconHtml : ''}
        ${showName ? `<div class="home-tile-name" style="${textStyle}">${displayContent}</div>` : ''}
        ${showCount ? `<div class="home-tile-count" style="font-size: ${Math.max(fontSize - 2, 10)}px;">${countText}</div>` : ''}
        <div class="tile-edit-btn" onclick="event.stopPropagation(); openTileEditModal(${index})">✏️</div>
        <div class="tile-delete-btn" onclick="event.stopPropagation(); deleteDashboardTile(${index})">🗑️</div>
        <div class="tile-resize-handle tile-resize-se"></div>
        <div class="tile-resize-handle tile-resize-e"></div>
        <div class="tile-resize-handle tile-resize-s"></div>
    `;
    
    // Configurer le fallback pour l'icône des tuiles shortcut
    const iconImg = div.querySelector('.home-tile-icon img[data-fallback]');
    if (iconImg) {
        setupIconWithFallback(iconImg, iconImg.dataset.fallback);
    }
    
    // Click pour naviguer ou lancer
    div.addEventListener('click', handleTileClick);
    
    function handleTileClick(e) {
        if (isDashboardEditMode) return;
        if (e.target.closest('.tile-edit-btn') || e.target.closest('.tile-delete-btn')) return;
        
        if (tile.type === 'shortcut') {
            // Lancer le raccourci
            const shortcut = allShortcuts?.find(s => s.name === tile.shortcutName);
            if (shortcut) {
                window.pywebview.api.openShortcut(shortcut.path, shortcut.openInApp, shortcut.name);
            }
        } else {
            navigateToFolder(tile.folderId);
        }
    }
    
    // Menu contextuel sur la tuile
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDashboardEditMode) return;
        showTileContextMenu(e, tile, index, allShortcuts);
    });
    
    return div;
}

// Variables pour le drag & resize
let activeTile = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isResizing = false;
let resizeDirection = '';
let initialWidth = 0;
let initialHeight = 0;
let initialX = 0;
let initialY = 0;

function setupTileDragAndResize() {
    const tilesContainer = document.getElementById('homeTilesContainer');
    
    tilesContainer.querySelectorAll('.home-tile').forEach(tile => {
        // Drag pour déplacer
        tile.addEventListener('mousedown', (e) => {
            if (!isDashboardEditMode) return;
            
            // Vérifier si c'est un handle de resize
            const resizeHandle = e.target.closest('.tile-resize-handle');
            if (resizeHandle) {
                isResizing = true;
                activeTile = tile;
                initialWidth = tile.offsetWidth;
                initialHeight = tile.offsetHeight;
                initialX = e.clientX;
                initialY = e.clientY;
                
                if (resizeHandle.classList.contains('tile-resize-se')) {
                    resizeDirection = 'se';
                } else if (resizeHandle.classList.contains('tile-resize-e')) {
                    resizeDirection = 'e';
                } else if (resizeHandle.classList.contains('tile-resize-s')) {
                    resizeDirection = 's';
                }
                
                e.preventDefault();
                return;
            }
            
            // Sinon c'est un drag
            if (e.target.closest('.tile-edit-btn') || e.target.closest('.tile-delete-btn')) return;
            
            activeTile = tile;
            const rect = tile.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            tile.classList.add('dragging');
            e.preventDefault();
        });
    });
    
    // Mouvement global
    document.addEventListener('mousemove', handleTileMouseMove);
    document.addEventListener('mouseup', handleTileMouseUp);
}

function handleTileMouseMove(e) {
    if (!activeTile || !isDashboardEditMode) return;
    
    const container = document.getElementById('homeTilesContainer');
    const containerRect = container.getBoundingClientRect();
    
    if (isResizing) {
        // Resize
        const deltaX = e.clientX - initialX;
        const deltaY = e.clientY - initialY;
        
        let newWidth = initialWidth;
        let newHeight = initialHeight;
        
        // Shift pour garder les proportions
        const keepRatio = e.shiftKey;
        const ratio = initialWidth / initialHeight;
        
        if (resizeDirection === 'se' || resizeDirection === 'e') {
            newWidth = Math.max(80, initialWidth + deltaX);
        }
        if (resizeDirection === 'se' || resizeDirection === 's') {
            newHeight = Math.max(80, initialHeight + deltaY);
        }
        
        if (keepRatio && resizeDirection === 'se') {
            // Garder le ratio
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                newHeight = newWidth / ratio;
            } else {
                newWidth = newHeight * ratio;
            }
        }
        
        activeTile.style.width = `${newWidth}px`;
        activeTile.style.height = `${newHeight}px`;
    } else {
        // Drag
        const newX = e.clientX - containerRect.left - dragOffsetX;
        const newY = e.clientY - containerRect.top - dragOffsetY;
        
        activeTile.style.left = `${Math.max(0, newX)}px`;
        activeTile.style.top = `${Math.max(0, newY)}px`;
    }
}

function handleTileMouseUp(e) {
    if (!activeTile) return;
    
    const index = parseInt(activeTile.dataset.index);
    const layout = getCurrentDashboardLayout();
    
    if (isResizing) {
        // Sauvegarder la nouvelle taille
        if (layout.tiles[index]) {
            layout.tiles[index].width = activeTile.offsetWidth;
            layout.tiles[index].height = activeTile.offsetHeight;
            saveAllDashboardLayouts();
        }
        isResizing = false;
        resizeDirection = '';
    } else {
        // Sauvegarder la nouvelle position
        activeTile.classList.remove('dragging');
        if (layout.tiles[index]) {
            layout.tiles[index].x = parseInt(activeTile.style.left);
            layout.tiles[index].y = parseInt(activeTile.style.top);
            saveAllDashboardLayouts();
        }
    }
    
    activeTile = null;
}

// Convertir hex en rgba
function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Mode édition du dashboard
function toggleDashboardEditMode() {
    isDashboardEditMode = !isDashboardEditMode;
    const homeScreen = document.getElementById('homeScreen');
    const addBtn = document.getElementById('addHomeTileBtn');
    const saveBtn = document.getElementById('saveHomeBtn');
    const editBtn = document.getElementById('editHomeBtn');
    
    if (isDashboardEditMode) {
        homeScreen.classList.add('edit-mode');
        addBtn.classList.remove('hidden');
        saveBtn.classList.remove('hidden');
        editBtn.classList.add('hidden');
    } else {
        homeScreen.classList.remove('edit-mode');
        addBtn.classList.add('hidden');
        saveBtn.classList.add('hidden');
        editBtn.classList.remove('hidden');
        saveAllDashboardLayouts();
    }
    
    renderItems();
}

function updateDashboardEditButton() {
    const editBtn = document.getElementById('editHomeBtn');
    if (editBtn) {
        editBtn.classList.toggle('active', isDashboardEditMode);
    }
}

// Gestion du drag des tuiles
// Anciennes fonctions handleTileDragStart et handleTileDragEnd supprimées
// On utilise maintenant handleTileMouseDown/Move/Up avec positionnement absolu

// Fonction pour appliquer la visibilité des options selon le thème
function applyTileOptionsVisibility() {
    const modal = document.getElementById('tileModal');
    if (!modal) return;
    
    // Récupérer les éléments à afficher/masquer
    const sections = {
        showName: modal.querySelector('#tileShowName')?.closest('.checkbox-label'),
        showCount: modal.querySelector('#tileShowCount')?.closest('.checkbox-label'),
        textCustomization: modal.querySelector('#textCustomizationSection'),
        border: modal.querySelector('#tileShowBorder')?.closest('.form-group'),
        background: modal.querySelector('#tileBackgroundImage')?.closest('.form-group'),
        color: modal.querySelector('#tileColor')?.closest('.form-group'),
        iconSize: modal.querySelector('#tileIconSize')?.closest('.form-group'),
        borderRadius: modal.querySelector('#tileBorderRadius')?.closest('.form-group')
    };
    
    // Appliquer la visibilité
    for (const [key, element] of Object.entries(sections)) {
        if (element) {
            const isVisible = tileOptionsVisibility[key] !== false;
            element.style.display = isVisible ? '' : 'none';
        }
    }
}

// Modal d'édition de tuile
function openTileEditModal(index) {
    const layout = getCurrentDashboardLayout();
    const tile = layout.tiles[index];
    if (!tile) return;
    
    const modal = document.getElementById('tileModal');
    modal.dataset.tileIndex = index;
    
    // Vérifier si c'est une tuile du dossier "Récemment ouvert"
    const isRecentTile = tile.folderId === RECENT_FOLDER;
    if (isRecentTile) {
        modal.dataset.isRecentTile = 'true';
    } else {
        delete modal.dataset.isRecentTile;
    }
    
    // Définir la couleur
    const colorInput = document.getElementById('tileColor');
    if (colorInput) {
        colorInput.value = tile.color || '#3498db';
    }
    
    // Définir l'opacité
    const opacityInput = document.getElementById('tileOpacity');
    if (opacityInput) {
        opacityInput.value = tile.opacity !== undefined ? tile.opacity : 100;
    }
    
    // Définir la taille de l'icône (slider + input)
    const iconSizeSlider = document.getElementById('tileIconSize');
    const iconSizeInput = document.getElementById('tileIconSizeInput');
    const iconSize = tile.iconSize || 64;
    if (iconSizeSlider) iconSizeSlider.value = iconSize;
    if (iconSizeInput) iconSizeInput.value = iconSize;
    
    // Définir la taille du texte (slider avec valeur affichée)
    const fontSizeSlider = document.getElementById('tileFontSizeSlider');
    const fontSizeVal = document.getElementById('tileFontSizeVal');
    const fontSize = tile.fontSize || 14;
    if (fontSizeSlider) fontSizeSlider.value = fontSize;
    if (fontSizeVal) fontSizeVal.textContent = fontSize;
    
    // Définir les sliders de position du texte
    const textOffsetX = document.getElementById('tileTextOffsetX');
    const textOffsetXVal = document.getElementById('tileTextOffsetXVal');
    const textOffsetY = document.getElementById('tileTextOffsetY');
    const textOffsetYVal = document.getElementById('tileTextOffsetYVal');
    const offsetX = tile.textOffsetX || 0;
    const offsetY = tile.textOffsetY || 0;
    if (textOffsetX) textOffsetX.value = offsetX;
    if (textOffsetXVal) textOffsetXVal.textContent = offsetX;
    if (textOffsetY) textOffsetY.value = offsetY;
    if (textOffsetYVal) textOffsetYVal.textContent = offsetY;
    
    // Définir l'arrondi des coins (slider + input)
    const borderRadiusSlider = document.getElementById('tileBorderRadius');
    const borderRadiusInput = document.getElementById('tileBorderRadiusInput');
    const borderRadius = tile.borderRadius !== undefined ? tile.borderRadius : 12;
    if (borderRadiusSlider) borderRadiusSlider.value = borderRadius;
    if (borderRadiusInput) borderRadiusInput.value = borderRadius;
    
    // Définir les checkboxes
    const showIconCheck = document.getElementById('tileShowIcon');
    if (showIconCheck) showIconCheck.checked = tile.showIcon !== false;
    
    const showNameCheck = document.getElementById('tileShowName');
    if (showNameCheck) showNameCheck.checked = tile.showName !== false;
    
    const showCountCheck = document.getElementById('tileShowCount');
    if (showCountCheck) showCountCheck.checked = tile.showCount === true; // Désactivé par défaut
    
    // Options de bordure
    const showBorderCheck = document.getElementById('tileShowBorder');
    if (showBorderCheck) showBorderCheck.checked = tile.showBorder === true;
    
    const borderOptions = document.getElementById('borderOptions');
    if (borderOptions) {
        borderOptions.classList.toggle('hidden', !tile.showBorder);
    }
    
    const borderColor = document.getElementById('tileBorderColor');
    if (borderColor) borderColor.value = tile.borderColor || '#1abc9c';
    
    const borderWidthSlider = document.getElementById('tileBorderWidth');
    const borderWidthInput = document.getElementById('tileBorderWidthInput');
    const borderWidth = tile.borderWidth || 2;
    if (borderWidthSlider) borderWidthSlider.value = borderWidth;
    if (borderWidthInput) borderWidthInput.value = borderWidth;
    
    const borderStyle = document.getElementById('tileBorderStyle');
    if (borderStyle) borderStyle.value = tile.borderStyle || 'solid';
    
    // Définir l'icône personnalisée
    const iconPathInput = document.getElementById('tileIconPath');
    if (iconPathInput) {
        iconPathInput.value = tile.customIcon || '';
    }
    
    // Définir l'image de fond
    const bgImageInput = document.getElementById('tileBackgroundImage');
    if (bgImageInput) {
        bgImageInput.value = tile.backgroundImage || '';
    }
    const bgSizeSelect = document.getElementById('tileBackgroundSize');
    if (bgSizeSelect) {
        bgSizeSelect.value = tile.backgroundSize || 'cover';
    }
    
    // Options de personnalisation du texte - Éditeur riche
    const richEditor = document.getElementById('tileRichTextEditor');
    if (richEditor) {
        // Charger le contenu HTML riche ou le nom par défaut
        if (tile.richTextHtml) {
            richEditor.innerHTML = tile.richTextHtml;
        } else if (tile.customText) {
            richEditor.textContent = tile.customText;
        } else {
            // Déterminer le nom par défaut selon le type de tuile
            let defaultName = '';
            if (tile.type === 'shortcut') {
                defaultName = tile.shortcutName || 'Raccourci';
            } else if (tile.folderId === RECENT_FOLDER) {
                defaultName = 'Récemment ouvert';
            } else {
                defaultName = tile.folderId || 'Dossier';
            }
            richEditor.textContent = defaultName;
        }
    }
    
    const fontFamilySelect = document.getElementById('tileFontFamily');
    if (fontFamilySelect) fontFamilySelect.value = tile.fontFamily || 'inherit';
    
    const textOffsetXInput = document.getElementById('tileTextOffsetX');
    if (textOffsetXInput) textOffsetXInput.value = tile.textOffsetX || 0;
    
    const textOffsetYInput = document.getElementById('tileTextOffsetY');
    if (textOffsetYInput) textOffsetYInput.value = tile.textOffsetY || 0;
    
    const textAlignSelect = document.getElementById('tileTextAlign');
    if (textAlignSelect) textAlignSelect.value = tile.textAlign || 'center';
    
    // Charger les effets de texte
    loadEffectsToModal(tile.effects);
    
    // Afficher/cacher le sélecteur de dossier (caché pour Recent)
    const folderSelectSection = document.querySelector('#tileModal .form-group:has(#tileFolderSelect)');
    if (folderSelectSection) {
        folderSelectSection.style.display = isRecentTile ? 'none' : '';
    }
    
    // Sélectionner le dossier
    const folderSelect = document.getElementById('tileFolderSelect');
    if (folderSelect && !isRecentTile) {
        folderSelect.innerHTML = '';
        const rootFolders = folders.filter(f => !f.includes('/'));
        rootFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder;
            option.selected = folder === tile.folderId;
            folderSelect.appendChild(option);
        });
    }
    
    modal.classList.remove('hidden');
    
    // Appliquer la visibilité des options selon le thème
    applyTileOptionsVisibility();
}

function closeTileEditModal() {
    document.getElementById('tileModal').classList.add('hidden');
}

function selectTileSize(size) {
    const modal = document.getElementById('tileModal');
    const index = parseInt(modal.dataset.tileIndex);
    const layout = getCurrentDashboardLayout();
    
    if (layout.tiles[index]) {
        layout.tiles[index].size = size;
    }
    
    // Mettre à jour la sélection visuelle
    modal.querySelectorAll('.tile-size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === size);
    });
}

async function saveTileChanges() {
    const modal = document.getElementById('tileModal');
    const index = parseInt(modal.dataset.tileIndex);
    const isRecentTile = modal.dataset.isRecentTile === 'true';
    const layout = getCurrentDashboardLayout();
    
    // S'assurer que la tuile existe
    if (!layout.tiles) layout.tiles = [];
    while (layout.tiles.length <= index) {
        layout.tiles.push({});
    }
    
    if (layout.tiles[index] !== undefined) {
        const tile = layout.tiles[index];
        
        // Récupérer les valeurs de base
        const folderSelect = document.getElementById('tileFolderSelect');
        const colorInput = document.getElementById('tileColor');
        const opacityInput = document.getElementById('tileOpacity');
        const iconPathInput = document.getElementById('tileIconPath');
        
        // Récupérer les nouvelles valeurs (utiliser les sliders)
        const iconSizeInput = document.getElementById('tileIconSizeInput');
        const fontSizeSlider = document.getElementById('tileFontSizeSlider');
        const borderRadiusInput = document.getElementById('tileBorderRadiusInput');
        const showIconCheck = document.getElementById('tileShowIcon');
        const showNameCheck = document.getElementById('tileShowName');
        const showCountCheck = document.getElementById('tileShowCount');
        const showBorderCheck = document.getElementById('tileShowBorder');
        
        // Options de bordure avancées
        const borderColor = document.getElementById('tileBorderColor');
        const borderWidthInput = document.getElementById('tileBorderWidthInput');
        const borderStyle = document.getElementById('tileBorderStyle');
        
        // Ne pas mettre à jour le folderId pour les tuiles Recent (elles sont liées à une position)
        if (!isRecentTile && folderSelect) {
            tile.folderId = folderSelect.value;
        }
        if (colorInput) {
            tile.color = colorInput.value;
        }
        if (opacityInput) {
            tile.opacity = parseInt(opacityInput.value);
        }
        
        // Nouvelles options
        if (iconSizeInput) {
            tile.iconSize = parseInt(iconSizeInput.value);
        }
        if (fontSizeSlider) {
            tile.fontSize = parseInt(fontSizeSlider.value);
        }
        if (borderRadiusInput) {
            tile.borderRadius = parseInt(borderRadiusInput.value);
        }
        if (showIconCheck) {
            tile.showIcon = showIconCheck.checked;
        }
        if (showNameCheck) {
            tile.showName = showNameCheck.checked;
        }
        if (showCountCheck) {
            tile.showCount = showCountCheck.checked;
        }
        if (showBorderCheck) {
            tile.showBorder = showBorderCheck.checked;
        }
        
        // Options de bordure avancées
        if (borderColor) {
            tile.borderColor = borderColor.value;
        }
        if (borderWidthInput) {
            tile.borderWidth = parseInt(borderWidthInput.value);
        }
        if (borderStyle) {
            tile.borderStyle = borderStyle.value;
        }
        
        // Image de fond
        const bgImageInput = document.getElementById('tileBackgroundImage');
        const bgSizeSelect = document.getElementById('tileBackgroundSize');
        if (bgImageInput) {
            if (bgImageInput.value) {
                tile.backgroundImage = bgImageInput.value;
                tile.backgroundSize = bgSizeSelect ? bgSizeSelect.value : 'cover';
            } else {
                delete tile.backgroundImage;
                delete tile.backgroundSize;
            }
        }
        
        // Options de personnalisation du texte - Éditeur riche
        const richEditor = document.getElementById('tileRichTextEditor');
        if (richEditor) {
            const html = richEditor.innerHTML;
            const text = richEditor.textContent;
            // Sauvegarder le HTML riche s'il y a du formatage
            if (html !== text) {
                tile.richTextHtml = html;
            } else {
                delete tile.richTextHtml;
            }
            // Toujours sauvegarder le texte brut comme fallback
            if (text && text.trim()) {
                tile.customText = text;
            } else {
                delete tile.customText;
            }
        }
        
        const fontFamilySelect = document.getElementById('tileFontFamily');
        if (fontFamilySelect) tile.fontFamily = fontFamilySelect.value;
        
        const textOffsetXInput = document.getElementById('tileTextOffsetX');
        if (textOffsetXInput) tile.textOffsetX = parseInt(textOffsetXInput.value) || 0;
        
        const textOffsetYInput = document.getElementById('tileTextOffsetY');
        if (textOffsetYInput) tile.textOffsetY = parseInt(textOffsetYInput.value) || 0;
        
        const textAlignSelect = document.getElementById('tileTextAlign');
        if (textAlignSelect) tile.textAlign = textAlignSelect.value;
        
        // Sauvegarder les effets de texte
        tile.effects = {
            shadow: {
                enabled: document.getElementById('effectShadow')?.checked || false,
                x: parseInt(document.getElementById('shadowX')?.value) || 2,
                y: parseInt(document.getElementById('shadowY')?.value) || 2,
                blur: parseInt(document.getElementById('shadowBlur')?.value) || 4,
                color: document.getElementById('shadowColor')?.value || '#000000'
            },
            glow: {
                enabled: document.getElementById('effectGlow')?.checked || false,
                size: parseInt(document.getElementById('glowSize')?.value) || 10,
                intensity: parseInt(document.getElementById('glowIntensity')?.value) || 2,
                color: document.getElementById('glowColor')?.value || '#ffffff'
            },
            outline: {
                enabled: document.getElementById('effectOutline')?.checked || false,
                width: parseInt(document.getElementById('outlineWidth')?.value) || 1,
                color: document.getElementById('outlineColor')?.value || '#000000'
            }
        };
        
        if (iconPathInput && iconPathInput.value) {
            tile.customIcon = iconPathInput.value;
            // Charger et mettre en cache l'icône
            try {
                const iconData = await window.pywebview.api.getIconForPath(iconPathInput.value);
                if (iconData) {
                    localStorage.setItem(`tile_icon_${index}`, iconData);
                }
            } catch (err) {
                console.error('Erreur chargement icône:', err);
            }
        } else if (iconPathInput && !iconPathInput.value) {
            // Supprimer l'icône personnalisée
            delete tile.customIcon;
            localStorage.removeItem(`tile_icon_${index}`);
        }
        
        await saveAllDashboardLayouts();
        renderItems();
    }
    
    // Nettoyer le flag isRecentTile
    delete modal.dataset.isRecentTile;
    closeTileEditModal();
}

async function deleteDashboardTile(index) {
    try {
        const confirmed = await customConfirm('Supprimer cette tuile du dashboard ?');
        if (confirmed) {
            const layout = getCurrentDashboardLayout();
            layout.tiles.splice(index, 1);
            await saveAllDashboardLayouts();
            await renderItems();
        }
    } catch (e) {
        console.error('Erreur suppression tuile:', e);
    }
}

// Variables pour le modal d'ajout
let addTileCurrentTab = 'folders';
let allShortcutsCache = [];

// Ajouter un élément au dashboard
async function addFolderToDashboard() {
    // Ouvrir le modal de sélection
    const modal = document.getElementById('addTileModal');
    if (!modal) return;
    
    // Charger tous les raccourcis
    allShortcutsCache = await window.pywebview.api.getShortcuts();
    
    // Afficher le modal
    modal.classList.remove('hidden');
    
    // Initialiser sur l'onglet dossiers
    addTileCurrentTab = 'folders';
    updateAddTileTabButtons();
    renderAddTileList();
    
    // Focus sur la recherche
    document.getElementById('addTileSearch').value = '';
    document.getElementById('addTileSearch').focus();
}

function updateAddTileTabButtons() {
    document.querySelectorAll('.add-tile-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === addTileCurrentTab);
    });
}

function renderAddTileList(filter = '') {
    const listContainer = document.getElementById('addTileList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const filterLower = filter.toLowerCase();
    
    // Éléments déjà sur le dashboard
    const layout = getCurrentDashboardLayout();
    const tiles = layout.tiles || [];
    const usedFolders = tiles.filter(t => t.type !== 'shortcut').map(t => t.folderId);
    const usedShortcuts = tiles.filter(t => t.type === 'shortcut').map(t => t.shortcutName);
    
    if (addTileCurrentTab === 'folders') {
        // Ajouter le dossier virtuel "Récemment ouvert" en premier
        if (recentHistory.length > 0) {
            const isRecentUsed = usedFolders.includes(RECENT_FOLDER);
            if (!filterLower || 'récemment ouvert'.includes(filterLower) || 'recent'.includes(filterLower)) {
                const recentDiv = document.createElement('div');
                recentDiv.className = 'add-tile-item' + (isRecentUsed ? ' already-added' : '');
                recentDiv.innerHTML = `
                    <div class="add-tile-item-icon">⏱️</div>
                    <div class="add-tile-item-info">
                        <div class="add-tile-item-name">Récemment ouvert</div>
                        <div class="add-tile-item-path">${recentHistory.length} élément${recentHistory.length > 1 ? 's' : ''}</div>
                    </div>
                    ${isRecentUsed ? '<span class="add-tile-item-badge">Déjà ajouté</span>' : ''}
                `;
                if (!isRecentUsed) {
                    recentDiv.addEventListener('click', () => addTileToDashboard('folder', RECENT_FOLDER));
                }
                listContainer.appendChild(recentDiv);
            }
        }
        
        // Afficher tous les dossiers (pas seulement racine)
        const allFolders = [...new Set(folders)].sort();
        
        allFolders.forEach(folder => {
            if (filterLower && !folder.toLowerCase().includes(filterLower)) return;
            
            const isUsed = usedFolders.includes(folder);
            const shortcutCount = allShortcutsCache.filter(s => {
                const sfolders = s.folders || (s.folder !== undefined ? [s.folder] : ['']);
                return sfolders.some(f => f === folder || f.startsWith(folder + '/'));
            }).length;
            
            const div = document.createElement('div');
            div.className = 'add-tile-item' + (isUsed ? ' already-added' : '');
            div.innerHTML = `
                <div class="add-tile-item-icon">📁</div>
                <div class="add-tile-item-info">
                    <div class="add-tile-item-name">${folder}</div>
                    <div class="add-tile-item-path">${shortcutCount} élément${shortcutCount > 1 ? 's' : ''}</div>
                </div>
                ${isUsed ? '<span class="add-tile-item-badge">Déjà ajouté</span>' : ''}
            `;
            
            if (!isUsed) {
                div.addEventListener('click', () => addTileToDashboard('folder', folder));
            }
            
            listContainer.appendChild(div);
        });
    } else {
        // Afficher tous les raccourcis (support multi-folders for display)
        allShortcutsCache.forEach(shortcut => {
            const sfolders = shortcut.folders || (shortcut.folder !== undefined ? [shortcut.folder] : ['']);
            const folderDisplay = sfolders.filter(f => f).join(', ') || 'Racine';
            if (filterLower && !shortcut.name.toLowerCase().includes(filterLower) && 
                !folderDisplay.toLowerCase().includes(filterLower)) return;
            
            const isUsed = usedShortcuts.includes(shortcut.name);
            const iconSrc = shortcut.iconData ? `data:image/png;base64,${shortcut.iconData}` : '';
            
            const div = document.createElement('div');
            div.className = 'add-tile-item' + (isUsed ? ' already-added' : '');
            div.innerHTML = `
                <div class="add-tile-item-icon">
                    ${iconSrc ? `<img src="${iconSrc}" alt="">` : '🎮'}
                </div>
                <div class="add-tile-item-info">
                    <div class="add-tile-item-name">${shortcut.name}</div>
                    <div class="add-tile-item-path">${folderDisplay}</div>
                </div>
                ${isUsed ? '<span class="add-tile-item-badge">Déjà ajouté</span>' : ''}
            `;
            
            if (!isUsed) {
                div.addEventListener('click', () => addTileToDashboard('shortcut', shortcut.name));
            }
            
            listContainer.appendChild(div);
        });
    }
    
    if (listContainer.children.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.7;">Aucun élément trouvé</div>';
    }
}

async function addTileToDashboard(type, name) {
    // Fermer le modal
    document.getElementById('addTileModal').classList.add('hidden');
    
    const layout = getCurrentDashboardLayout();
    
    // Trouver une position libre
    let newX = 20, newY = 20;
    const defaultWidth = 200, defaultHeight = 150;
    
    // Trouver la position Y la plus basse + un décalage
    layout.tiles.forEach(t => {
        const tileBottom = (t.y || 20) + (t.height || 150);
        if (tileBottom + 20 > newY) {
            newY = tileBottom + 20;
        }
    });
    
    // Si on dépasse l'écran, placer à droite de la dernière tuile
    if (newY > 600) {
        newY = 20;
        layout.tiles.forEach(t => {
            const tileRight = (t.x || 20) + (t.width || 200);
            if (tileRight + 20 > newX) {
                newX = tileRight + 20;
            }
        });
    }
    
    if (type === 'folder') {
        layout.tiles.push({
            type: 'folder',
            folderId: name,
            x: newX,
            y: newY,
            width: defaultWidth,
            height: defaultHeight
        });
    } else {
        layout.tiles.push({
            type: 'shortcut',
            shortcutName: name,
            x: newX,
            y: newY,
            width: defaultWidth,
            height: defaultHeight
        });
    }
    
    await saveAllDashboardLayouts();
    await renderItems();
}

function closeAddTileModal() {
    document.getElementById('addTileModal').classList.add('hidden');
}

// Initialiser les events du modal d'ajout
function setupAddTileModalEvents() {
    // Onglets
    document.querySelectorAll('.add-tile-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            addTileCurrentTab = btn.dataset.tab;
            updateAddTileTabButtons();
            renderAddTileList(document.getElementById('addTileSearch').value);
        });
    });
    
    // Recherche
    const searchInput = document.getElementById('addTileSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderAddTileList(searchInput.value);
        });
    }
    
    // Bouton annuler
    const cancelBtn = document.getElementById('cancelAddTile');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeAddTileModal);
    }
    
    // Bouton basculer mode dashboard
    const toggleDashboardModeBtn = document.getElementById('toggleDashboardModeBtn');
    if (toggleDashboardModeBtn) {
        toggleDashboardModeBtn.addEventListener('click', toggleFolderDashboardMode);
    }
    
    // Bouton afficher tous les éléments
    const showAllBtn = document.getElementById('showAllItemsBtn');
    if (showAllBtn) {
        showAllBtn.addEventListener('click', openAllItemsModal);
    }
    
    // Fermer modal tous les éléments
    const closeAllBtn = document.getElementById('closeAllItems');
    if (closeAllBtn) {
        closeAllBtn.addEventListener('click', () => {
            document.getElementById('allItemsModal').classList.add('hidden');
        });
    }
    
    // Fermer modal déplacer raccourci
    const cancelMoveBtn = document.getElementById('cancelMove');
    if (cancelMoveBtn) {
        cancelMoveBtn.addEventListener('click', closeMoveShortcutModal);
    }
    
    // Basculer vue arborescence / liste plate
    const toggleMoveViewBtn = document.getElementById('toggleMoveView');
    if (toggleMoveViewBtn) {
        toggleMoveViewBtn.addEventListener('click', () => {
            const tree = document.getElementById('moveFolderTree');
            const list = document.getElementById('moveFolderList');
            const modal = document.getElementById('moveShortcutModal');
            
            if (tree.classList.contains('hidden')) {
                tree.classList.remove('hidden');
                list.classList.add('hidden');
            } else {
                tree.classList.add('hidden');
                list.classList.remove('hidden');
                // Rendre la liste plate
                const currentFolder = modal.dataset.currentFolder || '';
                const moveType = modal.dataset.moveType;
                
                if (moveType === 'shortcut') {
                    const index = parseInt(modal.dataset.shortcutIndex);
                    renderMoveFlatList(currentFolder, (targetFolder) => moveShortcutToFolder(index, targetFolder));
                } else {
                    const folderPath = modal.dataset.folderPath;
                    const filteredFolders = folders.filter(f => 
                        f !== folderPath && !f.startsWith(folderPath + '/')
                    );
                    // Pour la liste plate des dossiers
                    renderMoveFlatListForFolder(currentFolder, filteredFolders, (targetFolder) => {
                        moveFolderToFolder(folderPath, targetFolder);
                    });
                }
            }
        });
    }
    
    // Créer un nouveau dossier depuis le modal de déplacement
    const createFolderInMoveBtn = document.getElementById('createFolderInMove');
    if (createFolderInMoveBtn) {
        createFolderInMoveBtn.addEventListener('click', async () => {
            const name = await customPrompt('Nom du nouveau dossier:');
            if (name && name.trim()) {
                await createNewFolder(name.trim());
                // Rafraîchir l'arborescence
                const modal = document.getElementById('moveShortcutModal');
                const currentFolder = modal.dataset.currentFolder || '';
                const moveType = modal.dataset.moveType;
                
                if (moveType === 'shortcut') {
                    const index = parseInt(modal.dataset.shortcutIndex);
                    renderMoveTree(currentFolder, (targetFolder) => moveShortcutToFolder(index, targetFolder));
                } else {
                    const folderPath = modal.dataset.folderPath;
                    const filteredFolders = folders.filter(f => 
                        f !== folderPath && !f.startsWith(folderPath + '/')
                    );
                    const parts = folderPath.split('/');
                    const currentParent = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                    renderMoveTreeForFolder(currentParent, filteredFolders, (targetFolder) => {
                        moveFolderToFolder(folderPath, targetFolder);
                    });
                }
            }
        });
    }
    
    // Recherche dans tous les éléments
    const allItemsSearch = document.getElementById('allItemsSearch');
    if (allItemsSearch) {
        allItemsSearch.addEventListener('input', () => {
            renderAllItemsList(allItemsSearch.value);
        });
    }
}

// Ouvrir le modal "Tous les éléments"
let allItemsFilter = 'all';

async function openAllItemsModal() {
    const modal = document.getElementById('allItemsModal');
    if (!modal) return;
    
    // Charger tous les raccourcis
    allShortcutsCache = await window.pywebview.api.getShortcuts();
    
    // Reset filter
    allItemsFilter = 'all';
    document.querySelectorAll('.all-items-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
    });
    
    // Setup filter buttons
    document.querySelectorAll('.all-items-filters .filter-btn').forEach(btn => {
        btn.onclick = () => {
            allItemsFilter = btn.dataset.filter;
            document.querySelectorAll('.all-items-filters .filter-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === allItemsFilter);
            });
            renderAllItemsList(document.getElementById('allItemsSearch').value);
        };
    });
    
    // Update stats
    updateAllItemsStats();
    
    modal.classList.remove('hidden');
    document.getElementById('allItemsSearch').value = '';
    document.getElementById('allItemsSearch').focus();
    renderAllItemsList('');
}

function updateAllItemsStats() {
    const statsContainer = document.getElementById('allItemsStats');
    if (!statsContainer) return;
    
    const totalShortcuts = allShortcutsCache.length;
    const totalFolders = folders.length;
    const rootShortcuts = allShortcutsCache.filter(s => !s.folder).length;
    
    statsContainer.innerHTML = `
        <div class="stat-item">📁 <span class="stat-value">${totalFolders}</span> dossier${totalFolders > 1 ? 's' : ''}</div>
        <div class="stat-item">🎮 <span class="stat-value">${totalShortcuts}</span> raccourci${totalShortcuts > 1 ? 's' : ''}</div>
        <div class="stat-item">🏠 <span class="stat-value">${rootShortcuts}</span> à la racine</div>
    `;
}

// Afficher la liste de tous les éléments
function renderAllItemsList(filter = '') {
    const listContainer = document.getElementById('allItemsList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const filterLower = filter.toLowerCase();
    
    // Combiner dossiers et raccourcis
    let items = [];
    
    // Ajouter tous les dossiers (si le filtre le permet)
    if (allItemsFilter === 'all' || allItemsFilter === 'folders') {
        folders.forEach(folder => {
            const shortcutCount = allShortcutsCache.filter(s => 
                s.folder === folder || (s.folder && s.folder.startsWith(folder + '/'))
            ).length;
            items.push({
                type: 'folder',
                name: folder.split('/').pop(),
                fullPath: folder,
                count: shortcutCount
            });
        });
    }
    
    // Ajouter tous les raccourcis (si le filtre le permet)
    if (allItemsFilter === 'all' || allItemsFilter === 'shortcuts') {
        allShortcutsCache.forEach((shortcut, index) => {
            items.push({
                type: 'shortcut',
                name: shortcut.name,
                folder: shortcut.folder || '',
                iconData: shortcut.iconData,
                path: shortcut.path,
                index: index
            });
        });
    }
    
    // Filtrer
    if (filterLower) {
        items = items.filter(item => 
            item.name.toLowerCase().includes(filterLower) ||
            (item.fullPath && item.fullPath.toLowerCase().includes(filterLower)) ||
            (item.folder && item.folder.toLowerCase().includes(filterLower))
        );
    }
    
    // Trier par nom
    items.sort((a, b) => a.name.localeCompare(b.name));
    
    // Afficher
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'add-tile-item';
        
        if (item.type === 'folder') {
            div.innerHTML = `
                <div class="add-tile-item-icon">📁</div>
                <div class="add-tile-item-info">
                    <div class="add-tile-item-name">${item.name}</div>
                    <div class="add-tile-item-path">${item.fullPath} • ${item.count} élément${item.count > 1 ? 's' : ''}</div>
                </div>
            `;
            div.addEventListener('click', () => {
                document.getElementById('allItemsModal').classList.add('hidden');
                navigateToFolder(item.fullPath);
            });
        } else {
            // Utiliser l'endpoint /icon/ pour charger l'icône
            const iconSrc = `/icon/${item.index}`;
            const isUrl = item.type === 'url' || item.path?.startsWith('http');
            const fallbackEmoji = isUrl ? '🌐' : '🎮';
            div.innerHTML = `
                <div class="add-tile-item-icon">
                    <img src="${iconSrc}" alt="" data-fallback="${fallbackEmoji}">
                </div>
                <div class="add-tile-item-info">
                    <div class="add-tile-item-name">${item.name}</div>
                    <div class="add-tile-item-path">${item.folder || 'Racine'}</div>
                </div>
            `;
            // Configurer le fallback pour l'icône
            const iconImg = div.querySelector('img');
            if (iconImg) setupIconWithFallback(iconImg, fallbackEmoji);
            
            div.addEventListener('click', () => {
                document.getElementById('allItemsModal').classList.add('hidden');
                // Naviguer vers le dossier du raccourci et le lancer
                if (item.folder) {
                    navigateToFolder(item.folder);
                }
                window.pywebview.api.openShortcut(item.path, item.openInApp, item.name);
            });
        }
        
        listContainer.appendChild(div);
    });
    
    if (items.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.7;">Aucun élément trouvé</div>';
    }
}

// Initialiser les events du dashboard
function setupDashboardEvents() {
    const homeScreen = document.getElementById('homeScreen');
    if (!homeScreen) return;
    
    // Bouton édition
    const editBtn = document.getElementById('editHomeBtn');
    if (editBtn) {
        editBtn.addEventListener('click', toggleDashboardEditMode);
    }
    
    // Bouton ajouter une tuile
    const addBtn = document.getElementById('addHomeTileBtn');
    if (addBtn) {
        addBtn.addEventListener('click', addFolderToDashboard);
    }
    
    // Bouton terminer/sauvegarder
    const saveBtn = document.getElementById('saveHomeBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', toggleDashboardEditMode);
    }
    
    // Modal d'édition de tuile
    const modal = document.getElementById('tileModal');
    if (modal) {
        // Fermer le modal
        const cancelBtn = document.getElementById('cancelTile');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeTileEditModal);
        }
        
        // Sauvegarder les changements
        const saveModalBtn = document.getElementById('saveTile');
        if (saveModalBtn) {
            saveModalBtn.addEventListener('click', saveTileChanges);
        }
        
        // Supprimer la tuile
        const deleteBtn = document.getElementById('deleteTile');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                const index = parseInt(modal.dataset.tileIndex);
                closeTileEditModal();
                deleteDashboardTile(index);
            });
        }
        
        // Bouton parcourir icône
        const browseIconBtn = document.getElementById('browseTileIcon');
        if (browseIconBtn) {
            browseIconBtn.addEventListener('click', async () => {
                const result = await pywebview.api.browseFile(['*.ico', '*.png', '*.jpg', '*.jpeg', '*.bmp']);
                if (result) {
                    const iconInput = document.getElementById('tileIconPath');
                    if (iconInput) {
                        iconInput.value = result;
                    }
                }
            });
        }
        
        // Bouton parcourir image de fond
        const browseBgBtn = document.getElementById('browseTileBackground');
        if (browseBgBtn) {
            browseBgBtn.addEventListener('click', async () => {
                const result = await pywebview.api.browseFile(['*.png', '*.jpg', '*.jpeg', '*.bmp', '*.gif', '*.webp']);
                if (result) {
                    const bgInput = document.getElementById('tileBackgroundImage');
                    if (bgInput) {
                        bgInput.value = result;
                        updateTilePreview();
                    }
                }
            });
        }
        
        // Image de fond - aperçu dynamique
        const bgImageInput = document.getElementById('tileBackgroundImage');
        if (bgImageInput) {
            bgImageInput.addEventListener('input', updateTilePreview);
        }
        const bgSizeSelect = document.getElementById('tileBackgroundSize');
        if (bgSizeSelect) {
            bgSizeSelect.addEventListener('change', updateTilePreview);
        }
        
        // Fonction pour synchroniser slider et input
        function syncSliderInput(sliderId, inputId) {
            const slider = document.getElementById(sliderId);
            const input = document.getElementById(inputId);
            if (slider && input) {
                slider.addEventListener('input', () => {
                    input.value = slider.value;
                    updateTilePreview();
                });
                input.addEventListener('input', () => {
                    slider.value = input.value;
                    updateTilePreview();
                });
            }
        }
        
        // Fonction pour slider avec affichage de valeur (sans input)
        function setupSliderWithDisplay(sliderId, displayId) {
            const slider = document.getElementById(sliderId);
            const display = document.getElementById(displayId);
            if (slider) {
                slider.addEventListener('input', () => {
                    if (display) display.textContent = slider.value;
                    updateTilePreview();
                });
            }
        }
        
        // Synchroniser tous les sliders avec leurs inputs
        syncSliderInput('tileIconSize', 'tileIconSizeInput');
        syncSliderInput('tileBorderRadius', 'tileBorderRadiusInput');
        syncSliderInput('tileBorderWidth', 'tileBorderWidthInput');
        
        // Taille de texte et position - sliders avec affichage de valeur
        setupSliderWithDisplay('tileFontSizeSlider', 'tileFontSizeVal');
        setupSliderWithDisplay('tileTextOffsetX', 'tileTextOffsetXVal');
        setupSliderWithDisplay('tileTextOffsetY', 'tileTextOffsetYVal');
        
        // Couleur et opacité - aperçu dynamique
        const tileColor = document.getElementById('tileColor');
        if (tileColor) {
            tileColor.addEventListener('input', updateTilePreview);
        }
        
        const tileOpacity = document.getElementById('tileOpacity');
        if (tileOpacity) {
            tileOpacity.addEventListener('input', updateTilePreview);
        }
        
        // Checkbox bordure - afficher/cacher options
        const showBorderCheck = document.getElementById('tileShowBorder');
        const borderOptions = document.getElementById('borderOptions');
        if (showBorderCheck && borderOptions) {
            showBorderCheck.addEventListener('change', () => {
                borderOptions.classList.toggle('hidden', !showBorderCheck.checked);
                updateTilePreview();
            });
        }
        
        // Options de bordure - aperçu dynamique
        ['tileBorderColor', 'tileBorderStyle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateTilePreview);
                el.addEventListener('change', updateTilePreview);
            }
        });
        
        // Checkboxes - aperçu dynamique
        ['tileShowIcon', 'tileShowName', 'tileShowCount'].forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', updateTilePreview);
            }
        });
        
        // Éditeur de texte riche - toolbar
        setupRichTextToolbar();
        
        // Éditeur de texte riche - aperçu dynamique
        const richEditor = document.getElementById('tileRichTextEditor');
        if (richEditor) {
            richEditor.addEventListener('input', updateTilePreview);
        }
        
        // Options de personnalisation du texte - aperçu dynamique
        ['tileFontFamily', 'tileTextOffsetX', 'tileTextOffsetY', 'tileTextAlign'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateTilePreview);
                el.addEventListener('change', updateTilePreview);
            }
        });
    }
    
    // Rendre toutes les fenêtres modales déplaçables
    setupDraggableModals();
    
    // Events de souris pour drag et resize des tuiles (sur le conteneur)
    const tilesContainer = document.getElementById('homeTilesContainer');
    if (tilesContainer) {
        document.addEventListener('mousemove', handleTileMouseMove);
        document.addEventListener('mouseup', handleTileMouseUp);
    }
}

// Configuration de la toolbar de l'éditeur riche
function setupRichTextToolbar() {
    const modal = document.getElementById('tileModal');
    if (!modal) return;
    
    // Écouter tous les boutons rich-btn dans le modal (pas seulement la toolbar)
    modal.querySelectorAll('.rich-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            const editor = document.getElementById('tileRichTextEditor');
            
            if (!editor) return;
            editor.focus();
            
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            
            switch (cmd) {
                case 'bold':
                    document.execCommand('bold', false, null);
                    break;
                case 'italic':
                    document.execCommand('italic', false, null);
                    break;
                case 'underline':
                    document.execCommand('underline', false, null);
                    break;
                case 'strikethrough':
                    document.execCommand('strikeThrough', false, null);
                    break;
                case 'applyColor':
                    const textColor = document.getElementById('richTextColor')?.value || '#ffffff';
                    document.execCommand('foreColor', false, textColor);
                    break;
                case 'highlight':
                    const bgColor = document.getElementById('richBgColor')?.value || '#ffff00';
                    document.execCommand('hiliteColor', false, bgColor);
                    break;
                case 'applyShadow':
                    applyInlineEffect('shadow');
                    break;
                case 'applyGlow':
                    applyInlineEffect('glow');
                    break;
                case 'applyOutline':
                    applyInlineEffect('outline');
                    break;
                case 'applyFont':
                    applyInlineStyle('fontFamily');
                    break;
                case 'applySize':
                    applyInlineStyle('fontSize');
                    break;
                case 'clear':
                    document.execCommand('removeFormat', false, null);
                    // Nettoyer aussi les spans avec styles inline
                    const content = editor.textContent;
                    editor.textContent = content;
                    break;
            }
            
            updateTilePreview();
        });
    });
    
    // Couleur du texte
    const textColorInput = document.getElementById('richTextColor');
    if (textColorInput) {
        textColorInput.addEventListener('input', () => {
            document.execCommand('foreColor', false, textColorInput.value);
            updateTilePreview();
        });
    }
    
    // Setup des contrôles d'effets avec sliders
    setupEffectControls();
}

// Configuration des contrôles d'effets (ombre, lumière, contour)
function setupEffectControls() {
    // Effet Ombre
    const shadowCheck = document.getElementById('effectShadow');
    const shadowSliders = document.getElementById('shadowSliders');
    if (shadowCheck && shadowSliders) {
        shadowCheck.addEventListener('change', () => {
            shadowSliders.classList.toggle('active', shadowCheck.checked);
            applyTextEffects();
        });
        
        ['shadowX', 'shadowY', 'shadowBlur', 'shadowColor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateSliderValue(el);
                    applyTextEffects();
                });
            }
        });
    }
    
    // Effet Lumière
    const glowCheck = document.getElementById('effectGlow');
    const glowSliders = document.getElementById('glowSliders');
    if (glowCheck && glowSliders) {
        glowCheck.addEventListener('change', () => {
            glowSliders.classList.toggle('active', glowCheck.checked);
            applyTextEffects();
        });
        
        ['glowSize', 'glowIntensity', 'glowColor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateSliderValue(el);
                    applyTextEffects();
                });
            }
        });
    }
    
    // Effet Contour
    const outlineCheck = document.getElementById('effectOutline');
    const outlineSliders = document.getElementById('outlineSliders');
    if (outlineCheck && outlineSliders) {
        outlineCheck.addEventListener('change', () => {
            outlineSliders.classList.toggle('active', outlineCheck.checked);
            applyTextEffects();
        });
        
        ['outlineWidth', 'outlineColor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateSliderValue(el);
                    applyTextEffects();
                });
            }
        });
    }
}

// Mettre à jour l'affichage de la valeur du slider
function updateSliderValue(slider) {
    const valueSpan = slider.parentElement?.querySelector('.slider-val');
    if (valueSpan && slider.type === 'range') {
        valueSpan.textContent = slider.value;
    }
}

// Appliquer les effets de texte sur l'éditeur riche
function applyTextEffects() {
    const editor = document.getElementById('tileRichTextEditor');
    if (!editor) return;
    
    let textShadows = [];
    let textStroke = '';
    
    // Effet Ombre
    if (document.getElementById('effectShadow')?.checked) {
        const x = document.getElementById('shadowX')?.value || 2;
        const y = document.getElementById('shadowY')?.value || 2;
        const blur = document.getElementById('shadowBlur')?.value || 4;
        const color = document.getElementById('shadowColor')?.value || '#000000';
        textShadows.push(`${x}px ${y}px ${blur}px ${color}`);
    }
    
    // Effet Lumière
    if (document.getElementById('effectGlow')?.checked) {
        const size = document.getElementById('glowSize')?.value || 10;
        const intensity = document.getElementById('glowIntensity')?.value || 2;
        const color = document.getElementById('glowColor')?.value || '#ffffff';
        for (let i = 1; i <= intensity; i++) {
            textShadows.push(`0 0 ${size * i / intensity}px ${color}`);
        }
    }
    
    // Effet Contour
    if (document.getElementById('effectOutline')?.checked) {
        const width = document.getElementById('outlineWidth')?.value || 1;
        const color = document.getElementById('outlineColor')?.value || '#000000';
        textStroke = `${width}px ${color}`;
    }
    
    // Appliquer les styles
    editor.style.textShadow = textShadows.length > 0 ? textShadows.join(', ') : '';
    editor.style.webkitTextStroke = textStroke;
    
    updateTilePreview();
}

// Appliquer un effet sur la sélection (par caractère)
function applyInlineEffect(effectType) {
    const editor = document.getElementById('tileRichTextEditor');
    if (!editor) return;
    
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
        alert('Sélectionnez du texte pour appliquer cet effet');
        return;
    }
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;
    
    let style = '';
    
    switch (effectType) {
        case 'shadow': {
            const x = document.getElementById('shadowX')?.value || 2;
            const y = document.getElementById('shadowY')?.value || 2;
            const blur = document.getElementById('shadowBlur')?.value || 4;
            const color = document.getElementById('shadowColor')?.value || '#000000';
            style = `text-shadow: ${x}px ${y}px ${blur}px ${color};`;
            break;
        }
        case 'glow': {
            const size = document.getElementById('glowSize')?.value || 10;
            const intensity = document.getElementById('glowIntensity')?.value || 2;
            const color = document.getElementById('glowColor')?.value || '#ffffff';
            let shadows = [];
            for (let i = 1; i <= intensity; i++) {
                shadows.push(`0 0 ${size * i / intensity}px ${color}`);
            }
            style = `text-shadow: ${shadows.join(', ')};`;
            break;
        }
        case 'outline': {
            const width = document.getElementById('outlineWidth')?.value || 1;
            const color = document.getElementById('outlineColor')?.value || '#000000';
            style = `-webkit-text-stroke: ${width}px ${color};`;
            break;
        }
    }
    
    // Créer un span avec le style
    const span = document.createElement('span');
    span.style.cssText = style;
    span.textContent = selectedText;
    
    // Remplacer la sélection
    range.deleteContents();
    range.insertNode(span);
    
    // Repositionner le curseur après le span
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    selection.addRange(newRange);
    
    updateTilePreview();
}

// Appliquer un style (police/taille) sur la sélection
function applyInlineStyle(styleType) {
    const editor = document.getElementById('tileRichTextEditor');
    if (!editor) return;
    
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
        alert('Sélectionnez du texte pour appliquer ce style');
        return;
    }
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;
    
    let style = '';
    
    switch (styleType) {
        case 'fontFamily': {
            const fontFamily = document.getElementById('tileFontFamily')?.value || 'inherit';
            style = `font-family: ${fontFamily};`;
            break;
        }
        case 'fontSize': {
            const fontSize = document.getElementById('tileFontSizeSlider')?.value || 14;
            style = `font-size: ${fontSize}px;`;
            break;
        }
    }
    
    // Créer un span avec le style
    const span = document.createElement('span');
    span.style.cssText = style;
    span.textContent = selectedText;
    
    // Remplacer la sélection
    range.deleteContents();
    range.insertNode(span);
    
    // Repositionner le curseur après le span
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    selection.addRange(newRange);
    
    updateTilePreview();
}

// Charger les effets dans le modal
function loadEffectsToModal(effects) {
    const defaults = {
        shadow: { enabled: false, x: 2, y: 2, blur: 4, color: '#000000' },
        glow: { enabled: false, size: 10, intensity: 2, color: '#ffffff' },
        outline: { enabled: false, width: 1, color: '#000000' }
    };
    
    const e = effects || defaults;
    
    // Ombre
    const shadowCheck = document.getElementById('effectShadow');
    const shadowSliders = document.getElementById('shadowSliders');
    if (shadowCheck) {
        shadowCheck.checked = e.shadow?.enabled || false;
        shadowSliders?.classList.toggle('active', shadowCheck.checked);
    }
    setSliderValue('shadowX', e.shadow?.x ?? 2);
    setSliderValue('shadowY', e.shadow?.y ?? 2);
    setSliderValue('shadowBlur', e.shadow?.blur ?? 4);
    setColorValue('shadowColor', e.shadow?.color || '#000000');
    
    // Lumière
    const glowCheck = document.getElementById('effectGlow');
    const glowSliders = document.getElementById('glowSliders');
    if (glowCheck) {
        glowCheck.checked = e.glow?.enabled || false;
        glowSliders?.classList.toggle('active', glowCheck.checked);
    }
    setSliderValue('glowSize', e.glow?.size ?? 10);
    setSliderValue('glowIntensity', e.glow?.intensity ?? 2);
    setColorValue('glowColor', e.glow?.color || '#ffffff');
    
    // Contour
    const outlineCheck = document.getElementById('effectOutline');
    const outlineSliders = document.getElementById('outlineSliders');
    if (outlineCheck) {
        outlineCheck.checked = e.outline?.enabled || false;
        outlineSliders?.classList.toggle('active', outlineCheck.checked);
    }
    setSliderValue('outlineWidth', e.outline?.width ?? 1);
    setColorValue('outlineColor', e.outline?.color || '#000000');
    
    // Appliquer les effets visuellement
    applyTextEffects();
}

function setSliderValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.value = value;
        updateSliderValue(el);
    }
}

function setColorValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

// Wrapper la sélection avec un style inline
function wrapSelectionWithStyle(style) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.cssText = style;
    
    try {
        range.surroundContents(span);
    } catch (e) {
        // Si la sélection traverse plusieurs éléments, cloner le contenu
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
    }
    
    selection.removeAllRanges();
}

// Fonction pour mettre à jour l'aperçu de la tuile en temps réel
function updateTilePreview() {
    const modal = document.getElementById('tileModal');
    if (!modal || modal.classList.contains('hidden')) return;
    
    const index = parseInt(modal.dataset.tileIndex);
    if (isNaN(index)) return;
    
    // Trouver la tuile
    const tile = document.querySelector(`.home-tile[data-index="${index}"]`);
    if (!tile) return;
    
    // Appliquer les changements visuels
    const iconSize = document.getElementById('tileIconSizeInput')?.value || 64;
    const fontSize = document.getElementById('tileFontSizeSlider')?.value || 14;
    const borderRadius = document.getElementById('tileBorderRadiusInput')?.value || 12;
    const color = document.getElementById('tileColor')?.value || '#3498db';
    const opacity = document.getElementById('tileOpacity')?.value || 100;
    const showIcon = document.getElementById('tileShowIcon')?.checked ?? true;
    const showName = document.getElementById('tileShowName')?.checked ?? true;
    const showCount = document.getElementById('tileShowCount')?.checked ?? false;
    const showBorder = document.getElementById('tileShowBorder')?.checked ?? false;
    
    // Options de bordure avancées
    const borderColor = document.getElementById('tileBorderColor')?.value || '#1abc9c';
    const borderWidth = document.getElementById('tileBorderWidthInput')?.value || 2;
    const borderStyle = document.getElementById('tileBorderStyle')?.value || 'solid';
    
    // Appliquer le style
    tile.style.borderRadius = `${borderRadius}px`;
    tile.style.backgroundColor = hexToRgba(color, opacity / 100);
    
    // Image de fond
    const bgImage = document.getElementById('tileBackgroundImage')?.value || '';
    const bgSize = document.getElementById('tileBackgroundSize')?.value || 'cover';
    if (bgImage) {
        if (bgImage.startsWith('http') || bgImage.startsWith('data:')) {
            tile.style.backgroundImage = `url('${bgImage}')`;
        } else {
            tile.style.backgroundImage = `url('/file/${encodeURIComponent(bgImage)}')`;
        }
        tile.style.backgroundSize = bgSize;
        tile.style.backgroundPosition = 'center';
        tile.style.backgroundRepeat = 'no-repeat';
    } else {
        tile.style.backgroundImage = '';
    }
    
    // Bordure avancée
    if (showBorder) {
        tile.style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
    } else {
        tile.style.border = 'none';
    }
    
    // Icône
    const icon = tile.querySelector('.home-tile-icon');
    if (icon) {
        icon.style.display = showIcon ? '' : 'none';
        icon.style.fontSize = `${iconSize}px`;
        const img = icon.querySelector('img');
        if (img) {
            img.style.width = `${iconSize}px`;
            img.style.height = `${iconSize}px`;
        }
    }
    
    // Nom
    const name = tile.querySelector('.home-tile-name');
    if (name) {
        name.style.display = showName ? '' : 'none';
        name.style.fontSize = `${fontSize}px`;
        
        // Options de personnalisation du texte
        const richEditor = document.getElementById('tileRichTextEditor');
        const richHtml = richEditor?.innerHTML || '';
        const fontFamily = document.getElementById('tileFontFamily')?.value || 'inherit';
        const textOffsetX = document.getElementById('tileTextOffsetX')?.value || 0;
        const textOffsetY = document.getElementById('tileTextOffsetY')?.value || 0;
        const textAlign = document.getElementById('tileTextAlign')?.value || 'center';
        
        // Appliquer les styles globaux
        name.style.fontFamily = fontFamily;
        name.style.textAlign = textAlign;
        name.style.transform = (textOffsetX || textOffsetY) ? `translate(${textOffsetX}px, ${textOffsetY}px)` : '';
        
        // Appliquer le contenu HTML riche si modifié
        if (richHtml && richHtml.trim()) {
            name.innerHTML = richHtml;
        }
    }
    
    // Compteur
    const count = tile.querySelector('.home-tile-count');
    if (count) {
        count.style.display = showCount ? '' : 'none';
        count.style.fontSize = `${Math.max(fontSize - 2, 10)}px`;
    }
}

// Rendre les modals déplaçables et redimensionnables
function setupDraggableModals() {
    document.querySelectorAll('.modal-content').forEach(modal => {
        // Éviter la double initialisation
        if (modal.dataset.draggableInit) return;
        modal.dataset.draggableInit = 'true';
        
        const header = modal.querySelector('.modal-header') || modal.querySelector('h3');
        if (!header) return;
        
        let isDragging = false;
        let isResizing = false;
        let startX, startY, initialX, initialY, initialW, initialH;
        let resizeDirection = '';
        
        // Ajouter les poignées de redimensionnement
        const resizeHandles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
        resizeHandles.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `modal-resize-handle modal-resize-${dir}`;
            handle.dataset.direction = dir;
            modal.appendChild(handle);
        });
        
        // Fonction pour initialiser la position fixe
        function initFixedPosition() {
            if (!modal.style.position || modal.style.position === 'relative') {
                const rect = modal.getBoundingClientRect();
                modal.style.position = 'fixed';
                modal.style.left = `${rect.left}px`;
                modal.style.top = `${rect.top}px`;
                modal.style.width = `${rect.width}px`;
                modal.style.margin = '0';
                modal.style.transform = 'none';
            }
        }
        
        // Drag sur le header
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.modal-close-btn') || e.target.closest('button') || e.target.closest('input')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            initFixedPosition();
            const rect = modal.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            modal.classList.add('modal-dragging');
            e.preventDefault();
        });
        
        // Resize sur les poignées
        modal.querySelectorAll('.modal-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                isResizing = true;
                resizeDirection = handle.dataset.direction;
                startX = e.clientX;
                startY = e.clientY;
                
                initFixedPosition();
                const rect = modal.getBoundingClientRect();
                initialX = rect.left;
                initialY = rect.top;
                initialW = rect.width;
                initialH = rect.height;
                
                modal.classList.add('modal-resizing');
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                let newX = initialX + deltaX;
                let newY = initialY + deltaY;
                
                // Limites de l'écran
                newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
                newY = Math.max(0, Math.min(newY, window.innerHeight - 50));
                
                modal.style.left = `${newX}px`;
                modal.style.top = `${newY}px`;
            }
            
            if (isResizing) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                let newW = initialW;
                let newH = initialH;
                let newX = initialX;
                let newY = initialY;
                
                // Appliquer le redimensionnement selon la direction
                if (resizeDirection.includes('e')) newW = Math.max(300, initialW + deltaX);
                if (resizeDirection.includes('w')) {
                    newW = Math.max(300, initialW - deltaX);
                    newX = initialX + initialW - newW;
                }
                if (resizeDirection.includes('s')) newH = Math.max(200, initialH + deltaY);
                if (resizeDirection.includes('n')) {
                    newH = Math.max(200, initialH - deltaY);
                    newY = initialY + initialH - newH;
                }
                
                modal.style.width = `${newW}px`;
                modal.style.height = `${newH}px`;
                modal.style.left = `${newX}px`;
                modal.style.top = `${newY}px`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            isResizing = false;
            modal.classList.remove('modal-dragging', 'modal-resizing');
        });
        
        // Réinitialiser position/taille quand modal se ferme
        const overlay = modal.closest('.modal-overlay');
        if (overlay) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (overlay.classList.contains('hidden')) {
                            modal.style.position = '';
                            modal.style.left = '';
                            modal.style.top = '';
                            modal.style.width = '';
                            modal.style.height = '';
                            modal.style.margin = '';
                            modal.style.transform = '';
                        }
                    }
                });
            });
            observer.observe(overlay, { attributes: true });
        }
    });
}

// Flag pour éviter double initialisation
let appInitialized = false;

// Attendre que pywebview soit prêt
window.addEventListener('pywebviewready', async () => {
    console.log('pywebview est prêt');
    if (!appInitialized) {
        appInitialized = true;
        await initializeApp();
    }
});

// Fallback pour le cas où l'événement ne se déclenche pas
window.addEventListener('load', async () => {
    console.log('Page chargée');
    if (window.pywebview && window.pywebview.api && !appInitialized) {
        console.log('pywebview déjà disponible');
        appInitialized = true;
        await initializeApp();
    } else if (!appInitialized) {
        console.log('En attente de pywebview...');
    }
});
