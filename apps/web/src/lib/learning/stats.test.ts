import { describe, it, expect } from 'vitest';
import { kpis, dailyActivity, commonMistakes } from './stats';
import type { ProjectData } from '../../components/Dashboard';

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'p1',
    name: 'Test Project',
    updatedAt: new Date().toISOString(),
    components: [],
    wires: [],
    findings: [],
    taskId: null,
    progress: {},
    goal: null,
    ...overrides,
  };
}

describe('kpis', () => {
  it('returns zeros for empty project list', () => {
    const result = kpis([]);
    expect(result.tasksDone).toBe(0);
    expect(result.tasksTotal).toBe(5);
    expect(result.cleanCircuits).toBe(0);
    expect(result.issuesFixed).toBe(0);
    expect(result.avgHintsPerTask).toBe(0);
  });

  it('counts completed tasks correctly', () => {
    const projects = [
      makeProject({ progress: { completed_at: new Date().toISOString() } }),
      makeProject({ progress: {} }),
    ];
    const result = kpis(projects);
    expect(result.tasksDone).toBe(1);
  });

  it('counts clean circuits (no findings, has components)', () => {
    const projects = [
      makeProject({
        findings: [],
        components: [{ id: 'c1', partId: 'resistor.axial', designator: 'R1', name: 'R', x: 0, y: 0, rotation: 0, params: {} }],
      }),
      makeProject({
        findings: [
          {
            id: 'f1',
            ruleId: 'LED_NO_RESISTOR',
            severity: 'error',
            title: 'Missing resistor',
            detail: 'Missing resistor',
            anchorId: 'c1',
            componentIds: [],
            hints: [],
          },
        ],
        components: [],
      }),
      makeProject({ findings: [], components: [] }), // empty circuit — doesn't count
    ];
    const result = kpis(projects);
    expect(result.cleanCircuits).toBe(1);
  });

  it('sums issues fixed from findings_seen', () => {
    const projects = [
      makeProject({ progress: { findings_seen: { LED_NO_RESISTOR: 2, VCC_GND_SHORT: 1 } } }),
      makeProject({ progress: { findings_seen: { LED_NO_RESISTOR: 3 } } }),
    ];
    const result = kpis(projects);
    expect(result.issuesFixed).toBe(6);
  });

  it('calculates avg hints per task correctly', () => {
    const projects = [
      makeProject({ progress: { completed_at: new Date().toISOString(), hints_used: 4 } }),
      makeProject({ progress: { completed_at: new Date().toISOString(), hints_used: 6 } }),
    ];
    const result = kpis(projects);
    expect(result.avgHintsPerTask).toBe(5);
  });
});

describe('dailyActivity', () => {
  it('returns correct number of days', () => {
    const result7 = dailyActivity([], 7);
    expect(result7.length).toBe(7);
    const result30 = dailyActivity([], 30);
    expect(result30.length).toBe(30);
  });

  it('returns zeros for empty projects', () => {
    const result = dailyActivity([], 7);
    for (const day of result) {
      expect(day.milestones).toBe(0);
      expect(day.fixes).toBe(0);
      expect(day.hints).toBe(0);
    }
  });

  it('uses day-of-week labels for 7-day view', () => {
    const result = dailyActivity([], 7);
    const validLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const day of result) {
      expect(validLabels).toContain(day.date);
    }
  });
});

describe('commonMistakes', () => {
  it('returns empty for projects with no findings_seen', () => {
    const projects = [makeProject(), makeProject()];
    expect(commonMistakes(projects)).toHaveLength(0);
  });

  it('sorts by count descending and limits to 3', () => {
    const projects = [
      makeProject({
        progress: {
          findings_seen: {
            LED_NO_RESISTOR: 5,
            VCC_GND_SHORT: 2,
            LED_REVERSED: 8,
            NO_GROUND_PATH: 1,
          },
        },
      }),
    ];
    const result = commonMistakes(projects);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result[0]!.ruleId).toBe('LED_REVERSED');
    expect(result[0]!.count).toBe(8);
    expect(result[1]!.ruleId).toBe('LED_NO_RESISTOR');
  });

  it('uses friendly labels for known rule IDs', () => {
    const projects = [
      makeProject({ progress: { findings_seen: { LED_NO_RESISTOR: 1 } } }),
    ];
    const result = commonMistakes(projects);
    expect(result[0]!.label).toBe('LED without current limiter');
  });

  it('falls back to ruleId for unknown rules', () => {
    const projects = [
      makeProject({ progress: { findings_seen: { UNKNOWN_RULE: 1 } } }),
    ];
    const result = commonMistakes(projects);
    expect(result[0]!.label).toBe('UNKNOWN_RULE');
  });
});

