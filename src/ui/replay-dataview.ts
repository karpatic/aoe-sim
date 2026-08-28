import type {
  BrowserCompiledReplayV1,
  BrowserReplayAction,
  BrowserReplayChatMessage,
  BrowserReplayMap,
  BrowserReplayPlayerActionSummary,
  BrowserReplayUnsupportedEvidence,
  LocalReplayCompatibilityReport,
  LocalReplayComparison
} from "../replay/local-recording";
import { compareCodePoint } from "../replay/canonical-json";
import { assertCanonicalJsonByteLength, formatBytes, LOCAL_REPLAY_LIMITS } from "../replay/limits";
import { drawForestTerrainCanopy, forestTerrainFloorColor, isForestTerrainId } from "../render/tree-visuals";

export interface ReplayDataviewState {
  readonly playerFilter: string;
  readonly kindFilter: string;
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_REPLAY_DATAVIEW_STATE: ReplayDataviewState = {
  playerFilter: "all",
  kindFilter: "all",
  page: 0,
  pageSize: 50
};

type ReplayDataviewStateChange = (state: ReplayDataviewState) => void;

export function renderReplayDataview(
  root: HTMLElement,
  report: LocalReplayCompatibilityReport | undefined,
  stateText: string,
  state: ReplayDataviewState,
  onStateChange: ReplayDataviewStateChange
): void {
  root.replaceChildren();

  const header = document.createElement("div");
  header.className = "dataview-header";
  const title = document.createElement("h2");
  title.textContent = "Browser-Compiled Dataview";
  const status = document.createElement("p");
  status.className = "status";
  status.textContent = stateText;
  header.append(title, status);
  root.append(header);

  const compiled = report?.compiled;
  if (!compiled) {
    const empty = document.createElement("p");
    empty.className = "dataview-empty";
    empty.textContent = report?.summary ?? "Choose a local .aoe2record to compile the analytical dataview.";
    root.append(empty);
    return;
  }

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "dataview-summary-grid";
  summaryGrid.append(
    buildDefinitionPanel("Provenance", [
      ["file", `${compiled.recording.fileName} / ${formatBytes(compiled.recording.sizeBytes ?? 0)}`],
      ["replay content hash", compiled.recording.sha256],
      ["local", compiled.localBoundary.bytesStayLocal ? "bytes stayed in this browser worker" : "unknown"],
      ["compiled content hash", compiled.provenance.generatedArtifact.sha256],
      ["canonical content bytes", formatInteger(compiled.provenance.generatedArtifact.sizeBytes ?? 0)],
      ["parser", compiled.parser.parser.id],
      ["ruleset", `${compiled.provenance.ruleset.id} / ${compiled.provenance.ruleset.sha256}`]
    ]),
    buildDefinitionPanel("Game", [
      ["build", String(compiled.versions.build)],
      ["game", compiled.versions.gameString],
      ["duration", formatDuration(compiled.durationMs)],
      ["save/log", `${compiled.versions.saveVersion} / ${compiled.versions.logVersion ?? "n/a"}`],
      ["completion", formatCompletion(compiled)],
      ["population", String(compiled.gameSettings.populationLimit)],
      ["map ids", `${compiled.gameSettings.selectedMapId} -> ${compiled.gameSettings.resolvedMapId}`]
    ]),
    buildDefinitionPanel("Operations", [
      ["total", formatInteger(compiled.operations.total)],
      ["actions", formatInteger(compiled.actions.total)],
      ["chat", formatInteger(compiled.chat.total)],
      ["with actors", formatInteger(compiled.actions.actionsWithActors)],
      ["with targets", formatInteger(compiled.actions.actionsWithTargets)],
      ["with destinations", formatInteger(compiled.actions.actionsWithDestinations)]
    ])
  );
  root.append(summaryGrid);

  const bodyGrid = document.createElement("div");
  bodyGrid.className = "dataview-body-grid";
  bodyGrid.append(buildMapPanel(compiled.map), buildPlayersPanel(compiled), buildActionSummaryPanel(compiled));
  root.append(bodyGrid);

  root.append(buildChatPanel(compiled));
  root.append(buildTimelinePanel(compiled, state, onStateChange));
  root.append(buildEvidencePanel(compiled, report.comparisons));

  const actions = document.createElement("div");
  actions.className = "dataview-actions";
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download JSON";
  download.addEventListener("click", () => downloadCompiledJson(compiled));
  actions.append(download);
  root.append(actions);
}

function buildDefinitionPanel(titleText: string, rows: readonly (readonly [string, string])[]): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel";
  const title = document.createElement("h3");
  title.textContent = titleText;
  const list = document.createElement("dl");
  list.className = "diagnostics dataview-definition";

  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    list.append(term, detail);
  }

  panel.append(title, list);
  return panel;
}

function buildMapPanel(map: BrowserReplayMap | undefined): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel dataview-map-panel";
  const title = document.createElement("h3");
  title.textContent = "Map";
  panel.append(title);

  if (!map) {
    const empty = document.createElement("p");
    empty.className = "dataview-empty";
    empty.textContent = "Terrain and elevation grid unavailable from the selected replay parser output.";
    panel.append(empty);
    return panel;
  }

  const mapError = validateRenderableMap(map);
  if (mapError) {
    const empty = document.createElement("p");
    empty.className = "dataview-empty";
    empty.textContent = mapError;
    panel.append(empty);
    return panel;
  }

  const canvas = document.createElement("canvas");
  const cellSize = replayMapCellSize(map);
  canvas.className = "replay-map";
  canvas.width = map.widthTiles * cellSize;
  canvas.height = map.heightTiles * cellSize;
  canvas.dataset.forestVisualStrategy = "deterministic-canopy-no-tree-squares";
  canvas.setAttribute("aria-label", "Replay terrain and elevation map");
  drawReplayMap(canvas, map, cellSize);

  const stats = document.createElement("dl");
  stats.className = "diagnostics dataview-definition";
  appendDefinitionRows(stats, [
    ["dimensions", `${map.widthTiles}x${map.heightTiles}`],
    ["tiles", formatInteger(map.tileCount)],
    ["terrain", formatCounts(map.terrainCounts)],
    ["elevation", formatCounts(map.elevationCounts)],
    ["passability", map.tileGrid.passability]
  ]);

  panel.append(canvas, stats);
  return panel;
}

function buildPlayersPanel(compiled: BrowserCompiledReplayV1): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel";
  const title = document.createElement("h3");
  title.textContent = "Players";
  const table = document.createElement("table");
  table.className = "dataview-table";
  appendTableHead(table, ["player", "team", "civ", "color", "result"]);
  const body = document.createElement("tbody");

  for (const player of compiled.players) {
    const row = document.createElement("tr");
    row.append(
      cell(`${player.playerNumber}:${player.name}`),
      cell(String(player.resolvedTeamId)),
      cell(String(player.civilizationId)),
      cell(String(player.colorId)),
      cell(player.result)
    );
    body.append(row);
  }

  table.append(body);
  panel.append(title, table);
  return panel;
}

function buildActionSummaryPanel(compiled: BrowserCompiledReplayV1): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel";
  const title = document.createElement("h3");
  title.textContent = "Action Summary";
  const table = document.createElement("table");
  table.className = "dataview-table";
  appendTableHead(table, ["player", "actions", "top kinds", "span"]);
  const body = document.createElement("tbody");

  for (const summary of compiled.actions.byPlayer) {
    const row = document.createElement("tr");
    row.append(
      cell(formatPlayerSummary(summary)),
      cell(formatInteger(summary.total)),
      cell(formatTopCounts(summary.byKind, 5)),
      cell(formatActionSpan(summary))
    );
    body.append(row);
  }

  if (!compiled.actions.byPlayer.length) {
    const row = document.createElement("tr");
    const empty = cell("No parser Action rows were exposed.");
    empty.colSpan = 4;
    row.append(empty);
    body.append(row);
  }

  table.append(body);
  panel.append(title, table);
  return panel;
}

function buildChatPanel(compiled: BrowserCompiledReplayV1): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel dataview-chat-panel";
  const title = document.createElement("h3");
  title.textContent = "Chat";
  const disclosure = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent =
    `${formatInteger(compiled.chat.total)} chat rows, ` +
    `${formatInteger(compiled.chat.omittedCount)} omitted, ` +
    `${formatInteger(compiled.chat.truncatedTextCount)} capped`;
  disclosure.append(summary);

  const table = document.createElement("table");
  table.className = "dataview-table dataview-chat-table";
  appendTableHead(table, ["op", "time", "sender", "source", "evidence", "message"]);
  const body = document.createElement("tbody");

  for (const message of compiled.chat.messages) {
    const row = document.createElement("tr");
    row.append(
      cell(String(message.operationIndex)),
      cell(message.issuedAtMs === undefined ? `op ${message.operationIndex}` : formatDuration(message.issuedAtMs)),
      cell(message.playerId ?? "unknown"),
      cell(formatChatSource(message)),
      cell(message.evidence),
      cell(formatChatText(message))
    );
    body.append(row);
  }

  if (!compiled.chat.messages.length) {
    const row = document.createElement("tr");
    const empty = cell("No parser Chat rows were exposed.");
    empty.colSpan = 6;
    row.append(empty);
    body.append(row);
  }

  table.append(body);
  disclosure.append(table);
  panel.append(title, disclosure);
  return panel;
}

function buildTimelinePanel(
  compiled: BrowserCompiledReplayV1,
  state: ReplayDataviewState,
  onStateChange: ReplayDataviewStateChange
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel dataview-timeline-panel";
  const headingRow = document.createElement("div");
  headingRow.className = "dataview-panel-heading";
  const title = document.createElement("h3");
  title.textContent = "Action Timeline";
  const controls = buildTimelineControls(compiled, state, onStateChange);
  headingRow.append(title, controls);
  panel.append(headingRow);

  const filtered = filterActions(compiled.actions.timeline, state);
  const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  const page = Math.min(Math.max(state.page, 0), pageCount - 1);
  const pageStart = page * state.pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + state.pageSize);
  const meta = document.createElement("p");
  meta.className = "dataview-meta";
  meta.textContent = `${formatInteger(filtered.length)} rows / page ${page + 1} of ${pageCount}`;
  panel.append(meta);

  const pager = buildPager(page, pageCount, state, onStateChange);
  panel.append(pager);

  const table = document.createElement("table");
  table.className = "dataview-table dataview-timeline-table";
  appendTableHead(table, ["seq", "time", "player", "kind", "actors", "target", "destination", "data"]);
  const body = document.createElement("tbody");

  for (const action of pageRows) {
    const row = document.createElement("tr");
    row.append(
      cell(String(action.actionIndex + 1)),
      cell(action.issuedAtMs === undefined ? `op ${action.operationIndex}` : formatDuration(action.issuedAtMs)),
      cell(action.playerId ?? "unknown"),
      cell(action.mappedScenarioKind ?? action.kind),
      cell(formatIds(action.actorIds)),
      cell(action.targetId === undefined ? "" : String(action.targetId)),
      cell(formatPoint(action.destination)),
      cell(formatDataIds(action.dataIds))
    );
    body.append(row);
  }

  if (!pageRows.length) {
    const row = document.createElement("tr");
    const empty = cell("No actions match the current filters.");
    empty.colSpan = 8;
    row.append(empty);
    body.append(row);
  }

  table.append(body);
  panel.append(table);
  return panel;
}

function buildEvidencePanel(
  compiled: BrowserCompiledReplayV1,
  comparisons: readonly LocalReplayComparison[]
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "dataview-panel dataview-evidence-panel";
  const title = document.createElement("h3");
  title.textContent = "Evidence";
  panel.append(title);

  const parity = document.createElement("details");
  const paritySummary = document.createElement("summary");
  paritySummary.textContent = formatParitySummary(comparisons);
  parity.append(paritySummary, buildComparisonList(compiled.fixtureOracle.equivalentFieldParity));

  const unsupported = document.createElement("details");
  const unsupportedSummary = document.createElement("summary");
  unsupportedSummary.textContent = `${compiled.unsupportedEvidence.length} unsupported or partial areas`;
  unsupported.append(unsupportedSummary, buildUnsupportedList(compiled.unsupportedEvidence));

  panel.append(parity, unsupported);
  return panel;
}

function buildTimelineControls(
  compiled: BrowserCompiledReplayV1,
  state: ReplayDataviewState,
  onStateChange: ReplayDataviewStateChange
): HTMLElement {
  const controls = document.createElement("div");
  controls.className = "dataview-controls";
  const player = document.createElement("select");
  player.setAttribute("aria-label", "Player filter");
  player.append(new Option("All players", "all"));
  for (const summary of compiled.actions.byPlayer) {
    player.append(new Option(formatPlayerSummary(summary), summary.playerId));
  }
  player.value = state.playerFilter;
  player.addEventListener("change", () => {
    onStateChange({
      ...state,
      playerFilter: player.value,
      page: 0
    });
  });

  const kind = document.createElement("select");
  kind.setAttribute("aria-label", "Action kind filter");
  kind.append(new Option("All kinds", "all"));
  for (const actionKind of Object.keys(compiled.actions.byKind).sort(compareCodePoint)) {
    kind.append(new Option(actionKind, actionKind));
  }
  kind.value = state.kindFilter;
  kind.addEventListener("change", () => {
    onStateChange({
      ...state,
      kindFilter: kind.value,
      page: 0
    });
  });

  const pageSize = document.createElement("select");
  pageSize.setAttribute("aria-label", "Rows per page");
  for (const size of [25, 50, 100]) {
    pageSize.append(new Option(`${size} rows`, String(size)));
  }
  pageSize.value = String(state.pageSize);
  pageSize.addEventListener("change", () => {
    onStateChange({
      ...state,
      pageSize: Number(pageSize.value) || DEFAULT_REPLAY_DATAVIEW_STATE.pageSize,
      page: 0
    });
  });

  controls.append(player, kind, pageSize);
  return controls;
}

function buildPager(
  page: number,
  pageCount: number,
  state: ReplayDataviewState,
  onStateChange: ReplayDataviewStateChange
): HTMLElement {
  const pager = document.createElement("div");
  pager.className = "dataview-pager";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Previous";
  previous.disabled = page <= 0;
  previous.addEventListener("click", () => {
    onStateChange({
      ...state,
      page: Math.max(0, page - 1)
    });
  });

  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.disabled = page >= pageCount - 1;
  next.addEventListener("click", () => {
    onStateChange({
      ...state,
      page: Math.min(pageCount - 1, page + 1)
    });
  });

  pager.append(previous, next);
  return pager;
}

function buildComparisonList(comparisons: readonly LocalReplayComparison[]): HTMLElement {
  const list = document.createElement("ul");
  for (const comparison of comparisons) {
    const item = document.createElement("li");
    item.textContent = `${comparison.area} / ${comparison.label}: ${comparison.status}`;
    if (comparison.expected !== undefined || comparison.actual !== undefined) {
      item.textContent += ` (${comparison.expected ?? "n/a"} -> ${comparison.actual ?? "n/a"})`;
    }
    list.append(item);
  }
  return list;
}

function buildUnsupportedList(unsupportedEvidence: readonly BrowserReplayUnsupportedEvidence[]): HTMLElement {
  const list = document.createElement("ul");
  for (const unsupported of unsupportedEvidence) {
    const item = document.createElement("li");
    item.textContent = `[${unsupported.evidence}] ${unsupported.area}: ${unsupported.message}`;
    if (unsupported.count !== undefined) {
      item.textContent += ` (${formatInteger(unsupported.count)})`;
    }
    list.append(item);
  }
  return list;
}

function filterActions(
  actions: readonly BrowserReplayAction[],
  state: ReplayDataviewState
): readonly BrowserReplayAction[] {
  return actions.filter(
    (action) =>
      (state.playerFilter === "all" || action.playerId === state.playerFilter) &&
      (state.kindFilter === "all" || action.kind === state.kindFilter)
  );
}

function replayMapCellSize(map: BrowserReplayMap): number {
  const largestDimension = Math.max(map.widthTiles, map.heightTiles);
  if (largestDimension > 512) {
    return 2;
  }
  if (largestDimension > 256) {
    return 3;
  }
  return 6;
}

function drawReplayMap(canvas: HTMLCanvasElement, map: BrowserReplayMap, cellSize: number): void {
  if (validateRenderableMap(map)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.imageSmoothingEnabled = false;
  const forestTiles: { x: number; y: number; terrain: number; elevation: number }[] = [];
  for (let index = 0; index < map.tileCount; index += 1) {
    const terrain = map.tileGrid.terrainIds[index];
    const elevation = map.tileGrid.elevations[index];
    if (terrain === undefined || elevation === undefined) {
      return;
    }
    const x = index % map.widthTiles;
    const y = Math.floor(index / map.widthTiles);
    if (isForestTerrainId(terrain)) {
      forestTiles.push({ x, y, terrain, elevation });
      context.fillStyle = forestTerrainFloorColor(terrain, elevation);
    } else {
      context.fillStyle = rgbColor(colorForTerrain(terrain, elevation));
    }
    context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  }
  for (const tile of forestTiles) {
    drawForestTerrainCanopy(
      context,
      tile.x * cellSize + cellSize / 2,
      tile.y * cellSize + cellSize / 2,
      cellSize,
      tile.terrain,
      tile.elevation,
      [tile.x, tile.y, tile.terrain]
    );
  }
  canvas.dataset.forestTerrainTiles = String(forestTiles.length);
}

function validateRenderableMap(map: BrowserReplayMap): string | undefined {
  if (!Number.isSafeInteger(map.widthTiles) || map.widthTiles <= 0) {
    return `Map width must be a positive safe integer before canvas allocation; received ${map.widthTiles}.`;
  }
  if (!Number.isSafeInteger(map.heightTiles) || map.heightTiles <= 0) {
    return `Map height must be a positive safe integer before canvas allocation; received ${map.heightTiles}.`;
  }
  if (
    map.widthTiles > LOCAL_REPLAY_LIMITS.maxMapDimensionTiles ||
    map.heightTiles > LOCAL_REPLAY_LIMITS.maxMapDimensionTiles
  ) {
    return (
      `Map dimensions ${map.widthTiles}x${map.heightTiles} exceed the local dataview limit of ` +
      `${LOCAL_REPLAY_LIMITS.maxMapDimensionTiles} tiles per side.`
    );
  }
  if (!Number.isSafeInteger(map.tileCount) || map.tileCount < 0) {
    return `Map tile count must be a safe nonnegative integer; received ${map.tileCount}.`;
  }
  if (map.tileCount > LOCAL_REPLAY_LIMITS.maxMapTiles) {
    return `Map tile count ${map.tileCount} exceeds the local dataview limit of ${LOCAL_REPLAY_LIMITS.maxMapTiles}.`;
  }

  const expectedTileCount = map.widthTiles * map.heightTiles;
  if (!Number.isSafeInteger(expectedTileCount) || expectedTileCount !== map.tileCount) {
    return `Map tile arrays do not corroborate dimensions ${map.widthTiles}x${map.heightTiles}.`;
  }
  if (
    map.tileGrid.widthTiles !== map.widthTiles ||
    map.tileGrid.heightTiles !== map.heightTiles ||
    map.tileGrid.terrainIds.length !== map.tileCount ||
    map.tileGrid.elevations.length !== map.tileCount
  ) {
    return "Map tile grid dimensions and terrain/elevation array lengths do not corroborate the map header.";
  }

  for (let index = 0; index < map.tileCount; index += 1) {
    if (!isSafeNonnegativeInteger(map.tileGrid.terrainIds[index])) {
      return `Map terrain id at index ${index} is not a safe nonnegative integer.`;
    }
    if (!isSafeNonnegativeInteger(map.tileGrid.elevations[index])) {
      return `Map elevation at index ${index} is not a safe nonnegative integer.`;
    }
  }

  return undefined;
}

function colorForTerrain(terrain: number, elevation: number): readonly [number, number, number] {
  const base = terrainPalette(terrain);
  const lift = Math.max(-20, Math.min(35, elevation * 12));
  return [
    clampColor(base[0] + lift),
    clampColor(base[1] + lift),
    clampColor(base[2] + lift)
  ];
}

function terrainPalette(terrain: number): readonly [number, number, number] {
  switch (terrain) {
    case 3:
      return [91, 131, 74];
    case 11:
      return [71, 105, 67];
    case 14:
      return [92, 132, 157];
    case 48:
      return [139, 128, 92];
    case 89:
      return [55, 112, 96];
    case 112:
      return [108, 144, 79];
    default:
      return [92, 94, 104];
  }
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbColor([red, green, blue]: readonly [number, number, number]): string {
  return `rgb(${red} ${green} ${blue})`;
}

function appendDefinitionRows(list: HTMLDListElement, rows: readonly (readonly [string, string])[]): void {
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    list.append(term, detail);
  }
}

function appendTableHead(table: HTMLTableElement, columns: readonly string[]): void {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  for (const column of columns) {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = column;
    row.append(heading);
  }
  head.append(row);
  table.append(head);
}

function cell(value: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = value;
  return element;
}

function downloadCompiledJson(compiled: BrowserCompiledReplayV1): void {
  const json = JSON.stringify(compiled, null, 2);
  const jsonBytes = new TextEncoder().encode(json);
  try {
    assertCanonicalJsonByteLength(jsonBytes.byteLength, "Browser-compiled replay download JSON");
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
    return;
  }

  const blob = new Blob([jsonBytes], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${compiled.provenance.generatedArtifact.id}.json`;
  link.tabIndex = -1;
  link.setAttribute("aria-hidden", "true");
  link.style.position = "absolute";
  link.style.left = "-9999px";
  link.style.width = "1px";
  link.style.height = "1px";
  link.style.overflow = "hidden";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

function formatParitySummary(comparisons: readonly LocalReplayComparison[]): string {
  const counts: Record<LocalReplayComparison["status"], number> = {
    match: 0,
    mismatch: 0,
    partial: 0,
    unsupported: 0
  };
  for (const comparison of comparisons) {
    counts[comparison.status] += 1;
  }

  return `${counts.match} match, ${counts.partial} partial, ${counts.mismatch} mismatch`;
}

function formatPlayerSummary(summary: BrowserReplayPlayerActionSummary): string {
  if (summary.playerNumber !== undefined && summary.name) {
    return `${summary.playerNumber}:${summary.name}`;
  }
  if (summary.playerNumber !== undefined) {
    return `p${summary.playerNumber}`;
  }
  return summary.playerId;
}

function formatActionSpan(summary: BrowserReplayPlayerActionSummary): string {
  if (summary.firstActionMs !== undefined && summary.lastActionMs !== undefined) {
    return `${formatDuration(summary.firstActionMs)}-${formatDuration(summary.lastActionMs)}`;
  }

  return `ops ${summary.firstOperationIndex}-${summary.lastOperationIndex}`;
}

function formatTopCounts(counts: Record<string, number>, limit: number): string {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || compareCodePoint(left[0], right[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key}:${formatInteger(count)}`)
    .join(", ");
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([left], [right]) => compareCodePoint(left, right))
    .map(([key, count]) => `${key}:${formatInteger(count)}`)
    .join(", ");
}

function formatIds(ids: readonly number[]): string {
  if (!ids.length) {
    return "";
  }

  const visible = ids.slice(0, 6).join(", ");
  return ids.length > 6 ? `${visible} +${formatInteger(ids.length - 6)}` : visible;
}

function formatPoint(point: BrowserReplayAction["destination"]): string {
  if (!point) {
    return "";
  }

  const suffix = point.isMapCoordinate ? "" : " outside map";
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}${suffix}`;
}

function formatDataIds(dataIds: Record<string, number>): string {
  return Object.entries(dataIds)
    .sort(([left], [right]) => compareCodePoint(left, right))
    .slice(0, 4)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function formatCompletion(compiled: BrowserCompiledReplayV1): string {
  const completion = compiled.outcome.completion;
  return completion.complete && completion.worldTimeMs !== undefined
    ? `${completion.source} ${formatDuration(completion.worldTimeMs)}`
    : "unknown";
}

function formatChatSource(message: BrowserReplayChatMessage): string {
  switch (message.textSource) {
    case "decoded-message":
      return message.textTruncated ? "decoded capped" : "decoded";
    case "raw-parser-text":
      return message.textTruncated ? "raw capped" : "raw";
    case "none":
      return "none";
  }
}

function formatChatText(message: BrowserReplayChatMessage): string {
  return message.decodedText ?? message.rawText ?? "";
}

function isSafeNonnegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
