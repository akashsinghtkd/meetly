import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

// The floating recorder runs in a separate Tauri window loaded with ?overlay=1.
// Route it to a tiny UI instead of booting the whole app (stores, sync, etc.).
const isOverlay = new URLSearchParams(window.location.search).get("overlay") === "1";

async function mount() {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  if (isOverlay) {
    const { MeetingOverlay } = await import("./components/MeetingOverlay");
    root.render(
      <React.StrictMode>
        <MeetingOverlay />
      </React.StrictMode>,
    );
  } else {
    const { default: App } = await import("./App");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

mount();
