import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import type { ErcFindingWithHints } from '../erc/types';
import { buildNets } from '../erc/nets';
import { getPartMeta } from '../parts';
import type { SimulationResult } from '../sim/dcSim';

export interface BuildCircuitContextInput {
  project: {
    id: string;
    name: string;
    task?: { title: string; goal: string } | null;
  };
  components: PlacedComponent[];
  wires: WireConnection[];
  selection: {
    componentIds: string[];
    connectionIds: string[];
  };
  findings: ErcFindingWithHints[];
  simulation?: {
    running: boolean;
    result?: SimulationResult | null;
  };
}

export interface CircuitContextComponent {
  id: string;
  type: string;
  label: string;
  name: string;
  props: Record<string, string>;
}

export interface CircuitContextConnection {
  from: string;
  to: string;
  net?: string;
}

export interface CircuitContextValidation {
  severity: 'error' | 'warning' | 'info';
  componentId: string;
  message: string;
}

export interface CircuitContextSimulation {
  running: boolean;
  hasShortCircuit?: boolean;
  totalCurrentMa?: number;
  summary?: string;
  nodeVoltages?: Record<string, number>;
  currents?: Record<string, number>;
}

export interface CircuitContextPayload {
  project: {
    id: string;
    name: string;
    task?: { title: string; goal: string };
  };
  components: CircuitContextComponent[];
  connections: CircuitContextConnection[];
  selection: {
    componentIds: string[];
    connectionIds: string[];
  };
  validation: CircuitContextValidation[];
  simulation?: CircuitContextSimulation;
  meta: {
    componentCount: number;
    connectionCount: number;
    truncated: boolean;
    summary?: Record<string, number>;
  };
}

const DEFAULT_MAX_CHARS = 14000; // ~3.5k-4k tokens

function formatPinEndpoint(
  compMap: Map<string, PlacedComponent>,
  compId: string | undefined,
  pinIndex: number | string | undefined
): string {
  if (!compId) return 'unknown';
  const comp = compMap.get(compId);
  const label = comp?.designator || compId;
  if (pinIndex === undefined || pinIndex === null) return label;

  const idxNum = typeof pinIndex === 'number' ? pinIndex : Number(pinIndex);
  if (comp && Number.isFinite(idxNum)) {
    const meta = getPartMeta(comp.partId);
    const pinDef = meta.pins[idxNum];
    if (pinDef?.name) {
      return `${label}.${pinDef.name}`;
    }
  }
  return `${label}.pin${pinIndex}`;
}

/**
 * Capture live canvas state for the AI mentor.
 * Strips pixel coordinates & UI-only fields, resolves pin names and nets,
 * and truncates large circuits while preserving selected components in full.
 */
export function buildCircuitContext(
  input: BuildCircuitContextInput,
  maxChars: number = DEFAULT_MAX_CHARS
): CircuitContextPayload {
  const { project, components, wires, selection, findings, simulation } = input;

  const compMap = new Map<string, PlacedComponent>();
  for (const c of components) {
    compMap.set(c.id, c);
  }

  // Build deterministic electrical nets and assign short readable names N1, N2...
  const nets = buildNets(components, wires);
  const pinToNetName = new Map<string, string>();
  let netCounter = 1;
  for (const net of nets) {
    if (net.pins.length > 1) {
      const hasGnd = net.pins.some((p) => p.role === 'gnd' || p.partId === 'ground');
      const netName = hasGnd ? `GND_${netCounter}` : `N${netCounter}`;
      netCounter += 1;
      for (const p of net.pins) {
        pinToNetName.set(`${p.compId}.${p.pinIndex}`, netName);
      }
    }
  }

  // Strip pixel positions (x, y, rotation) and UI-only fields
  const allComponents: CircuitContextComponent[] = components.map((c) => ({
    id: c.id,
    type: c.partId,
    label: c.designator,
    name: c.name,
    props: c.params ? { ...c.params } : {},
  }));

  const allConnections: CircuitContextConnection[] = wires.map((w) => {
    const fromId = w.fromId ?? (w as any).from?.c;
    const fromPin = w.fromPin ?? (w as any).from?.pin;
    const toId = w.toId ?? (w as any).to?.c;
    const toPin = w.toPin ?? (w as any).to?.pin;
    const netName =
      pinToNetName.get(`${fromId}.${fromPin}`) ??
      pinToNetName.get(`${toId}.${toPin}`) ??
      (w.netType && w.netType !== 'signal' ? w.netType.toUpperCase() : undefined);

    const conn: CircuitContextConnection = {
      from: formatPinEndpoint(compMap, fromId, fromPin),
      to: formatPinEndpoint(compMap, toId, toPin),
    };
    if (netName) conn.net = netName;
    return conn;
  });

  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const allValidation: CircuitContextValidation[] = [...findings]
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))
    .map((f) => ({
      severity: f.severity,
      componentId: f.anchorId,
      message: f.detail ? `${f.title} — ${f.detail}` : f.title,
    }));

  let simPayload: CircuitContextSimulation | undefined;
  if (simulation?.running && simulation.result) {
    const res = simulation.result;
    const nodeVoltages: Record<string, number> = {};
    const currents: Record<string, number> = {};
    for (const telemetry of Object.values(res.componentTelemetry || {})) {
      nodeVoltages[telemetry.designator] = telemetry.voltageDrop;
      currents[telemetry.designator] = telemetry.currentMa;
    }
    simPayload = {
      running: true,
      hasShortCircuit: res.hasShortCircuit,
      totalCurrentMa: res.totalCurrentMa,
      summary: res.summary,
      nodeVoltages,
      currents,
    };
  }

  const projectPayload: CircuitContextPayload['project'] = {
    id: project.id,
    name: project.name,
  };
  if (project.task) {
    projectPayload.task = {
      title: project.task.title,
      goal: project.task.goal,
    };
  }

  const fullPayload: CircuitContextPayload = {
    project: projectPayload,
    components: allComponents,
    connections: allConnections,
    selection: {
      componentIds: [...selection.componentIds],
      connectionIds: [...selection.connectionIds],
    },
    validation: allValidation,
    ...(simPayload ? { simulation: simPayload } : {}),
    meta: {
      componentCount: allComponents.length,
      connectionCount: allConnections.length,
      truncated: false,
    },
  };

  if (JSON.stringify(fullPayload).length <= maxChars) {
    return fullPayload;
  }

  // Size exceeded budget: prioritize selected components + summarized type counts
  const selectedSet = new Set(selection.componentIds);
  const keptComponents = allComponents.filter((c) => selectedSet.has(c.id));
  const keptIds = new Set(keptComponents.map((c) => c.id));

  // Add remaining components greedily up to 15 if budget permits
  for (const c of allComponents) {
    if (keptComponents.length >= 15) break;
    if (!keptIds.has(c.id)) {
      keptComponents.push(c);
      keptIds.add(c.id);
    }
  }

  const summary: Record<string, number> = {};
  for (const c of allComponents) {
    summary[c.type] = (summary[c.type] || 0) + 1;
  }

  const keptLabels = new Set(keptComponents.map((c) => c.label));
  const keptConnections = allConnections
    .filter((conn) => {
      const fromLabel = conn.from.split('.')[0] ?? '';
      const toLabel = conn.to.split('.')[0] ?? '';
      return keptLabels.has(fromLabel) || keptLabels.has(toLabel);
    })
    .slice(0, 30);

  const truncatedPayload: CircuitContextPayload = {
    project: projectPayload,
    components: keptComponents,
    connections: keptConnections,
    selection: {
      componentIds: [...selection.componentIds],
      connectionIds: [...selection.connectionIds],
    },
    validation: allValidation.slice(0, 12),
    ...(simPayload
      ? {
          simulation: {
            running: true,
            hasShortCircuit: simPayload.hasShortCircuit,
            totalCurrentMa: simPayload.totalCurrentMa,
            summary: simPayload.summary,
          },
        }
      : {}),
    meta: {
      componentCount: allComponents.length,
      connectionCount: allConnections.length,
      truncated: true,
      summary,
    },
  };

  // Final hard trim if still over maxChars (e.g. huge selection)
  while (
    JSON.stringify(truncatedPayload).length > maxChars &&
    truncatedPayload.connections.length > 0
  ) {
    truncatedPayload.connections.pop();
  }
  while (
    JSON.stringify(truncatedPayload).length > maxChars &&
    truncatedPayload.components.length > 1
  ) {
    truncatedPayload.components.pop();
  }

  return truncatedPayload;
}
