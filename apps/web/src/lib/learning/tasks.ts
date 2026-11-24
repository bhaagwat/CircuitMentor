/**
 * CircuitMentor Learning Tasks (Curriculum)
 * Static task definitions, starter circuits, and structural milestone checks.
 * Uses pure TypeScript over buildNets (no simulator required).
 */

import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import { buildNets, type Net } from '../erc/nets';

export interface TaskMilestone {
  id: string;
  label: string;
  hint?: string;
  check: (components: PlacedComponent[], wires: WireConnection[], nets: Net[]) => boolean;
}

export interface LearningTask {
  id: string;
  title: string;
  kind: 'build' | 'debug';
  minutes: number;
  concepts: string[];
  goal: string;
  milestones: TaskMilestone[];
  starterCircuit: {
    components: PlacedComponent[];
    wires: WireConnection[];
  };
}

// ── Shared Milestone Helper Utilities ──────────────────────────────────────────

function getPinNetMap(nets: Net[]): Map<string, Net> {
  const map = new Map<string, Net>();
  for (const net of nets) {
    for (const p of net.pins) {
      map.set(`${p.compId}:${p.pinIndex}`, net);
    }
  }
  return map;
}

function hasVccGndShort(nets: Net[]): boolean {
  for (const net of nets) {
    const hasVcc = net.pins.some((p) => p.role === 'vcc');
    const hasGnd = net.pins.some((p) => p.role === 'gnd');
    if (hasVcc && hasGnd) return true;
  }
  return false;
}

function getReachableNetIds(
  startNets: Net[],
  components: PlacedComponent[],
  pinToNet: Map<string, Net>
): Set<string> {
  const adj = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const comp of components) {
    if (comp.partId === 'resistor.axial' || comp.partId === 'pushbutton' || comp.partId === 'switch.spst') {
      const n0 = pinToNet.get(`${comp.id}:0`);
      const n1 = pinToNet.get(`${comp.id}:1`);
      if (n0 && n1 && n0.id !== n1.id && n0.pins.length > 1 && n1.pins.length > 1) {
        addEdge(n0.id, n1.id);
      }
    } else if (comp.partId === 'potentiometer') {
      const n0 = pinToNet.get(`${comp.id}:0`);
      const n1 = pinToNet.get(`${comp.id}:1`);
      const n2 = pinToNet.get(`${comp.id}:2`);
      const valid = [n0, n1, n2].filter((n): n is Net => Boolean(n && n.pins.length > 1));
      for (let i = 0; i < valid.length; i++) {
        for (let j = i + 1; j < valid.length; j++) {
          if (valid[i]!.id !== valid[j]!.id) {
            addEdge(valid[i]!.id, valid[j]!.id);
          }
        }
      }
    }
  }

  const visited = new Set<string>(startNets.map((n) => n.id));
  const queue = [...visited];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  return visited;
}

// ── 5 Core Learning Tasks ───────────────────────────────────────────────────────

export const TASKS: LearningTask[] = [
  // Task 1: Build - Light an LED
  {
    id: 'light-led',
    title: 'Light an LED Safely',
    kind: 'build',
    minutes: 2,
    concepts: ["Ohm's law", 'Current limiting', 'LED polarity'],
    goal: 'Build a safe circuit that powers a red LED from a 9V battery with a series resistor to prevent burn-out.',
    starterCircuit: {
      components: [
        { id: 't1_b1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 140, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 't1_g1', partId: 'ground', designator: 'GND1', name: 'Earth Ground', x: 140, y: 320, rotation: 0, params: {} },
      ],
      wires: [
        { id: 't1_w1', fromId: 't1_b1', fromPin: 1, toId: 't1_g1', toPin: 0, netType: 'gnd' },
      ],
    },
    milestones: [
      {
        id: 'led_placed',
        label: 'Place a Red LED (D1)',
        hint: 'Use the Library panel or press L to drop a 5mm Red LED.',
        check: (components) => components.some((c) => c.partId === 'led.5mm.red'),
      },
      {
        id: 'resistor_in_path',
        label: 'Place a Series Resistor (R1)',
        hint: 'Drop a resistor (press R) to limit the current.',
        check: (components, _w, nets) => {
          const pinMap = getPinNetMap(nets);
          return components.some((c) => {
            if (c.partId !== 'resistor.axial' && c.partId !== 'potentiometer') return false;
            const n0 = pinMap.get(`${c.id}:0`);
            const n1 = pinMap.get(`${c.id}:1`);
            return Boolean(n0 && n1 && n0.id !== n1.id && n0.pins.length > 1 && n1.pins.length > 1);
          });
        },
      },
      {
        id: 'correct_polarity',
        label: 'Wire Anode (+) toward VCC & Cathode (−) to GND',
        hint: 'Anode connects toward +9V via the resistor; cathode connects to Ground.',
        check: (components, _w, nets) => {
          if (hasVccGndShort(nets)) return false;
          const pinMap = getPinNetMap(nets);
          const vccNets = nets.filter((n) => n.pins.some((p) => p.role === 'vcc'));
          const gndNets = nets.filter((n) => n.pins.some((p) => p.role === 'gnd'));
          const vccReachable = getReachableNetIds(vccNets, components, pinMap);
          const gndReachable = getReachableNetIds(gndNets, components, pinMap);

          return components.some((c) => {
            if (c.partId !== 'led.5mm.red') return false;
            const anodeNet = pinMap.get(`${c.id}:0`);
            const cathodeNet = pinMap.get(`${c.id}:1`);
            if (!anodeNet || !cathodeNet || anodeNet.id === cathodeNet.id) return false;
            return vccReachable.has(anodeNet.id) && gndReachable.has(cathodeNet.id);
          });
        },
      },
      {
        id: 'no_vcc_gnd_short',
        label: 'Ensure No Short Circuit on Power Rails',
        hint: 'Make sure no direct wire links VCC and Ground directly.',
        check: (_c, _w, nets) => !hasVccGndShort(nets) && nets.length > 1,
      },
    ],
  },

  // Task 2: Build - Add a Control Switch
  {
    id: 'add-switch',
    title: 'Add a Control Switch',
    kind: 'build',
    minutes: 3,
    concepts: ['SPST switch', 'Circuit interruption', 'Series control'],
    goal: 'Insert a switch or pushbutton in series with the LED so current can be toggled without breaking wires.',
    starterCircuit: {
      components: [
        { id: 't2_b1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 't2_r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 260, y: 140, rotation: 0, params: { resistance: '220 Ω' } },
        { id: 't2_d1', partId: 'led.5mm.red', designator: 'D1', name: 'LED (Red 5mm)', x: 420, y: 140, rotation: 0, params: { color: 'Red' } },
        { id: 't2_g1', partId: 'ground', designator: 'GND1', name: 'Earth Ground', x: 260, y: 320, rotation: 0, params: {} },
      ],
      wires: [
        { id: 't2_w1', fromId: 't2_b1', fromPin: 0, toId: 't2_r1', toPin: 0, netType: 'vcc' },
        { id: 't2_w2', fromId: 't2_r1', fromPin: 1, toId: 't2_d1', toPin: 0, netType: 'signal' },
        { id: 't2_w3', fromId: 't2_d1', fromPin: 1, toId: 't2_g1', toPin: 0, netType: 'gnd' },
        { id: 't2_w4', fromId: 't2_b1', fromPin: 1, toId: 't2_g1', toPin: 0, netType: 'gnd' },
      ],
    },
    milestones: [
      {
        id: 'switch_placed',
        label: 'Place a Pushbutton or SPST Switch',
        hint: 'Press P for Pushbutton or S for Slide Switch.',
        check: (components) =>
          components.some((c) => c.partId === 'pushbutton' || c.partId === 'switch.spst'),
      },
      {
        id: 'switch_connected',
        label: 'Wire Switch in Series with the Load',
        hint: 'Wire the switch into the positive rail or ground return path so opening it halts current.',
        check: (components, _w, nets) => {
          const pinMap = getPinNetMap(nets);
          return components.some((c) => {
            if (c.partId !== 'pushbutton' && c.partId !== 'switch.spst') return false;
            const n0 = pinMap.get(`${c.id}:0`);
            const n1 = pinMap.get(`${c.id}:1`);
            return Boolean(n0 && n1 && n0.id !== n1.id && n0.pins.length > 1 && n1.pins.length > 1);
          });
        },
      },
      {
        id: 'protection_preserved',
        label: 'Maintain Resistor Protection & Closed Loop',
        hint: 'The resistor must remain in series with the LED.',
        check: (components, _w, nets) => {
          if (hasVccGndShort(nets)) return false;
          const pinMap = getPinNetMap(nets);
          const hasResistor = components.some((c) => c.partId === 'resistor.axial');
          const led = components.find((c) => c.partId === 'led.5mm.red');
          if (!hasResistor || !led) return false;
          const n0 = pinMap.get(`${led.id}:0`);
          const n1 = pinMap.get(`${led.id}:1`);
          return Boolean(n0 && n1 && n0.pins.length > 1 && n1.pins.length > 1);
        },
      },
    ],
  },

  // Task 3: Build - Series vs Parallel Loads
  {
    id: 'series-vs-parallel',
    title: 'Series vs Parallel Loads',
    kind: 'build',
    minutes: 4,
    concepts: ['Parallel branches', 'Current sharing', 'Kirchhoff’s laws'],
    goal: 'Connect two LEDs in parallel branches across the 9V supply, each safely limited by a resistor.',
    starterCircuit: {
      components: [
        { id: 't3_b1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 't3_r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 280, y: 120, rotation: 0, params: { resistance: '330 Ω' } },
        { id: 't3_d1', partId: 'led.5mm.red', designator: 'D1', name: 'LED 1', x: 440, y: 120, rotation: 0, params: { color: 'Red' } },
        { id: 't3_g1', partId: 'ground', designator: 'GND1', name: 'Earth Ground', x: 280, y: 320, rotation: 0, params: {} },
      ],
      wires: [
        { id: 't3_w1', fromId: 't3_b1', fromPin: 0, toId: 't3_r1', toPin: 0, netType: 'vcc' },
        { id: 't3_w2', fromId: 't3_r1', fromPin: 1, toId: 't3_d1', toPin: 0, netType: 'signal' },
        { id: 't3_w3', fromId: 't3_d1', fromPin: 1, toId: 't3_g1', toPin: 0, netType: 'gnd' },
        { id: 't3_w4', fromId: 't3_b1', fromPin: 1, toId: 't3_g1', toPin: 0, netType: 'gnd' },
      ],
    },
    milestones: [
      {
        id: 'two_leds_placed',
        label: 'Place Two LEDs (D1 & D2)',
        hint: 'Add a second LED to your workspace.',
        check: (components) => components.filter((c) => c.partId === 'led.5mm.red').length >= 2,
      },
      {
        id: 'parallel_topology',
        label: 'Wire LEDs in Parallel (Separate Branches)',
        hint: 'Each LED should have its own branch from VCC to GND rather than being daisy-chained end-to-end.',
        check: (components, _w, nets) => {
          const leds = components.filter((c) => c.partId === 'led.5mm.red');
          if (leds.length < 2) return false;
          const pinMap = getPinNetMap(nets);
          const an0 = pinMap.get(`${leds[0]!.id}:0`);
          const an1 = pinMap.get(`${leds[1]!.id}:0`);
          const ca0 = pinMap.get(`${leds[0]!.id}:1`);
          const ca1 = pinMap.get(`${leds[1]!.id}:1`);
          if (!an0 || !an1 || !ca0 || !ca1) return false;
          // In true parallel with separate series resistors or distinct anode nets:
          return an0.id !== an1.id || (an0.pins.length > 2 && ca0.id === ca1.id);
        },
      },
      {
        id: 'both_branches_protected',
        label: 'Current-Limiting Resistors on Both Branches',
        hint: 'Use 2 resistors (one per LED) or a shared limiter rated for the combined current.',
        check: (components, _w, nets) => {
          if (hasVccGndShort(nets)) return false;
          const resCount = components.filter((c) => c.partId === 'resistor.axial' || c.partId === 'potentiometer').length;
          return resCount >= 1;
        },
      },
    ],
  },

  // Task 4: Debug Challenge - Direct Rail Short
  {
    id: 'debug-short',
    title: 'Debug: Direct Rail Short Circuit',
    kind: 'debug',
    minutes: 2,
    concepts: ['Short circuit', 'Zero resistance', 'Hazard isolation'],
    goal: 'A rogue wire connects 9V (+) directly to Ground (−), causing a catastrophic short. Find and delete the faulty wire.',
    starterCircuit: {
      components: [
        { id: 't4_b1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 't4_r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 300, y: 120, rotation: 0, params: { resistance: '330 Ω' } },
        { id: 't4_d1', partId: 'led.5mm.red', designator: 'D1', name: 'LED (Red)', x: 460, y: 120, rotation: 0, params: { color: 'Red' } },
        { id: 't4_g1', partId: 'ground', designator: 'GND1', name: 'Earth Ground', x: 300, y: 320, rotation: 0, params: {} },
      ],
      wires: [
        // Rogue short wire directly from battery (+) to Ground!
        { id: 't4_w_short', fromId: 't4_b1', fromPin: 0, toId: 't4_g1', toPin: 0, netType: 'vcc' },
        { id: 't4_w1', fromId: 't4_b1', fromPin: 0, toId: 't4_r1', toPin: 0, netType: 'vcc' },
        { id: 't4_w2', fromId: 't4_r1', fromPin: 1, toId: 't4_d1', toPin: 0, netType: 'signal' },
        { id: 't4_w3', fromId: 't4_d1', fromPin: 1, toId: 't4_g1', toPin: 0, netType: 'gnd' },
        { id: 't4_w4', fromId: 't4_b1', fromPin: 1, toId: 't4_g1', toPin: 0, netType: 'gnd' },
      ],
    },
    milestones: [
      {
        id: 'short_eliminated',
        label: 'Eliminate the Direct VCC-to-GND Short',
        hint: 'Inspect the wire connecting the battery (+) terminal directly to the Ground symbol and delete it.',
        check: (_c, _w, nets) => !hasVccGndShort(nets),
      },
      {
        id: 'led_loop_intact',
        label: 'Preserve the Functional LED Load Loop',
        hint: 'Current must still flow from BT1(+) through R1 and D1 to Ground.',
        check: (components, _w, nets) => {
          if (hasVccGndShort(nets)) return false;
          const pinMap = getPinNetMap(nets);
          const vccNets = nets.filter((n) => n.pins.some((p) => p.role === 'vcc'));
          const gndNets = nets.filter((n) => n.pins.some((p) => p.role === 'gnd'));
          const vccReachable = getReachableNetIds(vccNets, components, pinMap);
          const gndReachable = getReachableNetIds(gndNets, components, pinMap);
          const led = components.find((c) => c.partId === 'led.5mm.red');
          if (!led) return false;
          const an = pinMap.get(`${led.id}:0`);
          const ca = pinMap.get(`${led.id}:1`);
          return Boolean(an && ca && vccReachable.has(an.id) && gndReachable.has(ca.id));
        },
      },
    ],
  },

  // Task 5: Debug Challenge - Reversed LED Polarity
  {
    id: 'debug-reversed-led',
    title: 'Debug: Reversed LED Polarity',
    kind: 'debug',
    minutes: 2,
    concepts: ['Diode polarity', 'Forward bias', 'Reverse block'],
    goal: 'The LED in this circuit was wired backwards (anode to ground, cathode to +9V). Fix its orientation.',
    starterCircuit: {
      components: [
        { id: 't5_b1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 't5_r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 280, y: 140, rotation: 0, params: { resistance: '330 Ω' } },
        // Backwards LED: cathode (pin 1) faces supply, anode (pin 0) faces ground
        { id: 't5_d1', partId: 'led.5mm.red', designator: 'D1', name: 'LED (Reversed)', x: 440, y: 140, rotation: 0, params: { color: 'Red' } },
        { id: 't5_g1', partId: 'ground', designator: 'GND1', name: 'Earth Ground', x: 280, y: 300, rotation: 0, params: {} },
      ],
      wires: [
        { id: 't5_w1', fromId: 't5_b1', fromPin: 0, toId: 't5_r1', toPin: 0, netType: 'vcc' },
        // Backwards wire: resistor connects to cathode (pin 1)!
        { id: 't5_w2', fromId: 't5_r1', fromPin: 1, toId: 't5_d1', toPin: 1, netType: 'signal' },
        // Anode (pin 0) goes to Ground!
        { id: 't5_w3', fromId: 't5_d1', fromPin: 0, toId: 't5_g1', toPin: 0, netType: 'gnd' },
        { id: 't5_w4', fromId: 't5_b1', fromPin: 1, toId: 't5_g1', toPin: 0, netType: 'gnd' },
      ],
    },
    milestones: [
      {
        id: 'no_reverse_bias',
        label: 'Disconnect the Reverse Polarized Wiring',
        hint: 'An LED cannot conduct when cathode faces the positive rail.',
        check: (components, _w, nets) => {
          const pinMap = getPinNetMap(nets);
          const vccNets = nets.filter((n) => n.pins.some((p) => p.role === 'vcc'));
          const vccReachable = getReachableNetIds(vccNets, components, pinMap);
          const led = components.find((c) => c.partId === 'led.5mm.red');
          if (!led) return false;
          const cathodeNet = pinMap.get(`${led.id}:1`);
          // Pass when cathode is no longer connected toward VCC
          return !cathodeNet || !vccReachable.has(cathodeNet.id);
        },
      },
      {
        id: 'forward_polarity_restored',
        label: 'Connect Anode (+) toward VCC & Cathode (−) to Ground',
        hint: 'Wire the resistor output to the LED anode (left terminal), and cathode to Ground.',
        check: (components, _w, nets) => {
          if (hasVccGndShort(nets)) return false;
          const pinMap = getPinNetMap(nets);
          const vccNets = nets.filter((n) => n.pins.some((p) => p.role === 'vcc'));
          const gndNets = nets.filter((n) => n.pins.some((p) => p.role === 'gnd'));
          const vccReachable = getReachableNetIds(vccNets, components, pinMap);
          const gndReachable = getReachableNetIds(gndNets, components, pinMap);
          const led = components.find((c) => c.partId === 'led.5mm.red');
          if (!led) return false;
          const an = pinMap.get(`${led.id}:0`);
          const ca = pinMap.get(`${led.id}:1`);
          return Boolean(an && ca && vccReachable.has(an.id) && gndReachable.has(ca.id));
        },
      },
    ],
  },
];

export function getTaskById(taskId: string): LearningTask | undefined {
  return TASKS.find((t) => t.id === taskId);
}

export function evaluateTaskMilestones(
  task: LearningTask,
  components: PlacedComponent[],
  wires: WireConnection[]
): Record<string, boolean> {
  const nets = buildNets(components, wires);
  const result: Record<string, boolean> = {};
  for (const m of task.milestones) {
    result[m.id] = m.check(components, wires, nets);
  }
  return result;
}

