import { describe, it, expect } from 'vitest';
import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import { evaluateErc } from '../erc/rules';
import { runDcSimulation } from '../sim/dcSim';
import { buildCircuitContext } from './buildCircuitContext';

describe('buildCircuitContext', () => {
  it('handles empty canvas fixture cleanly', () => {
    const ctx = buildCircuitContext({
      project: { id: 'p-empty', name: 'Blank Lab' },
      components: [],
      wires: [],
      selection: { componentIds: [], connectionIds: [] },
      findings: [],
    });

    expect(ctx.project).toEqual({ id: 'p-empty', name: 'Blank Lab' });
    expect(ctx.components).toEqual([]);
    expect(ctx.connections).toEqual([]);
    expect(ctx.selection).toEqual({ componentIds: [], connectionIds: [] });
    expect(ctx.validation).toEqual([]);
    expect(ctx.simulation).toBeUndefined();
    expect(ctx.meta).toEqual({
      componentCount: 0,
      connectionCount: 0,
      truncated: false,
    });
  });

  it('serializes LED + resistor + battery fixture without pixel coordinates', () => {
    const components: PlacedComponent[] = [
      { id: 'c1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 120, y: 200, rotation: 90, params: { voltage: '9 V' } },
      { id: 'c2', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 280, y: 140, rotation: 0, params: { resistance: '220 Ω' } },
      { id: 'c3', partId: 'led.5mm.red', designator: 'D1', name: 'LED (Red 5mm)', x: 440, y: 140, rotation: 0, params: { color: 'Red', forward_voltage: '2.0 V' } },
      { id: 'c4', partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 280, y: 300, rotation: 0, params: {} },
    ];
    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'c1', fromPin: 0, toId: 'c2', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'c2', fromPin: 1, toId: 'c3', toPin: 0, netType: 'signal' },
      { id: 'w3', fromId: 'c3', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
      { id: 'w4', fromId: 'c1', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
    ];
    const findings = evaluateErc(components, wires);

    const ctx = buildCircuitContext({
      project: {
        id: 'p-led',
        name: 'LED Lab',
        task: { title: 'LED Limiter', goal: 'Protect the LED with a resistor' },
      },
      components,
      wires,
      selection: { componentIds: ['c3'], connectionIds: [] },
      findings,
    });

    expect(ctx.project.task).toEqual({
      title: 'LED Limiter',
      goal: 'Protect the LED with a resistor',
    });
    expect(ctx.components).toHaveLength(4);
    // Pixel fields x, y, rotation must be stripped
    for (const c of ctx.components) {
      expect((c as any).x).toBeUndefined();
      expect((c as any).y).toBeUndefined();
      expect((c as any).rotation).toBeUndefined();
    }
    expect(ctx.connections[0]?.from).toBe('V1.+');
    expect(ctx.connections[0]?.to).toBe('R1.1');
    expect(ctx.connections[1]?.from).toBe('R1.2');
    expect(ctx.connections[1]?.to).toBe('D1.anode');
    expect(ctx.selection.componentIds).toEqual(['c3']);
    expect(ctx.meta.truncated).toBe(false);
    expect(ctx.meta.componentCount).toBe(4);
    expect(ctx.meta.connectionCount).toBe(4);
  });

  it('captures voltage divider fixture with live simulation telemetry', () => {
    const components: PlacedComponent[] = [
      { id: 'v1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 100, y: 100, rotation: 0, params: { voltage: '9 V' } },
      { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 220, y: 100, rotation: 0, params: { resistance: '1 kΩ' } },
      { id: 'r2', partId: 'resistor.axial', designator: 'R2', name: 'Resistor', x: 340, y: 100, rotation: 0, params: { resistance: '1 kΩ' } },
      { id: 'g1', partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 220, y: 240, rotation: 0, params: {} },
    ];
    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'v1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'r2', toPin: 0, netType: 'signal' },
      { id: 'w3', fromId: 'r2', fromPin: 1, toId: 'g1', toPin: 0, netType: 'gnd' },
      { id: 'w4', fromId: 'v1', fromPin: 1, toId: 'g1', toPin: 0, netType: 'gnd' },
    ];
    const simResult = runDcSimulation(components, wires);

    const ctx = buildCircuitContext({
      project: { id: 'p-div', name: 'Voltage Divider' },
      components,
      wires,
      selection: { componentIds: ['r2'], connectionIds: ['w2'] },
      findings: evaluateErc(components, wires),
      simulation: { running: true, result: simResult },
    });

    expect(ctx.simulation?.running).toBe(true);
    expect(ctx.simulation?.summary).toBeTruthy();
    expect(ctx.selection).toEqual({ componentIds: ['r2'], connectionIds: ['w2'] });
    expect(ctx.connections.some((c) => c.from === 'R1.2' && c.to === 'R2.1')).toBe(true);
  });

  it('truncates huge circuits while preserving selected components in full', () => {
    const components: PlacedComponent[] = Array.from({ length: 60 }, (_, i) => ({
      id: `comp_${i}`,
      partId: i === 42 ? 'led.5mm.red' : 'resistor.axial',
      designator: i === 42 ? 'LED_TARGET' : `R${i + 1}`,
      name: i === 42 ? 'LED (Red 5mm)' : 'Resistor',
      x: i * 10,
      y: i * 10,
      rotation: 0,
      params: (i === 42
        ? { color: 'Red', forward_voltage: '2.0 V' }
        : { resistance: '10 kΩ' }) as Record<string, string>,
    }));
    const wires: WireConnection[] = Array.from({ length: 59 }, (_, i) => ({
      id: `w_${i}`,
      fromId: `comp_${i}`,
      fromPin: 1,
      toId: `comp_${i + 1}`,
      toPin: 0,
      netType: 'signal' as const,
    }));

    const ctx = buildCircuitContext(
      {
        project: { id: 'p-huge', name: 'Dense Matrix' },
        components,
        wires,
        selection: { componentIds: ['comp_42'], connectionIds: [] },
        findings: [],
      },
      1800
    );

    expect(ctx.meta.truncated).toBe(true);
    expect(ctx.meta.componentCount).toBe(60);
    expect(ctx.meta.summary).toEqual({ 'resistor.axial': 59, 'led.5mm.red': 1 });
    expect(ctx.components.some((c) => c.id === 'comp_42' && c.label === 'LED_TARGET')).toBe(true);
    expect(JSON.stringify(ctx).length).toBeLessThanOrEqual(1800);
  });
});
