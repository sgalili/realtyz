type WelcomeIconProps = { className?: string; strokeWidth?: number };

/** Simple home: triangle roof over an open-front body, drawn inside a 6x6 box. */
const HOME_PATH = 'M1 3.1 3 1.15 5 3.1M1.7 3.1v2h2.6v-2';

const Home = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} strokeWidth={0.72}>
    <path d={HOME_PATH} />
  </g>
);

/** Three linked boxes, each holding a small home — used behind slide 1. */
export const NetworkHomes = ({ className, strokeWidth = 2 }: WelcomeIconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
    <path d="M12 12V8" />
    <Home x={9} y={2} />
    <Home x={2} y={16} />
    <Home x={16} y={16} />
  </svg>
);

/** Two coins: percent sign in the front coin, Israeli shekel sign in the back one. */
export const CoinsCurrency = ({ className, strokeWidth = 2 }: WelcomeIconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <circle cx="8" cy="8" r="6" />
    <g strokeWidth={0.75}>
      <path d="M5.4 10.6 10.6 5.4" />
      <circle cx="6.3" cy="6.5" r="1.25" />
      <circle cx="9.7" cy="9.5" r="1.25" />
      <path d="M13.2 18.8v-5.6h2.1a1.4 1.4 0 0 1 1.4 1.4v2.8M15.3 14.6v4.2h2.1a1.4 1.4 0 0 0 1.4-1.4v-4.2" />
    </g>
  </svg>
);

/**
 * Israeli shekel sign, single-stroke: left upright with its arm arcing down to the
 * right, right upright with its arm arcing up to the left. Traced from the real
 * ₪ outline, drawn centered on the origin at 3.4 units tall.
 */
const SHEKEL_PATH = 'M-1.39 1.7V-1.52H-.43Q.21 -1.52 .52 -.38V.44M1.39 -1.7V1.52H.43Q-.14 1.52 -.52 .38V-.44';

const Shekel = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y}) scale(.95)`} strokeWidth={0.55}>
    <path d={SHEKEL_PATH} />
  </g>
);

/** Three linked nodes, each holding an Israeli shekel sign — used behind slide 3. */
export const ShareShekels = ({ className, strokeWidth = 2 }: WelcomeIconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49" />
    <Shekel x={18} y={5} />
    <Shekel x={6} y={12} />
    <Shekel x={18} y={19} />
  </svg>
);
