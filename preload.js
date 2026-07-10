const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronEnv", {
  isElectron: true,
  prepareExportDirectory: () => ipcRenderer.invoke("export:prepare-directory"),
  writeExportFile: (filePath, buffer) => ipcRenderer.invoke("export:write-file", filePath, buffer),
});
