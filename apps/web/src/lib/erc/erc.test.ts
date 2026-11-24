import { describe, it, expect } from 'vitest';
import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import { evaluateErc } from './rules';
import {
  getUnlockedLevel,
  getNextHintStep,
  pickTargetFinding,
  getConceptRecap,
  type FindingHintState,
} from '../mentor/useMentor';
import { runDcSimulation } from '../sim/dcSim';
import { routeAllWires } from '../canvas/wireRouter';

describe('CircuitMentor ERC Engine', () => {
  // ── Rule 1: VCC_GND_SHORT ───────────────────────────────────────────────────
  describe('Rule: VCC_GND_SHORT', () => {
    it('detects direct short circuit between power rail and ground', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
      ];
      // Wire battery + (pin 0) directly to battery − (pin 1)
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'v1', toPin: 1, netType: 'vcc' },
      ];

      const findings = evaluateErc(components, wires);
      const shortFinding = findings.find((f) => f.ruleId === 'VCC_GND_SHORT');
      expect(shortFinding).toBeDefined();
      expect(shortFinding?.severity).toBe('error');
    });

    it('clears VCC_GND_SHORT when separated by a load (resistor)', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 50, y: 0, rotation: 0, params: {} },
      ];
      // V1(+) -> R1(pin 0), R1(pin 1) -> V1(−)
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'v1', toPin: 1, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const shortFinding = findings.find((f) => f.ruleId === 'VCC_GND_SHORT');
      expect(shortFinding).toBeUndefined();
    });
  });

  // ── Rule 2: LED_NO_RESISTOR ─────────────────────────────────────────────────
  describe('Rule: LED_NO_RESISTOR', () => {
    it('detects LED wired directly to power source without a current limiting resistor', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 100, y: 0, rotation: 0, params: {} },
      ];
      // V1(+) -> D1(anode, 0), D1(cathode, 1) -> V1(−, 1)
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'v1', toPin: 1, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const resFinding = findings.find((f) => f.ruleId === 'LED_NO_RESISTOR');
      expect(resFinding).toBeDefined();
      expect(resFinding?.severity).toBe('warning');
      expect(resFinding?.anchorId).toBe('d1');
    });

    it('clears LED_NO_RESISTOR when a series resistor is inserted', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 50, y: 0, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 100, y: 0, rotation: 0, params: {} },
      ];
      // V1(+) -> R1(0), R1(1) -> D1(anode, 0), D1(cathode, 1) -> V1(−, 1)
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
        { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'v1', toPin: 1, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const resFinding = findings.find((f) => f.ruleId === 'LED_NO_RESISTOR');
      expect(resFinding).toBeUndefined();
    });
  });

  // ── Rule 3: LED_REVERSED ───────────────────────────────────────────────────
  describe('Rule: LED_REVERSED', () => {
    it('detects LED connected with reverse polarity (anode to GND, cathode to VCC)', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 100, y: 0, rotation: 0, params: {} },
      ];
      // V1(+) -> D1(cathode, 1), D1(anode, 0) -> V1(−, 1)
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 1, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 0, toId: 'v1', toPin: 1, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const revFinding = findings.find((f) => f.ruleId === 'LED_REVERSED');
      expect(revFinding).toBeDefined();
      expect(revFinding?.severity).toBe('error');
    });

    it('clears LED_REVERSED when connected in forward polarity', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 100, y: 0, rotation: 0, params: {} },
      ];
      // Forward bias: V1(+) -> D1(anode, 0), D1(cathode, 1) -> V1(−, 1)
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'v1', toPin: 1, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const revFinding = findings.find((f) => f.ruleId === 'LED_REVERSED');
      expect(revFinding).toBeUndefined();
    });
  });

  // ── Rule 4: NO_GROUND_PATH ──────────────────────────────────────────────────
  describe('Rule: NO_GROUND_PATH', () => {
    it('warns when a battery negative terminal has no return path', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 50, y: 0, rotation: 0, params: {} },
      ];
      // Only VCC wired, GND pin 1 left floating
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
      ];

      const findings = evaluateErc(components, wires);
      const gndFinding = findings.find((f) => f.ruleId === 'NO_GROUND_PATH');
      expect(gndFinding).toBeDefined();
      expect(gndFinding?.severity).toBe('warning');
    });

    it('clears NO_GROUND_PATH when battery negative terminal is connected', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 0, y: 50, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const gndFinding = findings.find((f) => f.ruleId === 'NO_GROUND_PATH');
      expect(gndFinding).toBeUndefined();
    });
  });

  // ── Rule 5: UNCONNECTED_PIN ────────────────────────────────────────────────
  describe('Rule: UNCONNECTED_PIN', () => {
    it('informs when a required pin is unconnected/floating', () => {
      const components: PlacedComponent[] = [
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 0, y: 0, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [];

      const findings = evaluateErc(components, wires);
      const unconn = findings.filter((f) => f.ruleId === 'UNCONNECTED_PIN');
      // Both anode and cathode of LED are required pins
      expect(unconn.length).toBeGreaterThanOrEqual(2);
      expect(unconn[0]?.severity).toBe('info');
    });

    it('clears UNCONNECTED_PIN when required pins are connected', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 100, y: 0, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'v1', toPin: 1, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const unconn = findings.filter((f) => f.ruleId === 'UNCONNECTED_PIN');
      expect(unconn.length).toBe(0);
    });
  });

  // ── Visual Hint Ladder & Attempt-Gated Unlock Logic ────────────────────────
  describe('Visual Hint Ladder & Mentor Unlock Logic', () => {
    it('attaches 4 deterministic hint levels to every ERC rule finding', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 100, y: 200, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 300, y: 200, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 200, y: 300, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w3', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      const ledFinding = findings.find((f) => f.ruleId === 'LED_NO_RESISTOR');
      expect(ledFinding).toBeDefined();
      expect(ledFinding?.hints.map((h) => h.level)).toEqual([1, 2, 3, 4]);
      expect(ledFinding?.hints[0]?.highlight.components).toContain('d1');
      expect(ledFinding?.hints[1]?.highlight.netPath).toEqual(['v1', 'd1', 'gnd']);
      expect(ledFinding?.hints[2]?.highlight.ghost?.category).toBeTruthy();
      expect(ledFinding?.hints[2]?.highlight.ghost?.value).toBeUndefined();
      expect(ledFinding?.hints[3]?.highlight.ghost?.value).toContain('330');
    });

    it('gates Level 2 behind at least one circuit edit and unlocks Reveal after Level 3', () => {
      const initial: FindingHintState = {
        findingId: 'erc_led_res_d1',
        shownLevel: 0,
        changesWhilePersisted: 0,
      };

      // Step 1: L1 is always unlocked
      expect(getUnlockedLevel(initial)).toBe(1);
      expect(getNextHintStep(initial)).toEqual({
        unlockedLevel: 1,
        nextLevel: 1,
        lockedReason: null,
      });

      // After L1 shown with 0 edits, L2 is locked with reason
      const afterL1NoEdit: FindingHintState = {
        ...initial,
        shownLevel: 1,
        changesWhilePersisted: 0,
      };
      const blockedStep = getNextHintStep(afterL1NoEdit);
      expect(blockedStep.unlockedLevel).toBe(1);
      expect(blockedStep.lockedReason).toMatch(/at least 1 edit/i);

      // After 1 circuit edit while finding persists, L2 unlocks
      const afterL1WithEdit: FindingHintState = {
        ...afterL1NoEdit,
        changesWhilePersisted: 1,
      };
      expect(getUnlockedLevel(afterL1WithEdit)).toBe(2);
      expect(getNextHintStep(afterL1WithEdit)).toEqual({
        unlockedLevel: 2,
        nextLevel: 2,
        lockedReason: null,
      });

      // After L2 is shown, L3 unlocks
      const afterL2: FindingHintState = {
        ...afterL1WithEdit,
        shownLevel: 2,
      };
      expect(getUnlockedLevel(afterL2)).toBe(3);
      expect(getNextHintStep(afterL2).nextLevel).toBe(3);

      // After L3 is shown, Reveal (L4) unlocks
      const afterL3: FindingHintState = {
        ...afterL2,
        shownLevel: 3,
      };
      expect(getUnlockedLevel(afterL3)).toBe(4);
      expect(getNextHintStep(afterL3).nextLevel).toBe(4);
    });

    it('prioritizes higher-severity findings and provides concept recaps', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 100, y: 200, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 200, y: 100, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 300, y: 200, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 200, y: 300, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w3', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      // Even with no selection, warning (LED_NO_RESISTOR) beats info (UNCONNECTED_PIN on R1)
      const picked = pickTargetFinding(findings, null, null);
      expect(picked?.ruleId).toBe('LED_NO_RESISTOR');

      expect(getConceptRecap('LED_NO_RESISTOR')).toMatch(/Ohm's law/i);
    });
  });

  // ── Deterministic DC Simulator ─────────────────────────────────────────────
  describe('Deterministic DC Simulator', () => {
    it('flags LED overcurrent when wired without a resistor and lights safely with 330 Ω', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: { voltage: '9 V' } },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 100, y: 0, rotation: 0, params: { forward_voltage: '2.0 V', max_current: '20 mA' } },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 50, y: 100, rotation: 0, params: {} },
      ];
      const noResWires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w3', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const overSim = runDcSimulation(components, noResWires);
      expect(overSim.severity).toBe('error');
      expect(overSim.ledStates.d1?.status).toBe('overcurrent');
      expect(overSim.ledStates.d1?.currentMa).toBeGreaterThan(20);

      const withResComps: PlacedComponent[] = [
        ...components,
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 50, y: 0, rotation: 0, params: { resistance: '470 Ω' } },
      ];
      const withResWires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
        { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w4', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const safeSim = runDcSimulation(withResComps, withResWires);
      expect(safeSim.severity).toBe('ok');
      expect(safeSim.ledStates.d1?.status).toBe('lit');
      expect(safeSim.ledStates.d1?.currentMa).toBeCloseTo(14.9, 0);
      expect(safeSim.activeWireIds.length).toBe(4);
    });
  });

  // ── Malformed / Shorted Component & Open-Loop Topologies ───────────────────
  describe('Malformed Wiring, Shorted Components & Junction Routing', () => {
    it('flags shorted/bypassed LED and potentiometer wiper shorted with floating end', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 200, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 300, y: 200, rotation: 0, params: {} },
        { id: 'rv1', partId: 'potentiometer', designator: 'RV1', name: 'Potentiometer', x: 420, y: 300, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND1', name: 'Ground', x: 200, y: 320, rotation: 0, params: {} },
      ];
      // Malformed wiring: BT1+ goes to D1 anode and RV1:0; D1 cathode goes to RV1:0 and RV1:1; BT1- to GND1
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'v1', fromPin: 0, toId: 'rv1', toPin: 0, netType: 'vcc' },
        { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'rv1', toPin: 0, netType: 'signal' },
        { id: 'w4', fromId: 'd1', fromPin: 1, toId: 'rv1', toPin: 1, netType: 'signal' },
        { id: 'w5', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.ruleId === 'SHORTED_COMPONENT')).toBe(true);
    });

    it('still catches LED_NO_RESISTOR when a parallel pot hangs off cathode while VCC and GND drive LED directly', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 200, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 300, y: 200, rotation: 0, params: {} },
        { id: 'rv1', partId: 'potentiometer', designator: 'RV1', name: 'Potentiometer', x: 420, y: 300, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND1', name: 'Ground', x: 200, y: 320, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w3', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w4', fromId: 'd1', fromPin: 1, toId: 'rv1', toPin: 0, netType: 'signal' },
        { id: 'w5', fromId: 'd1', fromPin: 1, toId: 'rv1', toPin: 1, netType: 'signal' },
      ];

      const findings = evaluateErc(components, wires);
      expect(findings.some((f) => f.ruleId === 'LED_NO_RESISTOR')).toBe(true);
      expect(findings.some((f) => f.ruleId === 'SHORTED_COMPONENT')).toBe(true);
    });

    it('detects reversed LED even when wired through a series resistor', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 100, y: 200, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 220, y: 140, rotation: 0, params: {} },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 380, y: 140, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 220, y: 300, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 1, netType: 'signal' }, // cathode to VCC side
        { id: 'w3', fromId: 'd1', fromPin: 0, toId: 'gnd', toPin: 0, netType: 'gnd' },  // anode to GND
        { id: 'w4', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      const findings = evaluateErc(components, wires);
      expect(findings.some((f) => f.ruleId === 'LED_REVERSED')).toBe(true);
    });

    it('supports wire junction nodes cleanly in ERC, simulation, and orthogonal auto-router', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 'j1', partId: 'junction', designator: 'J1', name: 'Wire Junction', x: 180, y: 120, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 280, y: 120, rotation: 0, params: { resistance: '470 Ω' } },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 440, y: 120, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 280, y: 300, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'j1', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'j1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
        { id: 'w3', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
        { id: 'w4', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w5', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      expect(evaluateErc(components, wires)).toEqual([]);
      const sim = runDcSimulation(components, wires);
      expect(sim.severity).toBe('ok');
      expect(sim.ledStates.d1?.status).toBe('lit');

      const routed = routeAllWires(components, wires, true);
      expect(routed).toHaveLength(5);
      for (const rw of routed) {
        expect(rw.dPath.startsWith('M ')).toBe(true);
        expect(rw.points.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('simulates variable current based on potentiometer wiper ratio', () => {
      // 9V Battery -> Potentiometer (10 kΩ, 0 to 1) -> LED -> GND
      const baseComp: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: { voltage: '9 V' } },
        { id: 'pot', partId: 'potentiometer', designator: 'RV1', name: 'Potentiometer', x: 100, y: 0, rotation: 0, params: { resistance: '10 kΩ', wiper: '50' } },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 200, y: 0, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 100, y: 100, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'pot', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'pot', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
        { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w4', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      // At 50% wiper of 10 kΩ = 5 kΩ: I = (9 - 2) / 5000 = 1.4 mA
      const sim50 = runDcSimulation(baseComp, wires);
      expect(sim50.ledStates.d1?.currentMa).toBeCloseTo(1.4, 0.2);

      // At 20% wiper of 10 kΩ = 2 kΩ: I = (9 - 2) / 2000 = 3.5 mA
      const comp20 = baseComp.map((c) => (c.id === 'pot' ? { ...c, params: { ...c.params, wiper: '20' } } : c));
      const sim20 = runDcSimulation(comp20, wires);
      expect(sim20.ledStates.d1?.currentMa).toBeCloseTo(3.5, 0.2);
      expect(sim20.ledStates.d1?.currentMa).toBeGreaterThan(sim50.ledStates.d1!.currentMa);
    });

    it('simulates switch open vs closed states', () => {
      // 9V Battery -> Switch -> 470 Ω Resistor -> LED -> GND
      const baseComp: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: { voltage: '9 V' } },
        { id: 'sw', partId: 'switch.spst', designator: 'SW1', name: 'Slide Switch', x: 80, y: 0, rotation: 0, params: { state: 'closed' } },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 160, y: 0, rotation: 0, params: { resistance: '470 Ω' } },
        { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 240, y: 0, rotation: 0, params: {} },
        { id: 'gnd', partId: 'ground', designator: 'GND', name: 'Ground', x: 120, y: 100, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'sw', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'sw', fromPin: 1, toId: 'r1', toPin: 0, netType: 'signal' },
        { id: 'w3', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
        { id: 'w4', fromId: 'd1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
        { id: 'w5', fromId: 'v1', fromPin: 1, toId: 'gnd', toPin: 0, netType: 'gnd' },
      ];

      // Closed switch: LED lights up
      const simClosed = runDcSimulation(baseComp, wires);
      expect(simClosed.ledStates.d1?.status).toBe('lit');
      expect(simClosed.ledStates.d1?.currentMa).toBeGreaterThan(10);

      // Open switch: circuit broken, 0 mA, LED is off
      const compOpen = baseComp.map((c) => (c.id === 'sw' ? { ...c, params: { ...c.params, state: 'open' } } : c));
      const simOpen = runDcSimulation(compOpen, wires);
      expect(simOpen.ledStates.d1?.status).toBe('off');
      expect(simOpen.ledStates.d1?.currentMa).toBe(0);
    });

    it('utilizes route cache correctly across consecutive routing runs', () => {
      const components: PlacedComponent[] = [
        { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 50, y: 50, rotation: 0, params: {} },
        { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 200, y: 50, rotation: 0, params: {} },
      ];
      const wires: WireConnection[] = [
        { id: 'w_test', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
      ];

      const run1 = routeAllWires(components, wires, true);
      const run2 = routeAllWires(components, wires, true);
      expect(run1).toEqual(run2);
      expect(run1[0]?.dPath).toBe(run2[0]?.dPath);
    });
  });
});

