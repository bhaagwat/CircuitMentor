/**
 * Deterministic Electrical Rules Check (ERC) rules + visual hint ladders.
 * Pure TypeScript — no React imports.
 */

import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import { buildNets, type Net } from './nets';
import { getPartMeta } from '../parts';
import type { ErcFindingWithHints, Hint } from './types';

export type RuleContext = {
  components: PlacedComponent[];
  nets: Net[];
  wires: WireConnection[];
  compMap?: Map<string, PlacedComponent>;
  pinToNet?: Map<string, Net>;
};

export type Rule = (ctx: RuleContext) => ErcFindingWithHints[];

function findWireBetween(
  wires: WireConnection[],
  compA: string,
  compB: string
): WireConnection | undefined {
  return wires.find(
    (w) =>
      (w.fromId === compA && w.toId === compB) ||
      (w.fromId === compB && w.toId === compA)
  );
}

// Rule 1: VCC_GND_SHORT
// Fires when one net contains both a 'vcc' and a 'gnd' pin
export const vccGndShortRule: Rule = ({ nets, wires }) => {
  const findings: ErcFindingWithHints[] = [];
  for (const net of nets) {
    const hasVcc = net.pins.some((p) => p.role === 'vcc');
    const hasGnd = net.pins.some((p) => p.role === 'gnd');
    if (hasVcc && hasGnd) {
      const anchorComp = net.pins.find((p) => p.role === 'vcc' || p.role === 'gnd')!;
      const compIds = Array.from(new Set(net.pins.map((p) => p.compId)));
      const pinKeys = net.pins
        .filter((p) => p.role === 'vcc' || p.role === 'gnd')
        .map((p) => `${p.compId}:${p.pinIndex}`);
      const directWire = wires.find(
        (w) => compIds.includes(w.fromId) && compIds.includes(w.toId)
      );

      const hints: Hint[] = [
        {
          level: 1,
          text: 'If a wire connects + directly to − with nothing in between, what does the circuit resistance equal?',
          highlight: { components: compIds, pins: pinKeys },
        },
        {
          level: 2,
          text: "Ohm's law (I = V ÷ R): when resistance approaches zero, current surges uncontrollably. A direct VCC-to-Ground connection creates a short circuit.",
          highlight: {
            components: compIds,
            pins: pinKeys,
            netPath: compIds,
            gapAfter: anchorComp.compId,
          },
        },
        {
          level: 3,
          text: 'Inspect the highlighted VCC and Ground pins — trace the wire bridging them with no load component in series.',
          highlight: {
            components: compIds,
            pins: pinKeys,
            ghost: {
              onWire: directWire?.id,
              nearComponentId: anchorComp.compId,
              category: 'load / resistor?',
            },
          },
        },
        {
          level: 4,
          text: 'Remove the direct VCC↔GND wire and place a load (such as a ≈ 330 Ω resistor with an LED) between + and −.',
          highlight: {
            components: compIds,
            pins: pinKeys,
            ghost: {
              onWire: directWire?.id,
              nearComponentId: anchorComp.compId,
              category: 'resistor + load',
              value: '≈ 330 Ω',
            },
          },
        },
      ];

      findings.push({
        id: `erc_short_${net.id}`,
        ruleId: 'VCC_GND_SHORT',
        severity: 'error',
        title: 'Direct power rail short circuit',
        detail:
          'A VCC power pin is connected directly to Ground without any load. This will cause an immediate short circuit.',
        anchorId: anchorComp.compId,
        componentIds: compIds,
        hints,
      });
    }
  }
  return findings;
};

// Rule 2: SHORTED_COMPONENT
// Fires when multiple terminals of the same component share one electrical net
export const shortedComponentRule: Rule = ({ components, nets }) => {
  const findings: ErcFindingWithHints[] = [];
  const pinToNet = new Map<string, Net>();
  for (const net of nets) {
    for (const p of net.pins) {
      pinToNet.set(`${p.compId}:${p.pinIndex}`, net);
    }
  }

  for (const comp of components) {
    if (
      comp.partId === 'ground' ||
      comp.partId === 'junction' ||
      comp.partId === 'breadboard.small' ||
      comp.partId.startsWith('battery')
    ) {
      continue;
    }

    if (comp.partId === 'potentiometer') {
      const n0 = pinToNet.get(`${comp.id}:0`);
      const n1 = pinToNet.get(`${comp.id}:1`);
      const n2 = pinToNet.get(`${comp.id}:2`);
      if (!n0 || !n1 || !n2) continue;

      const trackShorted = n0.id === n2.id && n0.pins.length > 1;
      const wiper0ShortedDead = n0.id === n1.id && n0.pins.length > 1 && n2.pins.length <= 1;
      const wiper2ShortedDead = n1.id === n2.id && n1.pins.length > 1 && n0.pins.length <= 1;

      if (trackShorted || wiper0ShortedDead || wiper2ShortedDead) {
        const affectedPins = trackShorted
          ? [`${comp.id}:0`, `${comp.id}:2`]
          : wiper0ShortedDead
          ? [`${comp.id}:0`, `${comp.id}:1`]
          : [`${comp.id}:1`, `${comp.id}:2`];
        findings.push({
          id: `erc_short_comp_${comp.id}`,
          ruleId: 'SHORTED_COMPONENT',
          severity: trackShorted ? 'error' : 'warning',
          title: `${comp.designator} terminals are shorted onto the same net`,
          detail: trackShorted
            ? `Both end pins of ${comp.designator} are connected together, bypassing its resistive track.`
            : `${comp.designator} has its wiper shorted to one end while its other end floats, acting as a direct jumper rather than a resistor.`,
          anchorId: comp.id,
          componentIds: [comp.id],
          hints: [
            {
              level: 1,
              text: `If current enters and leaves ${comp.designator} on the same copper net, does it pass through the resistive element?`,
              highlight: { components: [comp.id], pins: affectedPins },
            },
            {
              level: 2,
              text: `A potentiometer limits current only when current enters one pin and exits a different pin on another net.`,
              highlight: { components: [comp.id], pins: affectedPins, netPath: [comp.id], gapAfter: comp.id },
            },
            {
              level: 3,
              text: `Inspect ${comp.designator} pins — separate one of the tied pins onto the outgoing net (or wire between pin 1 and wiper).`,
              highlight: { components: [comp.id], pins: affectedPins },
            },
            {
              level: 4,
              text: `Remove the redundant jumper wire so ${comp.designator} connects between two separate circuit nets (e.g., pin 1 in, wiper out).`,
              highlight: { components: [comp.id], pins: affectedPins },
            },
          ],
        });
      }
      continue;
    }

    // Two-pin passive/polarized components
    const n0 = pinToNet.get(`${comp.id}:0`);
    const n1 = pinToNet.get(`${comp.id}:1`);
    if (n0 && n1 && n0.id === n1.id && n0.pins.length > 1) {
      findings.push({
        id: `erc_short_comp_${comp.id}`,
        ruleId: 'SHORTED_COMPONENT',
        severity: 'error',
        title: `${comp.designator} has both terminals shorted together`,
        detail: `Pin 1 and Pin 2 of ${comp.name} share the exact same electrical net, bypassing the component completely.`,
        anchorId: comp.id,
        componentIds: [comp.id],
        hints: [
          {
            level: 1,
            text: `Both ends of ${comp.designator} are wired to the same node — what voltage difference can exist across it?`,
            highlight: { components: [comp.id], pins: [`${comp.id}:0`, `${comp.id}:1`] },
          },
          {
            level: 2,
            text: `Zero potential difference across ${comp.designator}: current takes the copper bypass instead of flowing through the component.`,
            highlight: {
              components: [comp.id],
              pins: [`${comp.id}:0`, `${comp.id}:1`],
              netPath: [comp.id],
              gapAfter: comp.id,
            },
          },
          {
            level: 3,
            text: `Inspect the wires touching both terminals of ${comp.designator} — one side must lead forward to the rest of the circuit.`,
            highlight: { components: [comp.id], pins: [`${comp.id}:0`, `${comp.id}:1`] },
          },
          {
            level: 4,
            text: `Delete the wire tying ${comp.designator}'s two pins to the same net and wire its downstream pin toward Ground or the next stage.`,
            highlight: { components: [comp.id], pins: [`${comp.id}:0`, `${comp.id}:1`] },
          },
        ],
      });
    }
  }

  return findings;
};

function isResistiveBridgeValid(
  comp: PlacedComponent,
  pinToNet: Map<string, Net>
): Array<[Net, Net]> {
  if (comp.partId === 'resistor.axial') {
    const n0 = pinToNet.get(`${comp.id}:0`);
    const n1 = pinToNet.get(`${comp.id}:1`);
    if (n0 && n1 && n0.id !== n1.id && n0.pins.length > 1 && n1.pins.length > 1) {
      return [[n0, n1]];
    }
    return [];
  }
  if (comp.partId === 'potentiometer') {
    const pins = [0, 1, 2]
      .map((i) => pinToNet.get(`${comp.id}:${i}`))
      .filter((n): n is Net => Boolean(n && n.pins.length > 1));
    const bridges: Array<[Net, Net]> = [];
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        if (pins[i]!.id !== pins[j]!.id) {
          bridges.push([pins[i]!, pins[j]!]);
        }
      }
    }
    return bridges;
  }
  return [];
}

function getReachableNets(
  startNets: Net[],
  components: PlacedComponent[],
  nets: Net[],
  includeSwitches: boolean = true,
  precomputedPinToNet?: Map<string, Net>
): Set<string> {
  const pinToNet =
    precomputedPinToNet ??
    new Map<string, Net>(
      nets.flatMap((net) => net.pins.map((p) => [`${p.compId}:${p.pinIndex}`, net] as const))
    );

  const adj = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const comp of components) {
    for (const [na, nb] of isResistiveBridgeValid(comp, pinToNet)) {
      addEdge(na.id, nb.id);
    }
    if (includeSwitches && (comp.partId === 'pushbutton' || comp.partId === 'switch.spst')) {
      const n0 = pinToNet.get(`${comp.id}:0`);
      const n1 = pinToNet.get(`${comp.id}:1`);
      if (n0 && n1 && n0.id !== n1.id) addEdge(n0.id, n1.id);
    }
  }

  const visited = new Set<string>(startNets.map((n) => n.id));
  const queue = [...visited];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

// Rule 3: LED_NO_RESISTOR
// Fires when an LED is wired without a genuine series resistor/potentiometer between two distinct nets
export const ledNoResistorRule: Rule = ({ components, nets, wires }) => {
  const findings: ErcFindingWithHints[] = [];
  const leds = components.filter((c) => c.partId === 'led.5mm.red');
  const pinToNet = new Map<string, Net>();
  for (const net of nets) {
    for (const p of net.pins) {
      pinToNet.set(`${p.compId}:${p.pinIndex}`, net);
    }
  }

  const netHasSeriesLimiter = (net: Net): boolean => {
    for (const p of net.pins) {
      const comp = components.find((c) => c.id === p.compId);
      if (!comp) continue;
      if (isResistiveBridgeValid(comp, pinToNet).some(([a, b]) => a.id === net.id || b.id === net.id)) {
        return true;
      }
    }
    return false;
  };

  for (const led of leds) {
    const anodeNet = nets.find((n) =>
      n.pins.some((p) => p.compId === led.id && p.role === 'anode')
    );
    const cathodeNet = nets.find((n) =>
      n.pins.some((p) => p.compId === led.id && p.role === 'cathode')
    );

    if (!anodeNet || !cathodeNet || anodeNet.id === cathodeNet.id) continue;

    const anodeConnected = anodeNet.pins.length > 1;
    const cathodeConnected = cathodeNet.pins.length > 1;
    if (!anodeConnected || !cathodeConnected) continue;

    // Direct rail-to-rail LED connection has zero series resistance even if another part hangs off either rail
    const directVccToAnode = anodeNet.pins.some((p) => p.role === 'vcc');
    const directGndToCathode = cathodeNet.pins.some((p) => p.role === 'gnd');
    const hasLimiter = netHasSeriesLimiter(anodeNet) || netHasSeriesLimiter(cathodeNet);

    if ((directVccToAnode && directGndToCathode) || !hasLimiter) {
      const sourcePin =
        anodeNet.pins.find((p) => p.role === 'vcc') ??
        anodeNet.pins.find((p) => p.compId !== led.id);
      const returnPin =
        cathodeNet.pins.find(
          (p) => p.partId === 'ground' && p.compId !== sourcePin?.compId
        ) ??
        cathodeNet.pins.find(
          (p) => p.role === 'gnd' && p.compId !== led.id && p.compId !== sourcePin?.compId
        ) ??
        cathodeNet.pins.find(
          (p) => p.compId !== led.id && p.compId !== sourcePin?.compId
        );

      const netPath = Array.from(
        new Set(
          [sourcePin?.compId, led.id, returnPin?.compId].filter(
            (id): id is string => Boolean(id)
          )
        )
      );

      const wireToAnode = sourcePin
        ? findWireBetween(wires, sourcePin.compId, led.id)
        : wires.find(
            (w) =>
              (w.toId === led.id && w.toPin === 0) ||
              (w.fromId === led.id && w.fromPin === 0)
          );

      const pinPair = [
        `${led.id}:0`,
        ...(sourcePin ? [`${sourcePin.compId}:${sourcePin.pinIndex}`] : []),
      ];

      const hints: Hint[] = [
        {
          level: 1,
          text: `What limits the current flowing through ${led.designator}?`,
          highlight: { components: [led.id] },
        },
        {
          level: 2,
          text: `Ohm's law & LED forward voltage: once ${led.designator} conducts (~2 V), the remaining supply voltage drives excessive current unless a series component drops it.`,
          highlight: {
            components: [led.id],
            netPath,
            gapAfter: sourcePin?.compId ?? led.id,
          },
        },
        {
          level: 3,
          text: `Inspect the wire feeding ${led.designator}'s anode (+) — a current-limiting part belongs in series between those two pins.`,
          highlight: {
            components: [led.id],
            pins: pinPair,
            ghost: {
              onWire: wireToAnode?.id,
              nearComponentId: led.id,
              category: 'current-limiting part?',
            },
          },
        },
        {
          level: 4,
          text: `Place a resistor in series before ${led.designator} — e.g. ≈ 330 Ω for a 9 V supply, ~2 V LED, and ~20 mA (R = (9 − 2) / 0.02).`,
          highlight: {
            components: [led.id],
            pins: pinPair,
            ghost: {
              onWire: wireToAnode?.id,
              nearComponentId: led.id,
              category: 'resistor',
              value: '≈ 330 Ω',
            },
          },
        },
      ];

      findings.push({
        id: `erc_led_res_${led.id}`,
        ruleId: 'LED_NO_RESISTOR',
        severity: 'warning',
        title: `${led.designator} has no current-limiting resistor`,
        detail:
          'At full supply voltage the forward current exceeds safe limits. Place a resistor (e.g., 220 Ω) in series to protect the LED.',
        anchorId: led.id,
        componentIds: [led.id],
        hints,
      });
    }
  }
  return findings;
};

// Rule 4: LED_REVERSED
// Fires when an LED's anode connects toward Ground while cathode connects toward VCC (direct or via resistors)
export const ledReversedRule: Rule = ({ components, nets, pinToNet }) => {
  const findings: ErcFindingWithHints[] = [];
  const leds = components.filter((c) => c.partId === 'led.5mm.red');
  const vccNets = nets.filter((n) => n.pins.some((p) => p.role === 'vcc'));
  const gndNets = nets.filter((n) => n.pins.some((p) => p.role === 'gnd'));
  const vccReachable = getReachableNets(vccNets, components, nets, true, pinToNet);
  const gndReachable = getReachableNets(gndNets, components, nets, true, pinToNet);

  for (const led of leds) {
    const anodeNet = pinToNet?.get(`${led.id}:0`) ?? nets.find((n) =>
      n.pins.some((p) => p.compId === led.id && p.role === 'anode')
    );
    const cathodeNet = pinToNet?.get(`${led.id}:1`) ?? nets.find((n) =>
      n.pins.some((p) => p.compId === led.id && p.role === 'cathode')
    );

    if (!anodeNet || !cathodeNet || anodeNet.id === cathodeNet.id) continue;

    const anodeHasGnd = gndReachable.has(anodeNet.id);
    const cathodeHasVcc = vccReachable.has(cathodeNet.id);
    const isForwardValid = vccReachable.has(anodeNet.id) && gndReachable.has(cathodeNet.id);

    if (anodeHasGnd && cathodeHasVcc && !isForwardValid) {
      const sourcePin = cathodeNet.pins.find((p) => p.role === 'vcc');
      const gndPin = anodeNet.pins.find((p) => p.role === 'gnd');
      const netPath = Array.from(
        new Set(
          [sourcePin?.compId, led.id, gndPin?.compId].filter(
            (id): id is string => Boolean(id)
          )
        )
      );

      const hints: Hint[] = [
        {
          level: 1,
          text: `Which terminal of ${led.designator} needs to face the higher voltage?`,
          highlight: { components: [led.id] },
        },
        {
          level: 2,
          text: `Diode polarity: an LED only conducts when its anode (+) is more positive than its cathode (−). Reverse bias blocks current.`,
          highlight: {
            components: [led.id],
            pins: [`${led.id}:0`, `${led.id}:1`],
            netPath,
            gapAfter: led.id,
          },
        },
        {
          level: 3,
          text: `Inspect ${led.designator}'s two pins — the triangle base (left pin) is the anode (+) and the flat bar (right pin) is the cathode (−).`,
          highlight: {
            components: [led.id],
            pins: [`${led.id}:0`, `${led.id}:1`],
          },
        },
        {
          level: 4,
          text: `Flip ${led.designator}'s connections: wire the anode (+) toward the positive supply and the cathode (−) toward Ground.`,
          highlight: {
            components: [led.id],
            pins: [`${led.id}:0`, `${led.id}:1`],
          },
        },
      ];

      findings.push({
        id: `erc_led_rev_${led.id}`,
        ruleId: 'LED_REVERSED',
        severity: 'error',
        title: `${led.designator} is connected in reverse polarity`,
        detail:
          'The LED anode (+) is connected to Ground while the cathode (−) connects toward VCC. Diodes block reverse current and will not illuminate.',
        anchorId: led.id,
        componentIds: [led.id],
        hints,
      });
    }
  }
  return findings;
};

// Rule 4: NO_GROUND_PATH
// Fires when a power source exists (e.g. battery), but its Ground terminal has no connection
export const noGroundPathRule: Rule = ({ components, nets }) => {
  const findings: ErcFindingWithHints[] = [];
  const sources = components.filter((c) => c.partId.startsWith('battery'));

  for (const source of sources) {
    const gndNet = nets.find((n) =>
      n.pins.some((p) => p.compId === source.id && p.role === 'gnd')
    );
    if (gndNet && gndNet.pins.length <= 1) {
      const hints: Hint[] = [
        {
          level: 1,
          text: `Current must travel in a closed loop. Where does current return to ${source.designator}?`,
          highlight: { components: [source.id], pins: [`${source.id}:1`] },
        },
        {
          level: 2,
          text: `Kirchhoff's loop principle: without a complete return path back to the negative (−) terminal / Ground, no current can flow.`,
          highlight: {
            components: [source.id],
            pins: [`${source.id}:1`],
            netPath: [source.id],
            gapAfter: source.id,
          },
        },
        {
          level: 3,
          text: `Inspect the bottom negative (−) pin of ${source.designator} — it is open and needs a return connection.`,
          highlight: {
            components: [source.id],
            pins: [`${source.id}:1`],
            ghost: {
              nearComponentId: source.id,
              category: 'return / GND?',
            },
          },
        },
        {
          level: 4,
          text: `Connect ${source.designator}'s negative (−) terminal to an Earth Ground (GND) symbol and your load's return side.`,
          highlight: {
            components: [source.id],
            pins: [`${source.id}:1`],
            ghost: {
              nearComponentId: source.id,
              category: 'GND',
              value: 'Earth Ground',
            },
          },
        },
      ];

      findings.push({
        id: `erc_no_gnd_${source.id}`,
        ruleId: 'NO_GROUND_PATH',
        severity: 'warning',
        title: `No return ground path for ${source.designator}`,
        detail: `${source.name} negative terminal is open. A complete circuit requires a return path to Ground.`,
        anchorId: source.id,
        componentIds: [source.id],
        hints,
      });
    }
  }
  return findings;
};

// Rule 5: UNCONNECTED_PIN
// Fires when a required pin is alone in its net (unconnected)
export const unconnectedPinRule: Rule = ({ components, nets }) => {
  const findings: ErcFindingWithHints[] = [];

  for (const comp of components) {
    const meta = getPartMeta(comp.partId);
    meta.pins.forEach((pin, pinIdx) => {
      if (!pin.required) return;
      const net = nets.find((n) =>
        n.pins.some((p) => p.compId === comp.id && p.pinIndex === pinIdx)
      );
      if (net && net.pins.length <= 1) {
        const pinKey = `${comp.id}:${pinIdx}`;
        const hints: Hint[] = [
          {
            level: 1,
            text: `Every required pin needs a connection in the circuit. Which terminal on ${comp.designator} is floating?`,
            highlight: { components: [comp.id], pins: [pinKey] },
          },
          {
            level: 2,
            text: `Open branch: an unconnected terminal breaks the current path (or leaves ${comp.name} at an undefined voltage).`,
            highlight: {
              components: [comp.id],
              pins: [pinKey],
              gapAfter: comp.id,
            },
          },
          {
            level: 3,
            text: `Inspect pin "${pin.name}" on ${comp.designator} — switch to the Wire tool (W) and check which net it belongs in.`,
            highlight: { components: [comp.id], pins: [pinKey] },
          },
          {
            level: 4,
            text: `Connect pin "${pin.name}" on ${comp.designator} to the active circuit net (or delete ${comp.designator} if unused).`,
            highlight: { components: [comp.id], pins: [pinKey] },
          },
        ];

        findings.push({
          id: `erc_unconnected_${comp.id}_${pinIdx}`,
          ruleId: 'UNCONNECTED_PIN',
          severity: 'info',
          title: `${comp.designator} ${pin.name} is unconnected`,
          detail: `Terminal "${pin.name}" of ${comp.name} is floating. Connect it to complete the circuit path.`,
          anchorId: comp.id,
          componentIds: [comp.id],
          hints,
        });
      }
    });
  }
  return findings;
};

// Rule 6: OPEN_LOOP_LOAD
// Fires when a powered circuit has an LED or DC motor whose terminals never close a VCC-to-GND loop
export const openLoopLoadRule: Rule = ({ components, nets, pinToNet }) => {
  const hasPower = nets.some((n) => n.pins.some((p) => p.role === 'vcc'));
  if (!hasPower) return [];

  const vccNets = nets.filter((n) => n.pins.some((p) => p.role === 'vcc'));
  const gndNets = nets.filter((n) => n.pins.some((p) => p.role === 'gnd'));
  const vccReachable = getReachableNets(vccNets, components, nets, true, pinToNet);
  const gndReachable = getReachableNets(gndNets, components, nets, true, pinToNet);
  const findings: ErcFindingWithHints[] = [];

  for (const comp of components) {
    if (comp.partId !== 'led.5mm.red' && comp.partId !== 'motor.dc') continue;
    const n0 = pinToNet?.get(`${comp.id}:0`) ?? nets.find((n) => n.pins.some((p) => p.compId === comp.id && p.pinIndex === 0));
    const n1 = pinToNet?.get(`${comp.id}:1`) ?? nets.find((n) => n.pins.some((p) => p.compId === comp.id && p.pinIndex === 1));
    if (!n0 || !n1 || n0.id === n1.id || n0.pins.length <= 1 || n1.pins.length <= 1) continue;

    const forwardLoop = vccReachable.has(n0.id) && gndReachable.has(n1.id);
    const reverseLoop = vccReachable.has(n1.id) && gndReachable.has(n0.id);
    if (forwardLoop || reverseLoop) continue;

    findings.push({
      id: `erc_open_loop_${comp.id}`,
      ruleId: 'OPEN_LOOP_LOAD',
      severity: 'warning',
      title: `${comp.designator} does not form a closed VCC-to-GND loop`,
      detail: `Both pins of ${comp.designator} are connected to wires, but at least one side cannot trace back to the opposite power rail (or terminates at a floating pin).`,
      anchorId: comp.id,
      componentIds: [comp.id],
      hints: [
        {
          level: 1,
          text: `Follow the current from the positive rail through ${comp.designator} — can it reach Ground?`,
          highlight: { components: [comp.id], pins: [`${comp.id}:0`, `${comp.id}:1`] },
        },
        {
          level: 2,
          text: `Kirchhoff's loop rule: a load conducts only when one terminal traces through active components to VCC and the other traces to GND.`,
          highlight: {
            components: [comp.id],
            pins: [`${comp.id}:0`, `${comp.id}:1`],
            netPath: [comp.id],
            gapAfter: comp.id,
          },
        },
        {
          level: 3,
          text: `Check the wires leaving ${comp.designator} — trace any intermediate resistor or potentiometer to make sure it actually bridges to the opposite rail.`,
          highlight: { components: [comp.id], pins: [`${comp.id}:0`, `${comp.id}:1`] },
        },
        {
          level: 4,
          text: `Route ${comp.designator} anode/input toward VCC (via a series resistor) and its cathode/return toward Ground.`,
          highlight: { components: [comp.id], pins: [`${comp.id}:0`, `${comp.id}:1`] },
        },
      ],
    });
  }

  return findings;
};

export const RULES: Rule[] = [
  vccGndShortRule,
  shortedComponentRule,
  ledNoResistorRule,
  ledReversedRule,
  noGroundPathRule,
  openLoopLoadRule,
  unconnectedPinRule,
];

export function evaluateErc(
  components: PlacedComponent[],
  wires: WireConnection[]
): ErcFindingWithHints[] {
  const nets = buildNets(components, wires);
  const compMap = new Map<string, PlacedComponent>(components.map((c) => [c.id, c]));
  const pinToNet = new Map<string, Net>();
  for (const net of nets) {
    for (const p of net.pins) {
      pinToNet.set(`${p.compId}:${p.pinIndex}`, net);
    }
  }
  const ctx: RuleContext = { components, nets, wires, compMap, pinToNet };
  return RULES.flatMap((rule) => rule(ctx));
}
