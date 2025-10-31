const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window control methods
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Sticky note window control methods
  stickyNoteMinimize: () => ipcRenderer.send('sticky-note-minimize'),
  stickyNoteClose: () => ipcRenderer.send('sticky-note-close'),
  stickyNoteToggleAlwaysOnTop: () => ipcRenderer.send('sticky-note-toggle-always-on-top'),
  
  // Sticky note management
  openStickyNote: (noteId, noteData) => ipcRenderer.send('open-sticky-note', noteId, noteData),
  closeStickyNoteWindow: (noteId) => ipcRenderer.send('close-sticky-note-window', noteId),
  
  // Window bounds
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  onWindowBoundsChanged: (callback) => {
    ipcRenderer.on('window-bounds-changed', (event, bounds) => callback(bounds));
  },
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('sticky-note-always-on-top-changed', (event, isAlwaysOnTop) => callback(isAlwaysOnTop));
  },
  
  // General IPC methods
  sendMessage: (channel, data) => {
    // Whitelist channels
    const validChannels = ['app-message'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receiveMessage: (channel, func) => {
    const validChannels = ['app-reply'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  platform: process.platform,
  isElectron: true
});
