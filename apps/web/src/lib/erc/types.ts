/**
 * Hint & Finding types for the visual Socratic mentor system.
 * Purely presentational — zero writes to circuit state.
 */

export type HintHighlight = {
  /** Component IDs to subtly pulse-ring on the canvas */
  components?: string[];
  /** Pin keys (`${compId}:${pinIndex}`) to highlight */
  pins?: string[];
  /** Ordered component IDs forming the current path to trace (L2) */
  netPath?: string[];
  /** Component ID or wire ID where the path has a gap / issue (L2 gap marker) */
  gapAfter?: string;
  /** Subtle dashed ghost slot on a wire or near a component (L3 = category, L4 = value) */
  ghost?: {
    onWire?: string;
    nearComponentId: string;
    category: string;
    value?: string;
  };
};

export type Hint = {
  level: 1 | 2 | 3 | 4; // 4 = Reveal
  text: string;
  highlight: HintHighlight;
};

export interface ErcFindingWithHints {
  id: string;
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  anchorId: string;
  componentIds?: string[];
  hints: Hint[];
}

