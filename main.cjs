const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { createServer } = require('http');

// Configuration
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;
let mainWindow;
let nextServer;

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

// Create Electron window
const createWindow = async (port) => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    frame: false, // This removes the default window frame
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: !isDev // Disable in dev, enable in production
    },
    icon: path.join(__dirname, 'public/favicon.ico'), // Update path as needed
    show: false // Don't show until ready
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the Next.js app
  await mainWindow.loadURL(`http://localhost:${port}`);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// IPC handlers for window controls
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

// IPC handlers for other messages
ipcMain.on('app-message', (event, arg) => {
  console.log('Received message from renderer:', arg);
  event.reply('app-reply', 'Message received');
});

// App event handlers
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
