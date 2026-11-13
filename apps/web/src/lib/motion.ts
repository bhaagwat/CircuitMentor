/**
 * Motion & Animation Presets for CircuitMentor
 * Apple HIG inspired curve [0.22, 1, 0.36, 1]
 */

export const ease = [0.22, 1, 0.36, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease,
    },
  },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      duration: 0.3,
      ease,
    },
  },
};

export const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

export const cardHover = {
  rest: { y: 0, transition: { duration: 0.2, ease } },
  hover: { y: -2, transition: { duration: 0.2, ease } },
};

export const buttonTap = {
  scale: 0.97,
  transition: { duration: 0.1, ease },
};

