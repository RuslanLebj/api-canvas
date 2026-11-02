import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadLatestDocument, saveDocument } from "./database";
import { useCanvasStore } from "./store";
import "./styles.css";

async function bootstrap() {
  const latest = await loadLatestDocument();
  if (latest) useCanvasStore.getState().replaceDocument(latest);
  else useCanvasStore.getState().setHydrated(true);

  let timer: number | undefined;
  useCanvasStore.subscribe((state, previous) => {
    if (!state.hydrated || state.document === previous.document) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        await saveDocument(useCanvasStore.getState().document);
        useCanvasStore.getState().setSaveState("saved");
      } catch {
        useCanvasStore.getState().setSaveState("error");
      }
    }, 500);
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  console.error("API Canvas failed to start", error);
  const root = document.getElementById("root");
  if (!root) return;
  const panel = document.createElement("div");
  panel.className = "startup-error";
  const title = document.createElement("strong");
  title.textContent = "API Canvas не запустился";
  const details = document.createElement("pre");
  details.textContent = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
    : String(error);
  panel.append(title, details);
  root.replaceChildren(panel);
});
