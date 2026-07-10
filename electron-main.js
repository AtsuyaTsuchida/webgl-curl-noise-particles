const path = require("path");
const fs = require("fs/promises");
const { app, BrowserWindow, ipcMain } = require("electron");

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1920,
        height: 1080,
        backgroundColor: "#000000",
        autoHideMenuBar: true,
        fullscreenable: true,
        webPreferences: {
          contextIsolation: true,
          sandbox: false,
          preload: path.join(__dirname, "preload.js"),
        },
      },
    };
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("export:prepare-directory", async () => {
    const baseDirectory = "/Users/s29524/Desktop/TouchDesigner/kankyojouhougaku";
    const exportDirectory = path.join(baseDirectory, `frame_${formatTimestamp()}`);
    await fs.mkdir(exportDirectory, { recursive: true });
    return exportDirectory;
  });

  ipcMain.handle("export:write-file", async (_event, filePath, buffer) => {
    await fs.writeFile(filePath, Buffer.from(buffer));
    return true;
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
