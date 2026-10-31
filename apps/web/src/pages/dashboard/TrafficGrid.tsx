// Live traffic table, built on AG Grid and themed to the Doorman design system.
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef } from "react";
import { clock, money } from "../../lib/format";
import { AgentAvatar, DecisionBadge, IdentityBadge } from "../../ui/status";
import { MONEY_COLOUR, type Row } from "./rows";
import "./dashboard.css";

ModuleRegistry.registerModules([AllCommunityModule]);

// From the design system's "AG Grid theme params".
const theme = themeQuartz.withParams({
  fontFamily: "'Instrument Sans', system-ui, sans-serif",
  fontSize: 14,
  headerFontSize: 12.5,
  headerFontWeight: 600,
  headerTextColor: "#4A4D55",
  foregroundColor: "#15171C",
  rowHeight: 46,
  headerHeight: 42,
  backgroundColor: "#FFFFFF",
  headerBackgroundColor: "#FAF9F6",
  borderColor: "#E4E2DC",
  rowBorder: { color: "#EEEDE8" },
  rowHoverColor: "#F7F6F2",
  selectedRowBackgroundColor: "#F1F0EB",
  wrapperBorderRadius: 12,
  wrapperBorder: { color: "#E4E2DC" },
  columnBorder: false,
  headerColumnBorder: false,
  accentColor: "#15171C",
  cellHorizontalPadding: 12,
});

const DECISION_ORDER = { allowed: 0, step_up: 1, throttled: 2, blocked: 3 };

function AgentCell({ data, context }: ICellRendererParams<Row, unknown, { showOperatorBelow: boolean }>) {
  if (!data) return null;
  const sub = data.source ?? (context.showOperatorBelow ? data.operator : null);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, height: "100%" }}>
      <AgentAvatar name={data.name} />
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ fontWeight: 600, color: data.name ? "#15171C" : "#4A4D55" }}>{data.name ?? "Unknown"}</span>
        {sub && (
          <span
            style={{
              fontFamily: data.source ? "var(--mono)" : "inherit",
              fontSize: 12,
              color: "#6B6E76",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}

function AmountCell({ data }: ICellRendererParams<Row>) {
  if (!data) return null;
  if (data.amountCents == null) return <span style={{ color: "#B5B7BC" }}>—</span>;
  const released = data.money === "Released" || data.money === "Declined";
  return (
    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 7 }}>
      <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: released ? "#6B6E76" : "#15171C", textDecoration: released ? "line-through" : "none" }}>
        {money(data.amountCents, { decimals: true })}
      </span>
      {data.money && <span style={{ fontSize: 12, fontWeight: 600, color: MONEY_COLOUR[data.money] }}>{data.money}</span>}
    </span>
  );
}

export function TrafficGrid({
  rows,
  chatOpen,
  selectedId,
  onSelect,
  overlay,
}: {
  rows: Row[];
  chatOpen: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  overlay: React.ReactNode;
}) {
  const gridApi = useRef<GridApi<Row> | null>(null);

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      {
        headerName: "Time",
        field: "at",
        width: chatOpen ? 84 : 92,
        sortable: true,
        sort: "desc",
        valueFormatter: (p) => clock(p.value as string),
        cellClass: "dm-cell-time",
      },
      {
        headerName: "Agent",
        colId: "agent",
        width: chatOpen ? 170 : 172,
        sortable: true,
        valueGetter: (p) => p.data?.name ?? "Unknown",
        cellRenderer: AgentCell,
      },
      { headerName: "Operator", field: "operator", width: 150, hide: chatOpen, valueFormatter: (p) => (p.value as string | null) ?? "—", cellClass: "dm-cell-muted" },
      {
        headerName: "Identity",
        field: "tier",
        width: chatOpen ? 168 : 176,
        cellRenderer: (p: ICellRendererParams<Row>) => p.data && <IdentityBadge tier={p.data.tier} />,
      },
      {
        headerName: "Customer",
        field: "customer",
        width: chatOpen ? 96 : 104,
        valueFormatter: (p) => (p.value as string | null) ?? "—",
        cellClassRules: { "dm-cell-empty": (p) => !p.value },
      },
      { headerName: "Action", field: "action", width: chatOpen ? 112 : 122 },
      {
        headerName: "Decision",
        field: "decision",
        width: chatOpen ? 124 : 132,
        sortable: true,
        comparator: (a: Row["decision"], b: Row["decision"]) => DECISION_ORDER[a] - DECISION_ORDER[b],
        cellRenderer: (p: ICellRendererParams<Row>) => p.data && <DecisionBadge decision={p.data.decision} />,
      },
      { headerName: "Reason", field: "reason", flex: 1, minWidth: chatOpen ? 80 : 160, cellClass: "dm-cell-reason", tooltipField: "reason" },
      {
        headerName: "Amount",
        field: "amountCents",
        width: chatOpen ? 118 : 132,
        sortable: true,
        headerClass: "dm-header-right",
        cellRenderer: AmountCell,
      },
    ],
    [chatOpen],
  );

  // Keep the grid's highlighted row in step with the open detail panel.
  useEffect(() => {
    const grid = gridApi.current;
    if (!grid) return;
    if (!selectedId) grid.deselectAll();
    else grid.getRowNode(selectedId)?.setSelected(true, true);
  }, [selectedId]);

  return (
    <div className="dm-grid" style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <AgGridReact<Row>
        theme={theme}
        rowData={rows}
        columnDefs={columns}
        context={{ showOperatorBelow: chatOpen }}
        defaultColDef={{ sortable: false, resizable: false, suppressMovable: true }}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        rowClassRules={{ "dm-row-fresh": (p) => p.data?.freshAt != null }}
        onRowClicked={(e) => e.data && onSelect(e.data.id)}
        onGridReady={(e) => (gridApi.current = e.api)}
        suppressCellFocus
        suppressNoRowsOverlay
        animateRows
        tooltipShowDelay={600}
      />
      {overlay && <div style={{ position: "absolute", inset: "42px 0 0 0", pointerEvents: "none" }}>{overlay}</div>}
    </div>
  );
}
