import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import type { ScenarioColor } from "../../shared/types";
import { useCanvasStore } from "../store";
import { CanvasArrowHandles } from "./CanvasArrowHandles";

type TextFlowNode = Node<{ entityId: string }, "note">;
const COLORS: ScenarioColor[] = ["teal", "purple", "amber", "blue"];

export function TextCardNode({ data, selected }: NodeProps<TextFlowNode>) {
  const card = useCanvasStore((state) => state.document.textCards[data.entityId]);
  const update = useCanvasStore((state) => state.updateTextCard);
  const remove = useCanvasStore((state) => state.deleteTextCard);
  if (!card) return null;

  return (
    <div className={`canvas-node text-card-node note-${card.color} ${selected ? "selected" : ""}`}>
      <NodeResizer minWidth={220} minHeight={150} isVisible={selected} />
      <CanvasArrowHandles />
      <header className="text-card-titlebar">
        <input
          className="text-card-title nodrag"
          aria-label="Название текстовой карточки"
          value={card.title}
          onChange={(event) => update(card.id, { title: event.target.value })}
          onBlur={(event) => {
            if (!event.target.value.trim()) update(card.id, { title: "Заметка" });
          }}
        />
        <div className="text-card-actions nodrag">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`scenario-color color-${color} ${card.color === color ? "active" : ""}`}
              aria-label={`Цвет заметки ${color}`}
              onClick={() => update(card.id, { color })}
            />
          ))}
          <button className="icon-button danger" title="Удалить заметку" onClick={() => remove(card.id)}>×</button>
        </div>
      </header>
      <textarea
        className="text-card-content nodrag nowheel"
        aria-label="Текст заметки"
        placeholder="Введите текст…"
        value={card.text}
        onChange={(event) => update(card.id, { text: event.target.value })}
      />
    </div>
  );
}
