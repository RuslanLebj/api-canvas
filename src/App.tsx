import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./components/Canvas";
import { Sidebar } from "./components/Sidebar";
import { TemplateDialog } from "./components/TemplateDialog";
import { Topbar } from "./components/Topbar";

export function App() {
  return (
    <div className="app-shell">
      <Topbar />
      <div className="workspace">
        <Sidebar />
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </div>
      <TemplateDialog />
    </div>
  );
}
