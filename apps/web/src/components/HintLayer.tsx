import type { HintHighlight } from '../lib/erc/types';
import type { PlacedComponent } from '../App';
import { getPinPositions, type WireConnection } from './Canvas';

interface HintLayerProps {
  highlight: HintHighlight | null;
  level: 1 | 2 | 3 | 4;
  components: PlacedComponent[];
  wires: WireConnection[];
}

function getRotatedPinWorldPos(
  comp: PlacedComponent,
  pinIndex: number
): { x: number; y: number } {
  const pins = getPinPositions(comp.partId);
  const pin = pins[pinIndex] ?? { x: 0, y: 0 };
  const rad = ((comp.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: comp.x + Math.round(pin.x * cos - pin.y * sin),
    y: comp.y + Math.round(pin.x * sin + pin.y * cos),
  };
}

export default function HintLayer({
  highlight,
  level,
  components,
  wires,
}: HintLayerProps) {
  if (!highlight) return null;

  const getComp = (id: string) => components.find((c) => c.id === id);

  // Compute ghost slot position: prefer midpoint of target wire if available
  const renderGhostSlot = () => {
    if (level < 3 || !highlight.ghost) return null;

    let gx: number | null = null;
    let gy: number | null = null;

    if (highlight.ghost.onWire) {
      const targetWire = wires.find((w) => w.id === highlight.ghost!.onWire);
      if (targetWire) {
        const fromComp = getComp(targetWire.fromId);
        const toComp = getComp(targetWire.toId);
        if (fromComp && toComp) {
          const p1 = getRotatedPinWorldPos(fromComp, targetWire.fromPin);
          const p2 = getRotatedPinWorldPos(toComp, targetWire.toPin);
          gx = Math.round((p1.x + p2.x) / 2);
          gy = Math.round((p1.y + p2.y) / 2);
        }
      }
    }

    if (gx === null || gy === null) {
      const nearComp = getComp(highlight.ghost.nearComponentId);
      if (!nearComp) return null;
      gx = nearComp.x - 86;
      gy = nearComp.y;
    }

    const showValue = level >= 4 && Boolean(highlight.ghost.value);
    const topLabel = showValue
      ? `${highlight.ghost.category}: ${highlight.ghost.value}`
      : highlight.ghost.category;

    return (
      <g
        key="hint-ghost-slot"
        transform={`translate(${gx}, ${gy})`}
        className="hint-ghost"
      >
        {/* Subtle masked backdrop so dashed slot reads cleanly over the wire */}
        <rect
          x="-38"
          y="-14"
          width="76"
          height="28"
          rx="6"
          fill="var(--void)"
          fillOpacity="0.88"
        />
        <rect
          x="-38"
          y="-14"
          width="76"
          height="28"
          rx="6"
          fill="rgba(100, 210, 255, 0.08)"
          stroke="var(--mentor)"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
        <text
          textAnchor="middle"
          y="-20"
          fill="var(--mentor)"
          fontSize="10"
          fontWeight="500"
          fontFamily="var(--font-mono)"
        >
          {topLabel}
        </text>
        <text
          textAnchor="middle"
          y="4"
          fill="var(--mentor)"
          fontSize="11"
          fontWeight="600"
          fontFamily="var(--font-mono)"
          opacity={showValue ? 0.98 : 0.72}
        >
          {showValue ? highlight.ghost.value : '?'}
        </text>
      </g>
    );
  };

  // Compute current-path trace & gap marker for L2
  const renderNetPath = () => {
    if (level < 2 || !highlight.netPath || highlight.netPath.length === 0) {
      return null;
    }

    const pathComps = highlight.netPath
      .map(getComp)
      .filter((c): c is PlacedComponent => Boolean(c));

    if (pathComps.length === 0) return null;

    // Build orthogonal Manhattan trace between consecutive components
    let pathD = '';
    if (pathComps.length >= 2) {
      const segments: string[] = [];
      pathComps.forEach((comp, idx) => {
        if (idx === 0) {
          segments.push(`M ${comp.x} ${comp.y}`);
        } else {
          const prev = pathComps[idx - 1]!;
          const midX = Math.round((prev.x + comp.x) / 2);
          segments.push(`L ${midX} ${prev.y} L ${midX} ${comp.y} L ${comp.x} ${comp.y}`);
        }
      });
      pathD = segments.join(' ');
    }

    // Gap marker position: midpoint after `gapAfter` component if there's a next component, else near gapAfter pin
    let gapPos: { x: number; y: number } | null = null;
    if (highlight.gapAfter) {
      const gapIdx = pathComps.findIndex((c) => c.id === highlight.gapAfter);
      if (gapIdx !== -1 && gapIdx + 1 < pathComps.length) {
        const a = pathComps[gapIdx]!;
        const b = pathComps[gapIdx + 1]!;
        gapPos = {
          x: Math.round((a.x + b.x) / 2),
          y: Math.round((a.y + b.y) / 2),
        };
      } else {
        const gapComp = getComp(highlight.gapAfter);
        if (gapComp) {
          gapPos = { x: gapComp.x, y: gapComp.y + 26 };
        }
      }
    }

    return (
      <g key="hint-net-path">
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--mentor)"
            strokeWidth="2.5"
            strokeDasharray="7 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.72"
            className="hint-path-animate"
          />
        )}
        {gapPos && (
          <g
            transform={`translate(${gapPos.x}, ${gapPos.y})`}
            className="hint-gap-marker"
          >
            <circle
              r="11"
              fill="var(--base)"
              stroke="var(--warning)"
              strokeWidth="1.75"
              strokeDasharray="3 2"
            />
            <text
              textAnchor="middle"
              y="4"
              fill="var(--warning)"
              fontSize="11"
              fontWeight="700"
              fontFamily="var(--font-mono)"
            >
              !
            </text>
          </g>
        )}
      </g>
    );
  };

  // Pin highlights (shown at L1 for single-pin issues, or L3+ for pin inspection)
  const renderPinHighlights = () => {
    if (!highlight.pins || highlight.pins.length === 0) return null;
    return highlight.pins.map((pinKey) => {
      const [compId, pinStr] = pinKey.split(':');
      if (!compId || pinStr === undefined) return null;
      const comp = getComp(compId);
      if (!comp) return null;
      const pos = getRotatedPinWorldPos(comp, Number(pinStr));
      return (
        <g
          key={`hint-pin-${pinKey}`}
          transform={`translate(${pos.x}, ${pos.y})`}
          className="hint-pin-ring"
        >
          <circle
            r="9"
            fill="rgba(100, 210, 255, 0.14)"
            stroke="var(--mentor)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        </g>
      );
    });
  };

  return (
    <g className="hint-layer" style={{ pointerEvents: 'none' }}>
      {/* L1+ : Subtle pulsing ring around relevant component region */}
      {highlight.components?.map((compId) => {
        const comp = getComp(compId);
        if (!comp) return null;
        return (
          <g
            key={`hint-ring-${compId}`}
            transform={`translate(${comp.x}, ${comp.y})`}
          >
            <circle
              r="36"
              fill="rgba(100, 210, 255, 0.04)"
              stroke="var(--mentor)"
              strokeWidth="1.75"
              strokeDasharray="5 4"
              opacity="0.82"
              className="hint-ring"
            />
            <circle
              r="44"
              fill="none"
              stroke="var(--mentor)"
              strokeWidth="1"
              strokeDasharray="3 6"
              opacity="0.32"
              className="hint-ring-outer"
            />
          </g>
        );
      })}

      {/* L2: Animated dash path + pulsing gap marker */}
      {renderNetPath()}

      {/* Pin-level highlights */}
      {renderPinHighlights()}

      {/* L3 / L4: Ghost slot on wire or near component */}
      {renderGhostSlot()}
    </g>
  );
}

