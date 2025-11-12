import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { NotificationProvider } from "./components/NotificationCenter";
import beaverFavicon from "./assets/BeaverHead.png";

const faviconLink = document.querySelector(
  "link[rel='icon']"
) as HTMLLinkElement | null;
if (faviconLink) {
  const img = new Image();
  img.src = beaverFavicon;
  img.onload = () => {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      faviconLink.href = beaverFavicon;
      faviconLink.type = "image/png";
      return;
    }
    ctx.clearRect(0, 0, size, size);

    const targetWidth = size;
    const targetHeight = (img.height / img.width) * targetWidth;
    const offsetY = (size - targetHeight) / 2;

    ctx.drawImage(img, 0, offsetY, targetWidth, targetHeight);
    faviconLink.href = canvas.toDataURL("image/png");
    faviconLink.type = "image/png";
  };
  img.onerror = () => {
    faviconLink.href = beaverFavicon;
    faviconLink.type = "image/png";
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NotificationProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </NotificationProvider>
  </React.StrictMode>
);
