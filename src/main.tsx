import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
declare global {
  interface Window {
    invest: import("./domain/types").DesktopAPI;
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
