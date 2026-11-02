import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../store";
import { HeaderNode } from "./HeaderNode";
import { RequestNode } from "./RequestNode";
import { ScenarioGroupNode } from "./ScenarioGroupNode";
import { fieldHandleId, readFieldHandleId } from "./FieldValueDrag";
import { TextCardNode } from "./TextCardNode";
import { CANVAS_ARROW_SOURCE, CANVAS_ARROW_TARGET } from "./CanvasArrowHandles";

const nodeTypes = { request: RequestNode, headers: HeaderNode, scenario: ScenarioGroupNode, note: TextCardNode };

export function Canvas() {
  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow();
  const headerDragStart = useRef<
    { id: string; position: { x: number; y: number } } | undefined
  >(undefined);
  const scenarioDragStart = useRef<
    {
      id: string;
      position: { x: number; y: number };
      members: Map<string, { x: number; y: number }>;
    } | undefined
  >(undefined);
  const selectionDragStart = useRef<
    {
      id: string;
      position: { x: number; y: number };
      members: Map<string, { x: number; y: number }>;
    } | undefined
  >(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(() => new Set());
  const document = useCanvasStore((state) => state.document);
  const setLayouts = useCanvasStore((state) => state.setLayouts);
  const addCard = useCanvasStore((state) => state.addCard);
  const addHeaderSet = useCanvasStore((state) => state.addHeaderSet);
  const addScenarioGroup = useCanvasStore((state) => state.addScenarioGroup);
  const connectHeaderSet = useCanvasStore((state) => state.connectHeaderSet);
  const deleteCanvasNodes = useCanvasStore((state) => state.deleteCanvasNodes);
  const connectFields = useCanvasStore((state) => state.connectFields);
  const deleteFieldLinks = useCanvasStore((state) => state.deleteFieldLinks);
  const addTextCard = useCanvasStore((state) => state.addTextCard);
  const addCanvasArrow = useCanvasStore((state) => state.addCanvasArrow);
  const deleteCanvasArrows = useCanvasStore((state) => state.deleteCanvasArrows);

  useEffect(() => {
    const available = new Set(document.layouts.map((layout) => layout.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [document.layouts]);

  useEffect(() => {
    const available = new Set([
      ...document.fieldLinks.map((link) => link.id),
      ...document.arrows.map((arrow) => arrow.id),
    ]);
    setSelectedLinkIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [document.fieldLinks, document.arrows]);

  const nodes = useMemo<Node[]>(
    () =>
      [...document.layouts]
        .sort((left, right) => (left.kind === "group" ? -1 : right.kind === "group" ? 1 : 0))
        .filter((layout) => {
          if (layout.kind === "request") return Boolean(document.cards[layout.entityId]);
          if (layout.kind === "headers") return Boolean(document.headerSets[layout.entityId]);
          if (layout.kind === "group") return Boolean(document.scenarioGroups[layout.entityId]);
          return Boolean(document.textCards[layout.entityId]);
        })
        .map((layout) => ({
          id: layout.id,
          type: layout.kind === "group" ? "scenario" : layout.kind,
          position: layout.position,
          width: layout.width,
          height: layout.kind !== "request" ? layout.height : undefined,
          style:
            layout.kind !== "request"
              ? { width: layout.width, height: layout.height }
              : { width: layout.width ?? 520 },
          zIndex: layout.kind === "group" ? 0 : 10,
          dragHandle:
            layout.kind === "group"
              ? ".scenario-titlebar"
              : layout.kind === "note"
                ? ".text-card-titlebar"
                : undefined,
          selected: selectedIds.has(layout.id),
          data: { entityId: layout.entityId },
        })),
    [document.layouts, document.cards, document.headerSets, document.scenarioGroups, document.textCards, selectedIds],
  );

  const edges = useMemo<Edge[]>(
    () => [
      ...document.fieldLinks.map((link) => ({
        id: link.id,
        source: `request:${link.source.cardId}`,
        target: `request:${link.target.cardId}`,
        sourceHandle: fieldHandleId("source", link.source.target),
        targetHandle: fieldHandleId("target", link.target.target),
        type: "smoothstep",
        selected: selectedLinkIds.has(link.id),
        interactionWidth: 16,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a78bfa", width: 14, height: 14 },
        style: { stroke: "#a78bfa", strokeWidth: 2 },
      } satisfies Edge)),
      ...document.arrows.map((arrow) => ({
        id: arrow.id,
        source: arrow.sourceNodeId,
        target: arrow.targetNodeId,
        sourceHandle: CANVAS_ARROW_SOURCE,
        targetHandle: CANVAS_ARROW_TARGET,
        type: "bezier",
        selected: selectedLinkIds.has(arrow.id),
        interactionWidth: 20,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#2dd4bf", width: 18, height: 18 },
        style: { stroke: "#2dd4bf", strokeWidth: 2.2 },
      } satisfies Edge)),
    ],
    [document.fieldLinks, document.arrows, selectedLinkIds],
  );

  const selectedCount = document.layouts.filter((layout) => selectedIds.has(layout.id)).length;
  const selectedRequestCount = document.layouts.filter(
    (layout) => layout.kind === "request" && selectedIds.has(layout.id),
  ).length;
  const selectedRequestIds = document.layouts
    .filter((layout) => layout.kind === "request" && selectedIds.has(layout.id))
    .map((layout) => layout.id);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const selectionChanges = changes.filter((change) => change.type === "select");
      if (selectionChanges.length > 0) {
        setSelectedIds((current) => {
          const next = new Set(current);
          for (const change of selectionChanges) {
            if (change.selected) next.add(change.id);
            else next.delete(change.id);
          }
          return next;
        });
      }

      const removed = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removed.length > 0) {
        deleteCanvasNodes(removed);
        setSelectedIds((current) => {
          const next = new Set(current);
          removed.forEach((id) => next.delete(id));
          return next;
        });
        return;
      }

      const relevant = changes.filter((change) =>
        ["position", "dimensions"].includes(change.type),
      );
      if (relevant.length === 0) return;
      const changed = applyNodeChanges(relevant, nodes);
      const byId = new Map(changed.map((node) => [node.id, node]));
      let nextLayouts = document.layouts
          .map((layout) => {
            const node = byId.get(layout.id);
            return node
              ? {
                  ...layout,
                  position: node.position,
                  width: node.measured?.width ?? node.width ?? layout.width,
                  height: node.measured?.height ?? node.height ?? layout.height,
                }
              : layout;
          });
      const scenarioDrag = scenarioDragStart.current;
      if (scenarioDrag) {
        const movedGroup = nextLayouts.find((layout) => layout.id === scenarioDrag.id);
        if (movedGroup) {
          const deltaX = movedGroup.position.x - scenarioDrag.position.x;
          const deltaY = movedGroup.position.y - scenarioDrag.position.y;
          nextLayouts = nextLayouts.map((layout) => {
            const start = scenarioDrag.members.get(layout.id);
            return start
              ? {
                  ...layout,
                  position: { x: start.x + deltaX, y: start.y + deltaY },
                }
              : layout;
          });
        }
      }
      const selectionDrag = selectionDragStart.current;
      if (selectionDrag) {
        const movedLead = nextLayouts.find((layout) => layout.id === selectionDrag.id);
        if (movedLead) {
          const deltaX = movedLead.position.x - selectionDrag.position.x;
          const deltaY = movedLead.position.y - selectionDrag.position.y;
          nextLayouts = nextLayouts.map((layout) => {
            const start = selectionDrag.members.get(layout.id);
            return start
              ? {
                  ...layout,
                  position: { x: start.x + deltaX, y: start.y + deltaY },
                }
              : layout;
          });
        }
      }
      const changedLayout = nextLayouts.some((layout, index) => {
        const previous = document.layouts[index];
        return (
          !previous ||
          layout.id !== previous.id ||
          layout.position.x !== previous.position.x ||
          layout.position.y !== previous.position.y ||
          layout.width !== previous.width ||
          layout.height !== previous.height
        );
      });
      if (changedLayout) setLayouts(nextLayouts);
    },
    [document.layouts, nodes, setLayouts, deleteCanvasNodes],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removed.length) {
      deleteFieldLinks(removed);
      deleteCanvasArrows(removed);
    }
    const selections = changes.filter((change) => change.type === "select");
    if (selections.length) {
      setSelectedLinkIds((current) => {
        const next = new Set(current);
        for (const change of selections) {
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
        }
        return next;
      });
    }
  }, [deleteFieldLinks, deleteCanvasArrows]);

  const onConnect = useCallback((connection: Connection) => {
    const sourceTarget = readFieldHandleId(connection.sourceHandle, "source");
    const targetTarget = readFieldHandleId(connection.targetHandle, "target");
    if (
      connection.source?.startsWith("request:") &&
      connection.target?.startsWith("request:") &&
      sourceTarget &&
      targetTarget
    ) {
      const result = connectFields(
        { cardId: connection.source.slice(8), target: sourceTarget },
        { cardId: connection.target.slice(8), target: targetTarget },
      );
      if (result === "cycle") window.alert("Эта связь создаст цикл. Поля должны образовывать цепочку в одном направлении.");
      return;
    }
    if (
      connection.source &&
      connection.target &&
      connection.sourceHandle === CANVAS_ARROW_SOURCE &&
      connection.targetHandle === CANVAS_ARROW_TARGET
    ) {
      addCanvasArrow(connection.source, connection.target);
    }
  }, [connectFields, addCanvasArrow]);

  return (
    <main className="canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => {
          setSelectedIds(new Set());
          setSelectedLinkIds(new Set());
        }}
        onNodeDragStart={(_event, node) => {
          if (node.type === "headers") {
            headerDragStart.current = { id: node.id, position: { ...node.position } };
          }
          if (node.type === "scenario") {
            const members = new Map<string, { x: number; y: number }>();
            for (const candidate of getIntersectingNodes(node, true)) {
              if (candidate.id === node.id || candidate.type === "scenario") continue;
              members.set(candidate.id, { ...candidate.position });
            }
            scenarioDragStart.current = {
              id: node.id,
              position: { ...node.position },
              members,
            };
          }
          if (node.type === "request" && selectedIds.has(node.id) && selectedRequestIds.length > 1) {
            selectionDragStart.current = {
              id: node.id,
              position: { ...node.position },
              members: new Map(
                document.layouts
                  .filter((layout) => selectedRequestIds.includes(layout.id))
                  .map((layout) => [layout.id, { ...layout.position }]),
              ),
            };
          }
        }}
        onNodeDragStop={(_event, node) => {
          if (node.type === "request") selectionDragStart.current = undefined;
          if (node.type === "scenario") {
            scenarioDragStart.current = undefined;
            return;
          }
          if (node.type !== "headers") return;
          if (selectedIds.size > 1) {
            headerDragStart.current = undefined;
            return;
          }
          const request = getIntersectingNodes(node).find((item) => item.type === "request");
          if (request) {
            connectHeaderSet(request.id.slice(8), node.id.slice(8));
            const start = headerDragStart.current;
            if (start?.id === node.id) {
              setLayouts(
                document.layouts.map((layout) =>
                  layout.id === node.id ? { ...layout, position: start.position } : layout,
                ),
              );
            }
          }
          headerDragStart.current = undefined;
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const operationKey = event.dataTransfer.getData("application/api-operation");
          if (operationKey) {
            const operation = document.spec?.operations.find((item) => item.key === operationKey);
            if (operation) addCard(operation, position);
          }
          if (event.dataTransfer.getData("application/api-header-set") === "new") addHeaderSet(position);
          if (event.dataTransfer.getData("application/api-scenario-group") === "new") addScenarioGroup(position);
          if (event.dataTransfer.getData("application/api-text-card") === "new") addTextCard(position);
        }}
        fitView
        minZoom={0.15}
        maxZoom={2}
        selectionOnDrag
        panOnDrag={[1, 2]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Control"
      >
        <Background gap={22} size={1.2} color="#242936" />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor={(node) =>
            node.type === "scenario"
              ? "#334155"
              : node.type === "headers"
                ? "#8b5cf6"
                : node.type === "note"
                  ? "#f59e0b"
                  : "#2dd4bf"
          }
          maskColor="rgba(8, 10, 15, .78)"
        />
      </ReactFlow>
      {selectedCount > 0 && (
        <div className="bulk-selection-bar nodrag">
          <div>
            <strong>Выбрано: {selectedCount}</strong>
            <span>
              {selectedRequestCount > 0
                ? `Карточек запросов: ${selectedRequestCount}. Тяните любую — переместятся все.`
                : "Тяните любой выбранный блок — переместятся все."}
            </span>
          </div>
          <button
            className="danger-button"
            disabled={selectedRequestIds.length === 0}
            onClick={() => {
              deleteCanvasNodes(selectedRequestIds);
              setSelectedIds((current) => {
                const next = new Set(current);
                selectedRequestIds.forEach((id) => next.delete(id));
                return next;
              });
            }}
          >
            Удалить карточки · {selectedRequestIds.length}
          </button>
        </div>
      )}
      {!document.spec && document.layouts.length === 0 && (
        <div className="canvas-empty">
          <div className="empty-orbit">API</div>
          <h2>Подключите Swagger</h2>
          <p>Роуты появятся слева — перетащите их сюда и соберите свой набор запросов.</p>
        </div>
      )}
    </main>
  );
}
