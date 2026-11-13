import { describe, it, expect } from 'vitest';
import { TASKS, evaluateTaskMilestones } from './tasks';
import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';

describe('Learning Tasks Milestone Checkers', () => {
  it('light-led task: evaluates initial starter circuit as incomplete', () => {
    const task = TASKS.find((t) => t.id === 'light-led')!;
    expect(task).toBeDefined();

    const starter = task.starterCircuit;
    const progress = evaluateTaskMilestones(task, starter.components, starter.wires);

    expect(progress.led_placed).toBe(false);
    expect(progress.resistor_in_path).toBe(false);
    expect(progress.correct_polarity).toBe(false);
    expect(progress.no_vcc_gnd_short).toBe(true);
  });

  it('light-led task: passes all milestones when safe circuit is constructed', () => {
    const task = TASKS.find((t) => t.id === 'light-led')!;

    const components: PlacedComponent[] = [
      { id: 'b1', partId: 'battery.9v', designator: 'BT1', name: '9V Battery', x: 100, y: 100, rotation: 0, params: {} },
      { id: 'r1', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 250, y: 100, rotation: 0, params: {} },
      { id: 'd1', partId: 'led.5mm.red', designator: 'D1', name: 'LED', x: 400, y: 100, rotation: 0, params: {} },
      { id: 'g1', partId: 'ground', designator: 'GND1', name: 'Ground', x: 250, y: 250, rotation: 0, params: {} },
    ];

    const wires: WireConnection[] = [
      { id: 'w1', fromId: 'b1', fromPin: 0, toId: 'r1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'r1', fromPin: 1, toId: 'd1', toPin: 0, netType: 'signal' },
      { id: 'w3', fromId: 'd1', fromPin: 1, toId: 'g1', toPin: 0, netType: 'gnd' },
      { id: 'w4', fromId: 'b1', fromPin: 1, toId: 'g1', toPin: 0, netType: 'gnd' },
    ];

    const progress = evaluateTaskMilestones(task, components, wires);
    expect(progress.led_placed).toBe(true);
    expect(progress.resistor_in_path).toBe(true);
    expect(progress.correct_polarity).toBe(true);
    expect(progress.no_vcc_gnd_short).toBe(true);
  });

  it('debug-short task: starts with short milestone failing, passes when short wire is removed', () => {
    const task = TASKS.find((t) => t.id === 'debug-short')!;
    const starter = task.starterCircuit;

    const initial = evaluateTaskMilestones(task, starter.components, starter.wires);
    expect(initial.short_eliminated).toBe(false);

    // Remove the rogue short wire
    const fixedWires = starter.wires.filter((w) => w.id !== 't4_w_short');
    const fixed = evaluateTaskMilestones(task, starter.components, fixedWires);

    expect(fixed.short_eliminated).toBe(true);
    expect(fixed.led_loop_intact).toBe(true);
  });

  it('debug-reversed-led task: starts with reverse bias, passes when polarity is flipped', () => {
    const task = TASKS.find((t) => t.id === 'debug-reversed-led')!;
    const starter = task.starterCircuit;

    const initial = evaluateTaskMilestones(task, starter.components, starter.wires);
    expect(initial.no_reverse_bias).toBe(false);
    expect(initial.forward_polarity_restored).toBe(false);

    // Flip the LED connections: resistor to anode (pin 0), cathode (pin 1) to GND
    const fixedWires = starter.wires.map((w) => {
      if (w.id === 't5_w2') return { ...w, toPin: 0 };
      if (w.id === 't5_w3') return { ...w, fromPin: 1 };
      return w;
    });

    const fixed = evaluateTaskMilestones(task, starter.components, fixedWires);
    expect(fixed.no_reverse_bias).toBe(true);
    expect(fixed.forward_polarity_restored).toBe(true);
  });

  it('add-switch task: verifies switch presence and wiring', () => {
    const task = TASKS.find((t) => t.id === 'add-switch')!;
    const starter = task.starterCircuit;

    const initial = evaluateTaskMilestones(task, starter.components, starter.wires);
    expect(initial.switch_placed).toBe(false);

    // Add a pushbutton in series
    const components: PlacedComponent[] = [
      ...starter.components,
      { id: 'sw1', partId: 'pushbutton', designator: 'SW1', name: 'Pushbutton', x: 200, y: 140, rotation: 0, params: {} },
    ];

    const wires: WireConnection[] = [
      { id: 'w1', fromId: 't2_b1', fromPin: 0, toId: 'sw1', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'sw1', fromPin: 1, toId: 't2_r1', toPin: 0, netType: 'signal' },
      { id: 'w3', fromId: 't2_r1', fromPin: 1, toId: 't2_d1', toPin: 0, netType: 'signal' },
      { id: 'w4', fromId: 't2_d1', fromPin: 1, toId: 't2_g1', toPin: 0, netType: 'gnd' },
      { id: 'w5', fromId: 't2_b1', fromPin: 1, toId: 't2_g1', toPin: 0, netType: 'gnd' },
    ];

    const updated = evaluateTaskMilestones(task, components, wires);
    expect(updated.switch_placed).toBe(true);
    expect(updated.switch_connected).toBe(true);
    expect(updated.protection_preserved).toBe(true);
  });
});
