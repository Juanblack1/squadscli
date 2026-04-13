const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("softwareFactoryDesktop", {
  getBootstrap: () => ipcRenderer.invoke("launcher:get-bootstrap"),
  chooseFolder: () => ipcRenderer.invoke("launcher:choose-folder"),
  refreshWorkspace: (workspace) => ipcRenderer.invoke("launcher:refresh-workspace", workspace),
  doctor: (payload) => ipcRenderer.invoke("launcher:doctor", payload),
  run: (payload) => ipcRenderer.invoke("launcher:run", payload),
  saveSession: (payload) => ipcRenderer.invoke("launcher:save-session", payload),
});
