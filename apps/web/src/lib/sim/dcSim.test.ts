import { describe, it, expect } from 'vitest';
import {
  runDcSimulation,
  parseResistanceOhms,
  parseVoltageVolts,
  parseCurrentMa,
} from './dcSim';
import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';

describe('dcSim unit helpers', () => {
  it('parses resistance with units correctly', () => {
    expect(parseResistanceOhms('220 Ω')).toBe(220);
    expect(parseResistanceOhms('10 kΩ')).toBe(10000);
    expect(parseResistanceOhms('1 MΩ')).toBe(1000000);
    expect(parseResistanceOhms(undefined, 470)).toBe(470);
  });

  it('parses voltages correctly', () => {
    expect(parseVoltageVolts('9 V')).toBe(9);
    expect(parseVoltageVolts('3.3 V')).toBe(3.3);
    expect(parseVoltageVolts('500 mV')).toBe(0.5);
  });

  it('parses current correctly', () => {
    expect(parseCurrentMa('20 mA')).toBe(20);
    expect(parseCurrentMa('1 A')).toBe(1000);
  });
});

describe('runDcSimulation physics calculation', () => {
  it('returns warning when no power source is in circuit', () => {
    const components: PlacedComponent[] = [
      { id: 'c1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 0, y: 0, rotation: 0, params: {} },
    ];
    const wires: WireConnection[] = [];
    const res = runDcSimulation(components, wires);

    expect(res.severity).toBe('warning');
    expect(res.totalCurrentMa).toBe(0);
    expect(res.hasShortCircuit).toBe(false);
  });

  it('detects direct VCC-to-GND rail short circuit and computes overload current', () => {
    const components: PlacedComponent[] = [
      { id: 'bt1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 0, y: 0, rotation: 0, params: {} },
      { id: 'gnd1', partId: 'ground', designator: 'GND1', name: 'Ground', x: 0, y: 100, rotation: 0, params: {} },
    ];
    // Connect battery pin 0 (VCC) directly to ground (GND)
    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'bt1', fromPin: 0, toId: 'gnd1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'bt1', fromPin: 1, toId: 'gnd1', toPin: 0, netType: 'gnd' },
    ];

    const res = runDcSimulation(components, wires);
    expect(res.hasShortCircuit).toBe(true);
    expect(res.severity).toBe('error');
    expect(res.totalCurrentMa).toBe(1400); // 1.4A battery internal short-circuit
    expect(res.activeWireIds).toContain('w1');
    expect(res.componentTelemetry['bt1']?.stateText).toContain('CRITICAL SHORT');
  });

  it('computes safe LED current with 470Ω series resistor and 9V source', () => {
    const components: PlacedComponent[] = [
      { id: 'bt1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 100, rotation: 0, params: { voltage: '9 V' } },
      { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 200, y: 100, rotation: 0, params: { resistance: '470 Ω' } },
      { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'Red LED', x: 300, y: 100, rotation: 0, params: {} },
    ];

    // Loop: BT1(0) -> R1(0), R1(1) -> D1(0) [anode], D1(1) [cathode] -> BT1(1)
    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'bt1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
      { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'bt1', toPin: 1, netType: 'gnd' },
    ];

    const res = runDcSimulation(components, wires);
    expect(res.hasShortCircuit).toBe(false);
    expect(res.severity).toBe('ok');
    // Net voltage: 9V - 2.0V (LED Vf) = 7.0V
    // Total R: 470Ω + 5Ω (battery internal) = 475Ω
    // Expected current: 7.0 / 475 ≈ 14.7 mA (< 20 mA max)
    expect(res.totalCurrentMa).toBeGreaterThan(12);
    expect(res.totalCurrentMa).toBeLessThan(18);

    // Resistor telemetry
    const rTelem = res.componentTelemetry['r1'];
    expect(rTelem).toBeDefined();
    expect(rTelem?.voltageDrop).toBeGreaterThan(6.0);
    expect(rTelem?.powerMw).toBeGreaterThan(80);

    // LED status: safely lit
    const ledSt = res.ledStates['d1'];
    expect(ledSt).toBeDefined();
    expect(ledSt?.status).toBe('lit');
    expect(ledSt?.currentMa).toBeGreaterThan(12);
  });

  it('marks LED as overcurrent hazard when connected directly without series resistor', () => {
    const components: PlacedComponent[] = [
      { id: 'bt1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 100, rotation: 0, params: { voltage: '9 V' } },
      { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'Red LED', x: 300, y: 100, rotation: 0, params: {} },
    ];

    // Direct connection without resistor
    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'bt1', fromPin: 0, toId: 'd1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'd1', fromPin: 1, toId: 'bt1', toPin: 1, netType: 'gnd' },
    ];

    const res = runDcSimulation(components, wires);
    expect(res.hasShortCircuit).toBe(false);
    expect(res.ledStates['d1']?.status).toBe('overcurrent');
    expect(res.componentTelemetry['d1']?.stateText).toContain('BURNOUT HAZARD');
  });

  it('respects SPST switch state: blocks current when open, conducts when closed', () => {
    const componentsOpen: PlacedComponent[] = [
      { id: 'bt1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 100, rotation: 0, params: { voltage: '9 V' } },
      { id: 'sw1', partId: 'switch.spst', designator: 'SW1', name: 'SPST Switch', x: 200, y: 100, rotation: 0, params: { state: 'open' } },
      { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 300, y: 100, rotation: 0, params: { resistance: '1 kΩ' } },
      { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'Red LED', x: 400, y: 100, rotation: 0, params: {} },
    ];

    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'bt1', fromPin: 0, toId: 'sw1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'sw1', fromPin: 1, toId: 'r1', toPin: 0, netType: 'signal' },
      { id: 'w3', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
      { id: 'w4', fromId: 'd1', fromPin: 1, toId: 'bt1', toPin: 1, netType: 'gnd' },
    ];

    const resOpen = runDcSimulation(componentsOpen, wires);
    expect(resOpen.totalCurrentMa).toBe(0);
    expect(resOpen.ledStates['d1']?.status).toBe('off');

    // Now close the switch
    const componentsClosed: PlacedComponent[] = componentsOpen.map((c) =>
      c.id === 'sw1' ? { ...c, params: { state: 'closed' } } : c
    );

    const resClosed = runDcSimulation(componentsClosed, wires);
    expect(resClosed.totalCurrentMa).toBeGreaterThan(6.0);
    expect(resClosed.totalCurrentMa).toBeLessThan(8.0); // (9 - 2) / (1000 + 5) ≈ 6.96 mA
    expect(resClosed.ledStates['d1']?.status).toBe('lit');
  });

  it('adjusts current dynamically as potentiometer wiper position changes', () => {
    const makeCircuit = (wiper: number): PlacedComponent[] => [
      { id: 'bt1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 100, rotation: 0, params: { voltage: '9 V' } },
      { id: 'pot1', partId: 'potentiometer', designator: 'RV1', name: 'Potentiometer', x: 200, y: 100, rotation: 0, params: { resistance: '10 kΩ', wiper: String(wiper) } },
      { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'Red LED', x: 300, y: 100, rotation: 0, params: {} },
    ];

    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'bt1', fromPin: 0, toId: 'pot1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'pot1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' }, // wiper pin 1
      { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'bt1', toPin: 1, netType: 'gnd' },
    ];

    // High resistance (wiper 80% = 8 kΩ) -> low current
    const resHigh = runDcSimulation(makeCircuit(80), wires);
    // Low resistance (wiper 10% = 1 kΩ) -> higher current
    const resLow = runDcSimulation(makeCircuit(10), wires);

    expect(resLow.totalCurrentMa).toBeGreaterThan(resHigh.totalCurrentMa);
    expect(resHigh.componentTelemetry['pot1']?.stateText).toContain('80%');
    expect(resLow.componentTelemetry['pot1']?.stateText).toContain('10%');
  });
});
