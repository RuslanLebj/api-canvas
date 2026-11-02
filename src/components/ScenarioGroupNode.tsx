import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import type { ScenarioColor } from "../../shared/types";
import { useCanvasStore } from "../store";
import { CanvasArrowHandles } from "./CanvasArrowHandles";

type ScenarioFlowNode = Node<{ entityId: string }, "scenario">;

const COLORS: ScenarioColor[] = ["teal", "purple", "amber", "blue"];

export function ScenarioGroupNode({ data, selected }: NodeProps<ScenarioFlowNode>) {
  const group = useCanvasStore((state) => state.document.scenarioGroups[data.entityId]);
  const update = useCanvasStore((state) => state.updateScenarioGroup);
  const remove = useCanvasStore((state) => state.deleteScenarioGroup);
  if (!group) return null;

  return (
    <div className={`scenario-group-node scenario-${group.color} ${selected ? "selected" : ""}`}>
      <NodeResizer minWidth={360} minHeight={240} isVisible={selected} />
      <CanvasArrowHandles />
      <div className="scenario-titlebar">
        <input
          className="scenario-name nodrag"
          aria-label="Название сценария"
          value={group.name}
          onChange={(event) => update(group.id, { name: event.target.value })}
          onBlur={(event) => {
            if (!event.target.value.trim()) update(group.id, { name: "Без названия" });
          }}
        />
        <div className="scenario-actions nodrag">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`scenario-color color-${color} ${group.color === color ? "active" : ""}`}
              aria-label={`Цвет ${color}`}
              onClick={() => update(group.id, { color })}
            />
          ))}
          <button className="icon-button danger" title="Удалить область сценария" onClick={() => remove(group.id)}>×</button>
        </div>
      </div>
    </div>
  );
}
