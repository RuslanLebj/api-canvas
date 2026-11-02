import { useMemo, useState } from "react";
import type { NormalizedOperation } from "../../shared/types";
import { useCanvasStore } from "../store";

export function Sidebar() {
  const [tab, setTab] = useState<"routes" | "headers" | "groups" | "notes">("routes");
  const [search, setSearch] = useState("");
  const document = useCanvasStore((state) => state.document);
  const openTemplate = useCanvasStore((state) => state.openTemplate);
  const addCard = useCanvasStore((state) => state.addCard);
  const addHeaderSet = useCanvasStore((state) => state.addHeaderSet);
  const addScenarioGroup = useCanvasStore((state) => state.addScenarioGroup);
  const addTextCard = useCanvasStore((state) => state.addTextCard);
  const operations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (document.spec?.operations ?? []).filter(
      (operation) =>
        !needle ||
        operation.summary.toLowerCase().includes(needle) ||
        operation.path.toLowerCase().includes(needle) ||
        operation.method.toLowerCase().includes(needle) ||
        operation.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [document.spec, search]);
  const grouped = useMemo(() => {
    const groups = new Map<string, NormalizedOperation[]>();
    for (const operation of operations) {
      const tag = operation.tags[0] || "Без тега";
      groups.set(tag, [...(groups.get(tag) ?? []), operation]);
    }
    return groups;
  }, [operations]);

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>
          Роуты <span>{document.spec?.operations.length ?? 0}</span>
        </button>
        <button className={tab === "headers" ? "active" : ""} onClick={() => setTab("headers")}>
          Headers <span>{Object.keys(document.headerSets).length}</span>
        </button>
        <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}>
          Сценарии <span>{Object.keys(document.scenarioGroups).length}</span>
        </button>
        <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>
          Текст <span>{Object.keys(document.textCards).length}</span>
        </button>
      </div>
      {tab === "routes" ? (
        <>
          <div className="sidebar-search">
            <span>⌕</span>
            <input value={search} placeholder="Метод, путь или тег" onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="sidebar-scroll">
            {!document.spec && <div className="sidebar-empty">Сначала укажите адрес Swagger в верхней панели.</div>}
            {[...grouped.entries()].map(([tag, items]) => (
              <section className="route-group" key={tag}>
                <div className="route-group-title"><span>{tag}</span><span>{items.length}</span></div>
                {items.map((operation) => (
                  <div
                    className="route-item"
                    key={operation.key}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/api-operation", operation.key);
                      event.dataTransfer.setData("application/api-service", document.activeServiceId ?? "");
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <button className="route-main" onClick={() => openTemplate(operation.key)}>
                      <span className={`method method-${operation.method.toLowerCase()}`}>{operation.method}</span>
                      <span className="route-copy">
                        <strong>{operation.summary}</strong>
                        <code>{operation.path}</code>
                      </span>
                    </button>
                    <button
                      className="drag-grip"
                      title="Добавить на canvas (или перетащите карточку)"
                      onClick={() => addCard(operation, { x: 90 + Math.random() * 180, y: 90 + Math.random() * 120 })}
                    >
                      ⠿
                    </button>
                  </div>
                ))}
              </section>
            ))}
            {document.spec && operations.length === 0 && <div className="sidebar-empty">Ничего не найдено.</div>}
          </div>
        </>
      ) : tab === "headers" ? (
        <div className="sidebar-scroll headers-library">
          <div
            className="new-header-card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/api-header-set", "new");
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => addHeaderSet({ x: 80 + Math.random() * 120, y: 80 + Math.random() * 120 })}
          >
            <span className="plus-orb">+</span>
            <div><strong>Новый набор</strong><small>Перетащите на canvas</small></div>
          </div>
          {Object.values(document.headerSets).map((headerSet) => (
            <div className="header-library-item" key={headerSet.id}>
              <span className="header-gem">◈</span>
              <div><strong>{headerSet.name}</strong><small>{headerSet.headers.length} headers</small></div>
            </div>
          ))}
          <div className="library-hint">Перетащите фиолетовый блок поверх карточки запроса или выберите набор внутри карточки. У запроса может быть один живой набор.</div>
        </div>
      ) : tab === "groups" ? (
        <div className="sidebar-scroll scenario-library">
          <div
            className="new-scenario-card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/api-scenario-group", "new");
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() =>
              addScenarioGroup({ x: 40 + Math.random() * 100, y: 40 + Math.random() * 100 })
            }
          >
            <span className="scenario-orb">▭</span>
            <div><strong>Новый сценарий</strong><small>Полупрозрачная область</small></div>
          </div>
          {Object.values(document.scenarioGroups).map((group) => (
            <div className="scenario-library-item" key={group.id}>
              <span className={`scenario-gem color-${group.color}`} />
              <div><strong>{group.name}</strong><small>Область на canvas</small></div>
            </div>
          ))}
          <div className="library-hint">
            Положите область под карточки одного сценария, измените её размер и название.
            Карточки остаются независимыми.
          </div>
        </div>
      ) : (
        <div className="sidebar-scroll note-library">
          <div
            className="new-note-card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/api-text-card", "new");
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() =>
              addTextCard({ x: 70 + Math.random() * 120, y: 70 + Math.random() * 120 })
            }
          >
            <span className="note-orb">T</span>
            <div><strong>Новая заметка</strong><small>Текстовая карточка</small></div>
          </div>
          {Object.values(document.textCards).map((card) => (
            <div className="note-library-item" key={card.id}>
              <span className={`scenario-gem color-${card.color}`} />
              <div><strong>{card.title}</strong><small>{card.text ? `${card.text.length} символов` : "Пустая"}</small></div>
            </div>
          ))}
          <div className="library-hint">
            Перетащите карточку на canvas. Для обычной стрелки тяните зелёную точку справа
            одного блока к серой точке слева другого.
          </div>
        </div>
      )}
    </aside>
  );
}
