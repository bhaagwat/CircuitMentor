/**
 * Deterministic DC circuit simulator for CircuitMentor.
 * Pure TypeScript — computes loop currents, component voltage drops, power dissipation,
 * LED operating states, short-circuit detection, and energized wire currents.
 */

import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import { buildNets, type Net } from '../erc/nets';

export interface LedSimState {
  compId: string;
  designator: string;
  status: 'off' | 'lit' | 'overcurrent' | 'reversed';
  currentMa: number;
  maxCurrentMa: number;
}

export interface ComponentTelemetry {
  compId: string;
  designator: string;
  voltageDrop: number;
  currentMa: number;
  powerMw: number;
  stateText: string;
}

export interface SimulationResult {
  hasShortCircuit: boolean;
  totalCurrentMa: number;
  ledStates: Record<string, LedSimState>;
  componentTelemetry: Record<string, ComponentTelemetry>;
  wireCurrents: Record<string, number>;
  activeWireIds: string[];
  summary: string;
  severity: 'ok' | 'warning' | 'error';
}

export function parseNumericWithUnit(raw: string | undefined, fallback: number): { value: number; unit: string } {
  if (!raw) return { value: fallback, unit: '' };
  const match = raw.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
  if (!match) return { value: fallback, unit: '' };
  const num = Number(match[1]);
  return { value: Number.isFinite(num) ? num : fallback, unit: (match[2] ?? '').trim() };
}

export function parseResistanceOhms(raw: string | undefined, fallbackOhms = 1000): number {
  const { value, unit } = parseNumericWithUnit(raw, fallbackOhms);
  const u = unit.toLowerCase();
  if (u.startsWith('m')) return value * 1_000_000;
  if (u.startsWith('k')) return value * 1_000;
  return value;
}

export function parseVoltageVolts(raw: string | undefined, fallbackVolts = 9): number {
  const { value, unit } = parseNumericWithUnit(raw, fallbackVolts);
  const u = unit.toLowerCase();
  if (u === 'mv') return value / 1000;
  if (u === 'kv') return value * 1000;
  return value;
}

export function parseCurrentMa(raw: string | undefined, fallbackMa = 20): number {
  const { value, unit } = parseNumericWithUnit(raw, fallbackMa);
  const u = unit.toLowerCase();
  if (u === 'a') return value * 1000;
  if (u === 'µa' || u === 'ua') return value / 1000;
  return value;
}

function findNetForPin(nets: Net[], compId: string, pinIndex: number): Net | undefined {
  return nets.find((n) => n.pins.some((p) => p.compId === compId && p.pinIndex === pinIndex));
}

/**
 * Simulate DC operating point across loops (sources -> series/parallel loads -> ground/return).
 */
export function runDcSimulation(
  components: PlacedComponent[],
  wires: WireConnection[]
): SimulationResult {
  const nets = buildNets(components, wires);
  const compMap = new Map(components.map((c) => [c.id, c]));
  const ledStates: Record<string, LedSimState> = {};
  const componentTelemetry: Record<string, ComponentTelemetry> = {};
  const wireCurrents: Record<string, number> = {};

  // Initialize LED states
  for (const c of components) {
    if (c.partId === 'led.5mm.red') {
      ledStates[c.id] = {
        compId: c.id,
        designator: c.designator,
        status: 'off',
        currentMa: 0,
        maxCurrentMa: parseCurrentMa(c.params.max_current ?? c.params.if_max, 20),
      };
    }
  }

  // 1. Detect Direct VCC-to-GND Short Circuit
  const hasShortCircuit = nets.some(
    (n) => n.pins.some((p) => p.role === 'vcc') && n.pins.some((p) => p.role === 'gnd')
  );

  if (hasShortCircuit) {
    const shortNetIds = new Set(
      nets
        .filter((n) => n.pins.some((p) => p.role === 'vcc') && n.pins.some((p) => p.role === 'gnd'))
        .map((n) => n.id)
    );

    const activeWireIds = wires
      .filter((w) => {
        const net = findNetForPin(nets, w.fromId, w.fromPin);
        return net ? shortNetIds.has(net.id) : false;
      })
      .map((w) => w.id);

    const shortCircuitCurrent = 1400; // ~1.4 A from internal battery impedance

    activeWireIds.forEach((wid) => {
      wireCurrents[wid] = shortCircuitCurrent;
    });

    components.forEach((c) => {
      if (c.partId.startsWith('battery') || c.partId === 'arduino.uno') {
        componentTelemetry[c.id] = {
          compId: c.id,
          designator: c.designator,
          voltageDrop: 9,
          currentMa: shortCircuitCurrent,
          powerMw: 9 * shortCircuitCurrent,
          stateText: `CRITICAL SHORT · ${shortCircuitCurrent} mA overload!`,
        };
      }
    });

    return {
      hasShortCircuit: true,
      totalCurrentMa: shortCircuitCurrent,
      ledStates,
      componentTelemetry,
      wireCurrents,
      activeWireIds,
      summary: `Short circuit detected (VCC ↔ GND) — ${shortCircuitCurrent} mA! High thermal hazard!`,
      severity: 'error',
    };
  }

  // 2. Identify Power Sources
  const sources = components.filter(
    (c) => c.partId === 'battery.9v' || c.partId === 'battery.3v' || c.partId === 'arduino.uno'
  );

  if (sources.length === 0) {
    return {
      hasShortCircuit: false,
      totalCurrentMa: 0,
      ledStates,
      componentTelemetry,
      wireCurrents,
      activeWireIds: [],
      summary: 'No power source in circuit (0.0 mA)',
      severity: 'warning',
    };
  }

  const gndNetIds = new Set(
    nets
      .filter((n) => n.pins.some((p) => p.partId === 'ground' || p.role === 'gnd'))
      .map((n) => n.id)
  );

  const energizedNetIds = new Set<string>();
  let totalCurrentMa = 0;

  for (const src of sources) {
    const vSup =
      src.partId === 'arduino.uno'
        ? 5
        : parseVoltageVolts(src.params.voltage, src.partId === 'battery.3v' ? 3 : 9);

    // Realistic internal resistance of source (ohms)
    const rInternal = src.partId === 'arduino.uno' ? 0.5 : src.partId === 'battery.3v' ? 1.0 : 5.0;

    const vccNet = findNetForPin(nets, src.id, 0);
    const returnNet = findNetForPin(nets, src.id, 1);
    if (!vccNet || !returnNet) continue;

    // Return net must be connected to close a loop
    if (returnNet.pins.length <= 1) continue;

    const targetNetIds = new Set<string>([returnNet.id]);
    if (returnNet.pins.some((p) => p.partId === 'ground')) {
      for (const gid of gndNetIds) {
        const gNet = nets.find((n) => n.id === gid);
        if (gNet?.pins.some((p) => p.partId === 'ground')) {
          targetNetIds.add(gid);
        }
      }
    }

    interface PathStep {
      netId: string;
      resistanceOhms: number;
      voltageDrop: number;
      visitedComps: string[];
      visitedNets: string[];
      ledsForward: string[];
    }

    const stack: PathStep[] = [
      {
        netId: vccNet.id,
        resistanceOhms: 0,
        voltageDrop: 0,
        visitedComps: [],
        visitedNets: [vccNet.id],
        ledsForward: [],
      },
    ];

    while (stack.length > 0) {
      const cur = stack.pop()!;
      const curNet = nets.find((n) => n.id === cur.netId);
      if (!curNet) continue;

      if (targetNetIds.has(cur.netId) && cur.visitedComps.length > 0) {
        const netV = vSup - cur.voltageDrop;
        if (netV > 0) {
          // If no series resistor, diode bulk resistance + battery internal resistance prevents division by zero
          const hasExplicitResistor = cur.resistanceOhms > 0;
          const effR = hasExplicitResistor ? cur.resistanceOhms + rInternal : rInternal + 2.0;
          const currentMa = Math.round(((netV / effR) * 1000) * 10) / 10;
          totalCurrentMa += currentMa;

          for (const nid of cur.visitedNets) energizedNetIds.add(nid);

          // Update LEDs in this branch
          for (const ledId of cur.ledsForward) {
            const st = ledStates[ledId];
            if (!st) continue;
            const nextMa = Math.round((st.currentMa + currentMa) * 10) / 10;
            st.currentMa = nextMa;
            // Overcurrent if exceeding max rating (20 mA) or no limiting resistor
            st.status = nextMa > st.maxCurrentMa || !hasExplicitResistor ? 'overcurrent' : nextMa >= 0.5 ? 'lit' : 'off';
          }

          // Compute component telemetry for this branch
          for (const compId of cur.visitedComps) {
            const comp = compMap.get(compId);
            if (!comp) continue;

            if (comp.partId === 'resistor.axial') {
              const r = parseResistanceOhms(comp.params.resistance, 1000);
              const vDrop = (currentMa / 1000) * r;
              const pMw = vDrop * currentMa;
              componentTelemetry[comp.id] = {
                compId: comp.id,
                designator: comp.designator,
                voltageDrop: Math.round(vDrop * 100) / 100,
                currentMa,
                powerMw: Math.round(pMw * 10) / 10,
                stateText: `${vDrop.toFixed(2)}V drop · ${currentMa.toFixed(1)} mA · ${pMw.toFixed(1)} mW`,
              };
            } else if (comp.partId === 'potentiometer') {
              const rTot = parseResistanceOhms(comp.params.resistance, 10000);
              const wiper = comp.params.wiper !== undefined ? Number(comp.params.wiper) : 50;
              const rEff = Math.max(0.1, rTot * (wiper / 100));
              const vDrop = (currentMa / 1000) * rEff;
              componentTelemetry[comp.id] = {
                compId: comp.id,
                designator: comp.designator,
                voltageDrop: Math.round(vDrop * 100) / 100,
                currentMa,
                powerMw: Math.round(vDrop * currentMa * 10) / 10,
                stateText: `Wiper: ${wiper}% (${rEff.toFixed(0)}Ω) · ${currentMa.toFixed(1)} mA`,
              };
            } else if (comp.partId === 'led.5mm.red') {
              const st = ledStates[comp.id];
              componentTelemetry[comp.id] = {
                compId: comp.id,
                designator: comp.designator,
                voltageDrop: 2.0,
                currentMa: st ? st.currentMa : currentMa,
                powerMw: Math.round(2.0 * (st ? st.currentMa : currentMa) * 10) / 10,
                stateText: st?.status === 'overcurrent'
                  ? `BURNOUT HAZARD (${st.currentMa.toFixed(1)} mA > ${st.maxCurrentMa} mA)`
                  : st?.status === 'lit'
                  ? `Lit safely (${st.currentMa.toFixed(1)} mA)`
                  : 'Off',
              };
            } else if (comp.partId === 'switch.spst' || comp.partId === 'pushbutton') {
              componentTelemetry[comp.id] = {
                compId: comp.id,
                designator: comp.designator,
                voltageDrop: 0,
                currentMa,
                powerMw: 0,
                stateText: `Closed contact · ${currentMa.toFixed(1)} mA`,
              };
            }
          }
        }
        continue;
      }

      for (const pin of curNet.pins) {
        const comp = compMap.get(pin.compId);
        if (!comp || cur.visitedComps.includes(comp.id)) continue;

        let nextPinIdx: number | null = null;
        let addR = 0;
        let addVf = 0;
        let isForwardLed = false;

        if (comp.partId === 'resistor.axial') {
          nextPinIdx = pin.pinIndex === 0 ? 1 : 0;
          addR = parseResistanceOhms(comp.params.resistance, 1000);
        } else if (comp.partId === 'potentiometer') {
          const totalR = parseResistanceOhms(comp.params.resistance, 10000);
          const rawWiper = comp.params.wiper !== undefined ? Number(comp.params.wiper) : 50;
          const wiperPct = Math.max(0, Math.min(100, Number.isFinite(rawWiper) ? rawWiper : 50));
          if (pin.pinIndex === 0) {
            nextPinIdx = 1;
            addR = Math.max(0.1, totalR * (wiperPct / 100));
          } else if (pin.pinIndex === 2) {
            nextPinIdx = 1;
            addR = Math.max(0.1, totalR * ((100 - wiperPct) / 100));
          } else {
            nextPinIdx = 0;
            addR = Math.max(0.1, totalR * (wiperPct / 100));
          }
        } else if (comp.partId === 'led.5mm.red') {
          if (pin.pinIndex === 0) {
            // Forward biased: anode (0) -> cathode (1)
            nextPinIdx = 1;
            addVf = parseVoltageVolts(comp.params.forward_voltage ?? comp.params.vf, 2.0);
            isForwardLed = true;
          } else {
            // Reverse biased: blocks DC current
            const st = ledStates[comp.id];
            if (st && st.status === 'off') {
              st.status = 'reversed';
            }
          }
        } else if (comp.partId === 'diode.1n4007') {
          if (pin.pinIndex === 0) {
            nextPinIdx = 1;
            addVf = 0.7;
          }
        } else if (comp.partId === 'switch.spst' || comp.partId === 'pushbutton') {
          const isClosed = (comp.params.state ?? 'closed') === 'closed';
          if (!isClosed) {
            nextPinIdx = null; // Open contact breaks branch
          } else {
            nextPinIdx = pin.pinIndex === 0 ? 1 : 0;
            addR = 0.05;
          }
        } else if (comp.partId === 'motor.dc') {
          nextPinIdx = pin.pinIndex === 0 ? 1 : 0;
          addR = 25;
        } else if (comp.partId === 'junction') {
          // Transparent routing node
          nextPinIdx = 0;
        }

        if (nextPinIdx === null) continue;
        const otherNet = findNetForPin(nets, comp.id, nextPinIdx);
        if (!otherNet || cur.visitedNets.includes(otherNet.id)) continue;

        stack.push({
          netId: otherNet.id,
          resistanceOhms: cur.resistanceOhms + addR,
          voltageDrop: cur.voltageDrop + addVf,
          visitedComps: [...cur.visitedComps, comp.id],
          visitedNets: [...cur.visitedNets, otherNet.id],
          ledsForward: isForwardLed ? [...cur.ledsForward, comp.id] : cur.ledsForward,
        });
      }
    }

    // Source telemetry
    componentTelemetry[src.id] = {
      compId: src.id,
      designator: src.designator,
      voltageDrop: vSup,
      currentMa: Math.round(totalCurrentMa * 10) / 10,
      powerMw: Math.round(vSup * totalCurrentMa * 10) / 10,
      stateText: `Supplying ${vSup}V · ${totalCurrentMa.toFixed(1)} mA`,
    };
  }

  // Record energized wires and branch currents
  const activeWireIds: string[] = [];
  for (const w of wires) {
    const n1 = findNetForPin(nets, w.fromId, w.fromPin);
    if (n1 && energizedNetIds.has(n1.id)) {
      activeWireIds.push(w.id);
      wireCurrents[w.id] = Math.round(totalCurrentMa * 10) / 10;
    }
  }

  const ledList = Object.values(ledStates);
  const overcurrentLed = ledList.find((l) => l.status === 'overcurrent');
  const reversedLed = ledList.find((l) => l.status === 'reversed');
  const litLed = ledList.find((l) => l.status === 'lit');

  let summary = `Loop current: ${totalCurrentMa.toFixed(1)} mA`;
  let severity: 'ok' | 'warning' | 'error' = 'ok';

  if (overcurrentLed) {
    summary = `${overcurrentLed.designator}: ${overcurrentLed.currentMa.toFixed(1)} mA — Overcurrent! (max ${overcurrentLed.maxCurrentMa} mA)`;
    severity = 'error';
  } else if (reversedLed) {
    summary = `${reversedLed.designator} reverse-biased — 0.0 mA (LED off)`;
    severity = 'warning';
  } else if (litLed) {
    summary = `${litLed.designator} lit · ${litLed.currentMa.toFixed(1)} mA (safe operating point)`;
    severity = 'ok';
  } else if (totalCurrentMa === 0) {
    summary = 'Open circuit — 0.0 mA flowing';
    severity = 'warning';
  }

  return {
    hasShortCircuit: false,
    totalCurrentMa: Math.round(totalCurrentMa * 10) / 10,
    ledStates,
    componentTelemetry,
    wireCurrents,
    activeWireIds,
    summary,
    severity,
  };
}
