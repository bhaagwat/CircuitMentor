/**
 * Static 2-minute concept cards for CircuitMentor.
 * Shown when clicking "Mentor noticed" or browsing foundational electronics principles.
 */

export interface ConceptCard {
  ruleId: string;
  title: string;
  summary: string;
  explanation: string;
  formula?: string;
  takeaway: string;
}

export const CONCEPTS: Record<string, ConceptCard> = {
  LED_NO_RESISTOR: {
    ruleId: 'LED_NO_RESISTOR',
    title: 'Why LEDs Require Current-Limiting Resistors',
    summary: 'A semiconductor diode does not self-regulate current; without a series resistor it burns out in milliseconds.',
    explanation:
      'Unlike a regular light bulb whose resistance increases as it warms up, a light emitting diode has an exponential I-V curve. Once the applied voltage exceeds its forward threshold (typically ~2.0V for red LEDs), internal resistance drops near zero. Connecting an LED directly to a 9V source attempts to draw tens of amperes, instantly damaging the junction.',
    formula: 'R = (V_supply - V_forward) / I_target  →  (9V - 2.0V) / 0.02A = 350 Ω (use 330 Ω or 470 Ω standard)',
    takeaway: 'Always place a resistor in series anywhere in the loop feeding an LED to safely limit current to ~20 mA.',
  },

  VCC_GND_SHORT: {
    ruleId: 'VCC_GND_SHORT',
    title: 'Ohm’s Law and Direct Rail Short Circuits',
    summary: 'Bridging positive voltage directly to Ground creates uncontrollable current surge and heat.',
    explanation:
      "According to Ohm's Law (I = V / R), current is inversely proportional to resistance. A plain copper wire has nearly 0 Ω of resistance. If a wire bridges VCC directly to GND with no component load in between, the circuit tries to draw infinite current. In real circuits, this causes batteries to rapidly overheat, traces to melt, or safety fuses to blow.",
    formula: 'I = V / R  →  as R → 0, I → ∞ (limited only by internal battery resistance)',
    takeaway: 'Every closed circuit path from power (+) to Ground (−) must pass through a resistive load or component.',
  },

  LED_REVERSED: {
    ruleId: 'LED_REVERSED',
    title: 'Diode Polarity & Forward Bias',
    summary: 'Diodes are one-way electrical valves; reverse orientation completely blocks current.',
    explanation:
      'A diode is built from a p-n semiconductor junction. When positive voltage is applied to the anode (+) and negative to the cathode (−), the diode is "forward biased" and electrons flow freely. If reversed, the depletion zone expands, presenting massive resistance and blocking all current flow. The LED will never turn on.',
    formula: 'Anode (+) → higher voltage; Cathode (−) → lower voltage / Ground',
    takeaway: 'Wire the anode (triangle base / longer lead) toward +VCC, and cathode (flat bar / shorter lead) toward GND.',
  },

  NO_GROUND_PATH: {
    ruleId: 'NO_GROUND_PATH',
    title: 'Closed Loops and Circuit Ground',
    summary: 'Electric current cannot flow without a continuous return path to its source.',
    explanation:
      "Kirchhoff's Current Law establishes that charge cannot accumulate infinitely at any point; every milliampere that leaves the positive battery terminal must return to the negative terminal. Ground (0V) serves as the common return reference for all active signals and power rails.",
    formula: '∑ I_in = ∑ I_out (every outgoing charge must return)',
    takeaway: 'Ensure the negative terminal of your power supply connects cleanly to circuit Ground and all load returns.',
  },

  SHORTED_COMPONENT: {
    ruleId: 'SHORTED_COMPONENT',
    title: 'Component Terminal Shorting',
    summary: 'Connecting both pins of a part to the same electrical node completely bypasses it.',
    explanation:
      'Current always follows the path of least resistance. If a wire or jumper directly connects terminal 1 to terminal 2 of a resistor or load, virtually 100% of the current flows through the copper wire rather than through the component, rendering the component completely inert.',
    takeaway: 'Components must bridge between two distinct electrical nets to perform work or drop voltage.',
  },
};

export function getConceptByRule(ruleId: string): ConceptCard | undefined {
  return CONCEPTS[ruleId];
}

