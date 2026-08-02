import { useState, type JSX, type ReactNode } from "react";
import type {
  RecalledMemoryEntity,
  RecalledMemoryFact,
  RecalledMemoryRecord,
} from "../../api/types";

/** Data handed to a custom recalled-memories renderer. */
export interface RecalledMemoriesRendererProps {
  /** The recall events anchored at this point of the conversation. */
  records: RecalledMemoryRecord[];
  /** True while the run that produced (or is producing) them is in flight. */
  isLoading: boolean;
}

/** Replaces the built-in "Recalled memories" strip. Return null to hide it. */
export type RecalledMemoriesRenderer = (
  props: RecalledMemoriesRendererProps
) => ReactNode;

const SOURCE_LABELS: Record<RecalledMemoryRecord["source"], string> = {
  conversation_start: "Automatic recall",
  search_memory: "Memory search",
  search_memory_nodes: "Graph node search",
  explore_memory_graph: "Graph exploration",
};

function dedupeFacts(records: RecalledMemoryRecord[]): RecalledMemoryFact[] {
  const seen = new Set<string>();
  const facts: RecalledMemoryFact[] = [];
  for (const record of records) {
    for (const fact of record.facts ?? []) {
      const key = (fact.fact ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}

function dedupeEntities(
  records: RecalledMemoryRecord[]
): RecalledMemoryEntity[] {
  const seen = new Set<string>();
  return records
    .flatMap((r) => r.entities ?? [])
    .filter((e) => {
      const key = (e.name ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function BrainIcon(): JSX.Element {
  return (
    <svg
      className="devic-recall-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 2a2.5 2.5 0 0 0-2.45 2A3.5 3.5 0 0 0 4.6 8.6 3.5 3.5 0 0 0 3 11.5c0 1.1.5 2.08 1.29 2.73A3.5 3.5 0 0 0 7 20a3 3 0 0 0 5-2.24V4.5A2.5 2.5 0 0 0 9.5 2Z" />
      <path d="M14.5 2a2.5 2.5 0 0 1 2.45 2 3.5 3.5 0 0 1 2.45 4.6A3.5 3.5 0 0 1 21 11.5a3.49 3.49 0 0 1-1.29 2.73A3.5 3.5 0 0 1 17 20a3 3 0 0 1-5-2.24V4.5A2.5 2.5 0 0 1 14.5 2Z" />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }): JSX.Element {
  return (
    <svg
      className="devic-recall-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: up ? "rotate(180deg)" : undefined }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export interface RecalledMemoriesWidgetProps {
  records: RecalledMemoryRecord[];
  /** True while the run that produced the records is still processing. */
  isLoading?: boolean;
  /** Custom renderer replacing the built-in strip. */
  renderer?: RecalledMemoriesRenderer;
}

/**
 * Collapsible "Recalled memories" strip interleaved in the chat with the
 * message that brought long-term memories into the conversation. Collapsed it
 * summarizes ("N facts · M entities"); expanded it lists the facts (with
 * their graph endpoints), the entities and any previous-session context.
 * Renders nothing when the records carry no content.
 */
export function RecalledMemoriesWidget({
  records,
  isLoading = false,
  renderer,
}: RecalledMemoriesWidgetProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (renderer) {
    return <>{renderer({ records, isLoading })}</>;
  }

  const facts = dedupeFacts(records);
  const entities = dedupeEntities(records);
  const turns = records
    .filter((r) => r.source === "conversation_start")
    .flatMap((r) => r.turns ?? []);
  const sources = [...new Set(records.map((r) => SOURCE_LABELS[r.source]))];

  if (!facts.length && !entities.length && !turns.length) return null;

  const summaryParts: string[] = [];
  if (facts.length) {
    summaryParts.push(`${facts.length} fact${facts.length > 1 ? "s" : ""}`);
  }
  if (entities.length) {
    summaryParts.push(
      `${entities.length} entit${entities.length > 1 ? "ies" : "y"}`
    );
  }

  return (
    <div className="devic-recall">
      <button
        type="button"
        className="devic-recall-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <BrainIcon />
        <span className="devic-recall-title">Recalled memories</span>
        {summaryParts.length > 0 && (
          <span className="devic-recall-summary">
            {summaryParts.join(" · ")}
          </span>
        )}
        <span className="devic-recall-spacer" />
        {sources.map((s) => (
          <span key={s} className="devic-recall-source">
            {s}
          </span>
        ))}
        <ChevronIcon up={expanded} />
      </button>

      {expanded && (
        <div className="devic-recall-body">
          {facts.length > 0 && (
            <div className="devic-recall-facts">
              {facts.map((fact, i) => (
                <div key={i} className="devic-recall-fact">
                  <span>{fact.fact}</span>
                  <span className="devic-recall-fact-meta">
                    {fact.source && fact.target
                      ? `${fact.source} → ${fact.relation} → ${fact.target}`
                      : fact.relation}
                    {fact.validAt ? ` · since ${fact.validAt.slice(0, 10)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {entities.length > 0 && (
            <div className="devic-recall-entities">
              {entities.map((entity) => (
                <span
                  key={entity.id}
                  className="devic-recall-entity"
                  title={entity.summary || undefined}
                >
                  {entity.name}
                  <span className="devic-recall-entity-type">
                    {" "}
                    · {entity.type}
                  </span>
                </span>
              ))}
            </div>
          )}

          {turns.length > 0 && (
            <div className="devic-recall-turns">
              <span className="devic-recall-turns-title">
                Previous session context
              </span>
              {turns.map((turn, i) => (
                <span key={i} className="devic-recall-turn">
                  <span className="devic-recall-turn-role">{turn.role}:</span>{" "}
                  {turn.content}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecalledMemoriesWidget;
