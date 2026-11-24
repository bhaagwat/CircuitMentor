/**
 * Dashboard Mock Data & Types for CircuitMentor
 * Behind useDashboardData() hook for easy API switching later
 */

export interface ActivityPoint {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  ercChecks: number;
  netsSolved: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  pct: number;
  description: string;
}

export interface HeatCell {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0-6 (Sun-Sat)
  weekIndex: number;
  count: number; // intensity
}

export interface IssueStat {
  rule: string;
  count: number;
  key: string;
  fill: string;
  percentage: number;
}

export interface SparklinePoint {
  value: number;
}

export interface DashboardData {
  activity: ActivityPoint[];
  funnel: FunnelStep[];
  heatmap: HeatCell[];
  issueStats: IssueStat[];
  sparklines: {
    circuits: SparklinePoint[];
    clean: SparklinePoint[];
    progress: SparklinePoint[];
    hints: SparklinePoint[];
  };
  diodeCurve: Array<{ v: string; diode_mA: number; resistor_mA: number }>;
}

export const WORKBENCH_ACTIVITY: ActivityPoint[] = [
  { day: 'Mon', ercChecks: 8, netsSolved: 18 },
  { day: 'Tue', ercChecks: 16, netsSolved: 34 },
  { day: 'Wed', ercChecks: 12, netsSolved: 26 },
  { day: 'Thu', ercChecks: 24, netsSolved: 52 },
  { day: 'Fri', ercChecks: 19, netsSolved: 41 },
  { day: 'Sat', ercChecks: 31, netsSolved: 68 },
  { day: 'Sun', ercChecks: 38, netsSolved: 84 },
];

export const ERC_RULE_FREQUENCIES: IssueStat[] = [
  { rule: 'Resistor Missing', count: 42, key: 'LED_NO_RESISTOR', fill: '#FF9F0A', percentage: 42 },
  { rule: 'VCC/GND Short', count: 28, key: 'SHORT_VCC_GND', fill: '#FF453A', percentage: 28 },
  { rule: 'Reversed Polarity', count: 16, key: 'REVERSED_DIODE', fill: '#64D2FF', percentage: 16 },
  { rule: 'Floating Net', count: 10, key: 'FLOATING_NET', fill: '#86868B', percentage: 10 },
  { rule: 'Parallel Overload', count: 4, key: 'PARALLEL_CURRENTS', fill: '#0071E3', percentage: 4 },
];

export const DIODE_PHYSICS_CURVE = [
  { v: '0.0V', diode_mA: 0, resistor_mA: 0 },
  { v: '0.5V', diode_mA: 0.05, resistor_mA: 1.5 },
  { v: '1.0V', diode_mA: 0.2, resistor_mA: 3.0 },
  { v: '1.5V', diode_mA: 0.9, resistor_mA: 4.5 },
  { v: '1.8V', diode_mA: 3.2, resistor_mA: 5.4 },
  { v: '2.0V', diode_mA: 12.0, resistor_mA: 6.0 },
  { v: '2.2V', diode_mA: 42.0, resistor_mA: 6.6 },
  { v: '2.5V', diode_mA: 120.0, resistor_mA: 7.5 },
];

export const LEARNING_FUNNEL: FunnelStep[] = [
  { step: 'Place Parts', count: 148, pct: 100, description: 'Added components to canvas' },
  { step: 'Route Nets', count: 112, pct: 75, description: 'Wired pins and terminals' },
  { step: 'ERC Clean', count: 76, pct: 51, description: 'Resolved shorts & hazards' },
  { step: 'DC Simulate', count: 54, pct: 36, description: 'Validated currents & voltages' },
  { step: 'Lab Mastery', count: 38, pct: 25, description: 'Completed milestone goals' },
];

// Generate 4 weeks (28 days) of realistic activity heatmap
export const generateWeeklyHeatmap = (): HeatCell[] => {
  const cells: HeatCell[] = [];
  const baseCounts = [
    2, 5, 8, 4, 11, 14, 9,
    1, 4, 7, 12, 18, 15, 6,
    0, 6, 9, 15, 21, 25, 12,
    3, 8, 14, 22, 28, 34, 19
  ];
  const now = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!;
    const dayOfWeek = d.getDay();
    const weekIndex = Math.floor((27 - i) / 7);
    const countIndex = 27 - i;
    cells.push({
      date: dateStr,
      dayOfWeek,
      weekIndex,
      count: baseCounts[countIndex] ?? 0,
    });
  }
  return cells;
};

export const MOCK_SPARKLINES = {
  circuits: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 3 }, { value: 4 }, { value: 6 }, { value: 7 }],
  clean: [{ value: 0 }, { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }, { value: 6 }],
  progress: [{ value: 0 }, { value: 1 }, { value: 1 }, { value: 2 }, { value: 2 }, { value: 3 }, { value: 4 }],
  hints: [{ value: 2.4 }, { value: 2.1 }, { value: 1.8 }, { value: 1.5 }, { value: 1.1 }, { value: 0.8 }, { value: 0.5 }],
};

export function useDashboardData(): DashboardData {
  return {
    activity: WORKBENCH_ACTIVITY,
    funnel: LEARNING_FUNNEL,
    heatmap: generateWeeklyHeatmap(),
    issueStats: ERC_RULE_FREQUENCIES,
    sparklines: MOCK_SPARKLINES,
    diodeCurve: DIODE_PHYSICS_CURVE,
  };
}

