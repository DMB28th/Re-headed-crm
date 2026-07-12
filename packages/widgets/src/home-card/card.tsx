/**
 * The home-card component — shared by the MCP widget shell and Studio's
 * home-card builder preview (one render codepath, like the record card).
 */
import { useState } from "react";
import type { CrmTask, HomeCardPayload, RecentRecord } from "@cardstack/core";
import { MakerChip } from "../shared/components.tsx";
import { formatDate, formatRelative } from "../shared/format.ts";
import type { WidgetHost } from "../record-card/card.tsx";

export function HomeCard({
  payload,
  locale,
  host,
}: {
  payload: HomeCardPayload;
  locale: string;
  host: WidgetHost | null;
}) {
  const openView = (name: string) => host?.sendFollowup?.(`Open my saved view "${name}"`);
  const openRecord = (recent: RecentRecord) =>
    host?.sendFollowup?.(
      `Open the ${recent.object} record "${recent.name}" (id ${recent.id})`,
    );

  return (
    <div className="cs-card hc">
      <header className="hc-header">
        <h1 className="hc-title">Your CRM</h1>
        <span className="cs-muted hc-sub">
          {payload.provenance.crmLabel} · {payload.provenance.connectedUser}
        </span>
      </header>

      {payload.blocks.map((block, i) => {
        if (block.type === "lists" && payload.lists.length > 0) {
          const tiles = payload.lists.slice(0, block.maxTiles);
          return (
            <section key={i} className="hc-section">
              <h2 className="rc-section-label">Your lists</h2>
              <div className="hc-tiles">
                {tiles.map((tile) => (
                  <button
                    key={tile.viewId}
                    type="button"
                    className="hc-tile"
                    onClick={() => openView(tile.name)}
                  >
                    {/* count === null: the tile degrades ("—" + hint) — never a fake 0. */}
                    <span className="hc-tile-count">{tile.count ?? "—"}</span>
                    <span className="hc-tile-name">{tile.name}</span>
                    <span className="cs-muted hc-tile-filters">
                      {tile.count === null ? "couldn’t load — tap to retry in chat" : tile.filterSummary}
                    </span>
                  </button>
                ))}
              </div>
              {payload.lists.length > tiles.length && (
                <button
                  type="button"
                  className="cs-link-btn"
                  onClick={() => host?.sendFollowup?.("Show all my saved views")}
                >
                  All {payload.lists.length} lists
                </button>
              )}
            </section>
          );
        }
        if (block.type === "recent" && payload.recent.length > 0) {
          return (
            <section key={i} className="hc-section">
              <h2 className="rc-section-label">Picked up recently</h2>
              {payload.recent.slice(0, block.limit).map((recent) => (
                <button
                  key={`${recent.object}-${recent.id}`}
                  type="button"
                  className="hc-row"
                  onClick={() => openRecord(recent)}
                >
                  {/* Singular label comes from the server (assemble.labelRecentRecords) —
                      never derived by string-hacking the api ("companie"). */}
                  <span className="cs-pill hc-type-pill">{recent.objectLabel ?? recent.object}</span>
                  <span className="hc-row-name">{recent.name}</span>
                  <span className="cs-muted hc-row-note">
                    {recent.note} · {formatRelative(recent.timestamp, locale)}
                  </span>
                </button>
              ))}
            </section>
          );
        }
        if (block.type === "followups") {
          return (
            <FollowUps
              key={i}
              tasks={payload.tasks.slice(0, block.limit)}
              writeEnabled={payload.capabilities.writeEnabled}
              crmLabel={payload.provenance.crmLabel}
              locale={locale}
              host={host}
            />
          );
        }
        return null;
      })}

      <footer className="hc-footer">
        {payload.capabilities.writeEnabled && (
          <span className="cs-muted rc-trust">Writes require confirmation</span>
        )}
        <MakerChip provenance={payload.provenance} />
      </footer>
    </div>
  );
}

type TaskState = "open" | "confirming" | "writing" | "done";

function FollowUps({
  tasks,
  writeEnabled,
  crmLabel,
  locale,
  host,
}: {
  tasks: CrmTask[];
  writeEnabled: boolean;
  crmLabel: string;
  locale: string;
  host: WidgetHost | null;
}) {
  const [states, setStates] = useState<Record<string, TaskState>>({});
  const today = new Date().toISOString().slice(0, 10);
  const setState = (id: string, state: TaskState) =>
    setStates((prev) => ({ ...prev, [id]: state }));

  const complete = async (task: CrmTask) => {
    if (!host) return;
    setState(task.id, "writing");
    // Checking off a task IS a write → host round trip, confirmation included.
    const result = await host.callTool("crm_complete_task", { id: task.id });
    if (result.isError) {
      setState(task.id, "open");
      return;
    }
    const text = result.content?.find((c) => c.type === "text");
    if (text?.text) host.updateModelContext(text.text);
    setState(task.id, "done");
  };

  return (
    <section className="hc-section">
      <h2 className="rc-section-label">Follow-ups</h2>
      {tasks.map((task) => {
        const state = states[task.id] ?? "open";
        const overdue = task.dueDate !== null && task.dueDate < today && state !== "done";
        return (
          <div key={task.id} className={`hc-task${overdue ? " hc-task--overdue" : ""}`}>
            {state === "confirming" ? (
              <span className="hc-task-confirm">
                Complete “{task.subject}” in {crmLabel}?
                <span className="hc-task-confirm-actions">
                  <button type="button" className="cs-link-btn" onClick={() => setState(task.id, "open")}>
                    Cancel
                  </button>
                  <button type="button" className="cs-btn cs-btn--primary" onClick={() => complete(task)}>
                    ✓ Confirm
                  </button>
                </span>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className={`hc-check${state === "done" ? " hc-check--done" : ""}`}
                  disabled={!writeEnabled || state !== "open"}
                  aria-label={`Complete ${task.subject}`}
                  onClick={() => setState(task.id, "confirming")}
                >
                  {state === "done" ? "✓" : state === "writing" ? "…" : ""}
                </button>
                <span className={`hc-task-subject${state === "done" ? " hc-task-subject--done" : ""}`}>
                  {task.subject}
                </span>
                <span className="cs-muted hc-task-meta">
                  {task.relatedRecordName && <>{task.relatedRecordName} · </>}
                  {overdue ? (
                    <span className="hc-overdue-label">overdue</span>
                  ) : task.dueDate ? (
                    formatDate(task.dueDate, locale)
                  ) : (
                    "no due date"
                  )}
                </span>
              </>
            )}
          </div>
        );
      })}
      {tasks.length === 0 && (
        <div className="cs-muted" style={{ fontSize: 12.5 }}>
          Nothing due — you&apos;re clear.
        </div>
      )}
    </section>
  );
}
