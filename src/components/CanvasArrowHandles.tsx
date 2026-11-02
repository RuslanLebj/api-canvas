import { Handle, Position } from "@xyflow/react";

export const CANVAS_ARROW_SOURCE = "canvas-arrow-source";
export const CANVAS_ARROW_TARGET = "canvas-arrow-target";

export function CanvasArrowHandles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id={CANVAS_ARROW_TARGET}
        className="canvas-arrow-handle canvas-arrow-target nodrag"
        aria-label="Вход обычной стрелки"
      />
      <Handle
        type="source"
        position={Position.Right}
        id={CANVAS_ARROW_SOURCE}
        className="canvas-arrow-handle canvas-arrow-source nodrag"
        aria-label="Нарисовать обычную стрелку"
      />
    </>
  );
}
