/**
 * CircuitMentor — Learning Analytics Pure Functions
 * No React, no side effects. Fully testable with vitest.
 */
import type { ProjectData } from '../../components/Dashboard';
import { TASKS } from './tasks';

export interface KPIData {
  tasksDone: number;
  tasksTotal: 5;
  cleanCircuits: number;
  issuesFixed: number;
  avgHintsPerTask: number;
}

export interface DailyActivity {
  date: string;
  milestones: number;
  fixes: number;
  hints: number;
}

export interface ConceptMastery {
  concept: string;
  done: number;
  total: number;
  pct: number; // 0-100
}

export interface CommonMistake {
  ruleId: string;
  label: string;
  count: number;
  conceptId?: string;
}

export function kpis(projects: ProjectData[]): KPIData {
  const tasksDone = projects.filter((p) => p.progress?.completed_at).length;
  const cleanCircuits = projects.filter(
    (p) => p.findings.length === 0 && p.components.length > 0
  ).length;
  const issuesFixed = projects.reduce((acc, p) => {
    const seen = p.progress?.findings_seen || {};
    return acc + Object.values(seen).reduce((s, v) => s + (v as number), 0);
  }, 0);
  const totalHints = projects.reduce(
    (acc, p) => acc + (p.progress?.hints_used || 0),
    0
  );
  const avgHintsPerTask =
    tasksDone > 0 ? Math.round((totalHints / tasksDone) * 10) / 10 : 0;
  return { tasksDone, tasksTotal: 5, cleanCircuits, issuesFixed, avgHintsPerTask };
}

export function dailyActivity(
  projects: ProjectData[],
  days: 7 | 30
): DailyActivity[] {
  const now = Date.now();
  const msPerDay = 86400000;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now - (days - 1 - i) * msPerDay);
    const dateKey = d.toISOString().slice(0, 10);
    let milestones = 0,
      fixes = 0,
      hints = 0;
    for (const p of projects) {
      const events = (p.progress as any)?.events || [];
      for (const ev of events) {
        if (typeof ev.t === 'string' && ev.t.startsWith(dateKey)) {
          if (ev.kind === 'milestone') milestones++;
          else if (ev.kind === 'fix') fixes++;
          else if (ev.kind === 'hint') hints++;
        }
      }
    }
    const label =
      days === 7
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!
        : `${d.getMonth() + 1}/${d.getDate()}`;
    return { date: label, milestones, fixes, hints };
  });
}

export function conceptMastery(projects: ProjectData[]): ConceptMastery[] {
  const conceptMap = new Map<string, { done: number; total: number }>();
  for (const task of TASKS) {
    for (const concept of task.concepts) {
      if (!conceptMap.has(concept)) conceptMap.set(concept, { done: 0, total: 0 });
      const entry = conceptMap.get(concept)!;
      for (const p of projects) {
        if (p.taskId === task.id && p.progress?.milestones) {
          const doneMilestones = task.milestones.filter(
            (m) => p.progress!.milestones![m.id]
          ).length;
          entry.done += doneMilestones;
        }
        entry.total += task.milestones.length;
      }
    }
  }
  return Array.from(conceptMap.entries()).map(([concept, { done, total }]) => ({
    concept,
    done,
    total,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
  }));
}

const RULE_LABELS: Record<string, string> = {
  LED_NO_RESISTOR: 'LED without current limiter',
  VCC_GND_SHORT: 'VCC–GND short circuit',
  LED_REVERSED: 'Reversed LED polarity',
  NO_GROUND_PATH: 'No ground path',
  SHORTED_COMPONENT: 'Shorted component',
};

export function commonMistakes(projects: ProjectData[]): CommonMistake[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const seen = p.progress?.findings_seen || {};
    for (const [ruleId, count] of Object.entries(seen)) {
      counts.set(ruleId, (counts.get(ruleId) || 0) + (count as number));
    }
  }
  return Array.from(counts.entries())
    .map(([ruleId, count]) => ({
      ruleId,
      label: RULE_LABELS[ruleId] || ruleId,
      count,
      conceptId: ruleId.toLowerCase(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

