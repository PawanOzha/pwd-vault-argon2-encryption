const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { createServer } = require('http');

// Configuration
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;
let mainWindow;
let nextServer;
let serverPort;
let stickyNoteWindows = new Map(); // Store all sticky note windows by note ID

// Function to check if port is in use
const isPortInUse = (port) => {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
};

// Function to find an available port
const findAvailablePort = async (startPort) => {
  let port = startPort;
  while (await isPortInUse(port)) {
    console.log(`Port ${port} is in use, trying ${port + 1}...`);
    port++;
    if (port > startPort + 10) {
      throw new Error('Could not find an available port');
    }
  }
  return port;
};

// Function to wait for Next.js server to be ready
const waitForNextServer = async (port, maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await net.fetch(`http://localhost:${port}`);
      if (response.ok) {
        console.log('Next.js server is ready');
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
};

// Function to kill process on port (backup method)
const killProcessOnPort = async (port) => {
  return new Promise((resolve) => {
    const killCommand = process.platform === 'win32' 
      ? `netstat -ano | findstr :${port} | findstr LISTENING`
      : `lsof -ti:${port}`;
    
    const killProcess = process.platform === 'win32'
      ? (pid) => `taskkill /PID ${pid} /F`
      : (pid) => `kill -9 ${pid}`;

    const { exec } = require('child_process');
    
    exec(killCommand, (error, stdout) => {
      if (error || !stdout) {
        resolve();
        return;
      }
      
      const pid = process.platform === 'win32' 
        ? stdout.trim().split(/\s+/).pop()
        : stdout.trim();
      
      if (pid && pid !== process.pid.toString()) {
        exec(killProcess(pid), () => {
          console.log(`Killed process on port ${port}`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
};

// Function to start Next.js server
const startNextServer = async () => {
  // Find an available port
  const availablePort = await findAvailablePort(PORT);
  serverPort = availablePort;
  
  return new Promise((resolve, reject) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    
    if (isDev) {
      // Development mode
      nextServer = spawn(npmCommand, ['run', 'dev', '--', '--port', availablePort.toString()], {
        shell: true,
        env: { ...process.env, PORT: availablePort.toString() },
        stdio: 'inherit',
        cwd: __dirname
      });

      nextServer.on('error', (error) => {
        console.error('Failed to start Next.js server:', error);
        reject(error);
      });

      // Wait for Next.js to be ready
      waitForNextServer(availablePort).then((ready) => {
        if (ready) {
          resolve(availablePort);
        } else {
          reject(new Error('Next.js server failed to start in time'));
        }
      });
    } else {
      // Production mode
      const { exec } = require('child_process');
      
      // First build the Next.js app
      console.log('Building Next.js application...');
      exec('npm run build', { cwd: __dirname }, (buildError) => {
        if (buildError) {
          console.error('Build failed:', buildError);
          reject(buildError);
          return;
        }
        
        console.log('Build completed. Starting production server...');
        nextServer = spawn(npmCommand, ['run', 'start', '--', '--port', availablePort.toString()], {
          shell: true,
          env: { ...process.env, PORT: availablePort.toString() },
          stdio: 'inherit',
          cwd: __dirname
        });

        nextServer.on('error', (error) => {
          console.error('Failed to start Next.js server:', error);
          reject(error);
        });

        // Wait for Next.js to be ready
        waitForNextServer(availablePort).then((ready) => {
          if (ready) {
            resolve(availablePort);
          } else {
            reject(new Error('Next.js server failed to start in time'));
          }
        });
      });
    }
  });
};

// Create Main Electron window
const createWindow = async (port) => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: !isDev
    },
    icon: path.join(__dirname, 'public/favicon.ico'),
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  await mainWindow.loadURL(`http://localhost:${port}`);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// ============================================================================
// CREATE FLOATING STICKY NOTE WINDOW
// ============================================================================
const createStickyNoteWindow = (noteId, noteData = {}) => {
  console.log('Creating sticky note window for note:', noteId);

  // Check if window already exists
  if (stickyNoteWindows.has(noteId)) {
    const existingWindow = stickyNoteWindows.get(noteId);
    if (!existingWindow.isDestroyed()) {
      existingWindow.focus();
      return;
    }
  }

  // Create new sticky note window
  const noteWindow = new BrowserWindow({
    width: noteData.width || 300,
    height: noteData.height || 400,
    x: noteData.x || undefined,
    y: noteData.y || undefined,
    minWidth: 300,
    minHeight: 400,
    frame: false, // Custom titlebar
    alwaysOnTop: noteData.alwaysOnTop !== false, // Default to always on top
    skipTaskbar: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: !isDev
    },
    backgroundColor: '#30302E',
    show: false
  });

  // Store window reference
  stickyNoteWindows.set(noteId, noteWindow);

  // Show when ready
  noteWindow.once('ready-to-show', () => {
    noteWindow.show();
  });

  // Load the sticky note page
  noteWindow.loadURL(`http://localhost:${serverPort}/sticky-note/${noteId}`);

  // Open DevTools in development
  if (isDev) {
    noteWindow.webContents.openDevTools();
  }

  // Save window position and size when moved or resized
  const saveWindowBounds = () => {
    if (!noteWindow.isDestroyed()) {
      const bounds = noteWindow.getBounds();
      // Send bounds to renderer to save to database
      noteWindow.webContents.send('window-bounds-changed', bounds);
    }
  };

  noteWindow.on('resize', saveWindowBounds);
  noteWindow.on('move', saveWindowBounds);

  // Cleanup on close
  noteWindow.on('closed', () => {
    stickyNoteWindows.delete(noteId);
    console.log('Sticky note window closed:', noteId);
  });

  return noteWindow;
};

// ============================================================================
// IPC HANDLERS
// ============================================================================

// Window control handlers for main window
ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// Sticky note window handlers
ipcMain.on('sticky-note-minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.minimize();
  }
});

ipcMain.on('sticky-note-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
});

ipcMain.on('sticky-note-toggle-always-on-top', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    const isAlwaysOnTop = window.isAlwaysOnTop();
    window.setAlwaysOnTop(!isAlwaysOnTop);
    event.reply('sticky-note-always-on-top-changed', !isAlwaysOnTop);
  }
});

// Create/Open sticky note window
ipcMain.on('open-sticky-note', (event, noteId, noteData) => {
  console.log('Received open-sticky-note request:', noteId);
  createStickyNoteWindow(noteId, noteData);
});

// Close specific sticky note window
ipcMain.on('close-sticky-note-window', (event, noteId) => {
  if (stickyNoteWindows.has(noteId)) {
    const window = stickyNoteWindows.get(noteId);
    if (!window.isDestroyed()) {
      window.close();
    }
    stickyNoteWindows.delete(noteId);
  }
});

// Get window bounds
ipcMain.handle('get-window-bounds', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    return window.getBounds();
  }
  return null;
});

// IPC handlers for other messages
ipcMain.on('app-message', (event, arg) => {
  console.log('Received message from renderer:', arg);
  event.reply('app-reply', 'Message received');
});

// ============================================================================
// APP EVENT HANDLERS
// ============================================================================

app.whenReady().then(async () => {
  try {
    console.log('Starting Next.js server...');
    const port = await startNextServer();
    console.log(`Next.js server started on port ${port}`);
    await createWindow(port);
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (nextServer) {
      nextServer.kill('SIGTERM');
      setTimeout(() => {
        if (nextServer && !nextServer.killed) {
          nextServer.kill('SIGKILL');
        }
      }, 5000);
    }
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    const port = await findAvailablePort(PORT);
    await createWindow(port);
  }
});

app.on('before-quit', () => {
  // Close all sticky note windows
  stickyNoteWindows.forEach((window, noteId) => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });
  stickyNoteWindows.clear();

  if (nextServer) {
    nextServer.kill('SIGTERM');
  }
});

// Handle process termination
process.on('SIGINT', () => {
  if (nextServer) {
    nextServer.kill('SIGTERM');
  }
  process.exit();
});

process.on('SIGTERM', () => {
  if (nextServer) {
    nextServer.kill('SIGTERM');
  }
  process.exit();
});
