import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { createHeaderEntry } from "../../shared/types";
import { useCanvasStore } from "../store";
import { HeadersEditor } from "./HeadersEditor";
import { CanvasArrowHandles } from "./CanvasArrowHandles";

type HeaderFlowNode = Node<{ entityId: string }, "headers">;

export function HeaderNode({ data, selected }: NodeProps<HeaderFlowNode>) {
  const headerSet = useCanvasStore((state) => state.document.headerSets[data.entityId]);
  const update = useCanvasStore((state) => state.updateHeaderSet);
  const remove = useCanvasStore((state) => state.deleteHeaderSet);
  if (!headerSet) return null;

  return (
    <div className={`canvas-node header-node ${selected ? "selected" : ""}`}>
      <NodeResizer minWidth={280} minHeight={180} isVisible={selected} />
      <CanvasArrowHandles />
      <header className="node-titlebar">
        <span className="node-kicker">HEADER SET</span>
        <button className="icon-button danger nodrag" onClick={() => remove(headerSet.id)}>×</button>
      </header>
      <input
        className="header-set-name nodrag"
        value={headerSet.name}
        onChange={(event) => update(headerSet.id, { name: event.target.value })}
      />
      <div className="node-scroll nowheel nodrag">
        <HeadersEditor
          compact
          entries={headerSet.headers}
          onChange={(headers) => update(headerSet.id, { headers })}
        />
      </div>
      {headerSet.headers.length === 0 && (
        <button
          className="text-button nodrag"
          onClick={() => update(headerSet.id, { headers: [createHeaderEntry()] })}
        >
          + Добавить header
        </button>
      )}
      <div className="connector-caption">Перетащите блок на карточку запроса</div>
    </div>
  );
}
