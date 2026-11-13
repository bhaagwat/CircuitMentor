/**
 * Pure TypeScript Orthogonal Schematic Wire Auto-Router.
 * Routes wires around component bounding boxes with exit stubs,
 * bend minimization, and parallel-lane separation.
 */

import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';

export interface Point {
  x: number;
  y: number;
}

export interface RoutedWire {
  wireId: string;
  points: Point[];
  corners: Point[];
  dPath: string;
}

export const GRID_STEP = 10;

export function getPinLocalPositions(partId: string): Point[] {
  switch (partId) {
    case 'resistor.axial':
      return [{ x: -30, y: 0 }, { x: 30, y: 0 }];
    case 'led.5mm.red':
      return [{ x: -20, y: 0 }, { x: 24, y: 0 }];
    case 'capacitor.ceramic':
      return [{ x: -20, y: 0 }, { x: 20, y: 0 }];
    case 'battery.9v':
      return [{ x: 0, y: -20 }, { x: 0, y: 20 }];
    case 'battery.3v':
      return [{ x: 0, y: -16 }, { x: 0, y: 16 }];
    case 'ground':
      return [{ x: 0, y: -12 }];
    case 'junction':
      return [{ x: 0, y: 0 }];
    case 'diode.1n4007':
      return [{ x: -20, y: 0 }, { x: 20, y: 0 }];
    case 'pushbutton':
      return [{ x: -20, y: 4 }, { x: 20, y: 4 }];
    case 'potentiometer':
      return [{ x: -20, y: 4 }, { x: 0, y: -14 }, { x: 20, y: 4 }];
    case 'switch.spst':
      return [{ x: -20, y: 4 }, { x: 20, y: 4 }];
    case 'transistor.npn':
      return [{ x: -16, y: 0 }, { x: 10, y: -12 }, { x: 10, y: 12 }];
    case 'motor.dc':
      return [{ x: 0, y: -20 }, { x: 0, y: 20 }];
    case 'servo':
      return [{ x: -18, y: 0 }, { x: 0, y: 12 }, { x: 18, y: 0 }];
    case 'sensor.ultrasonic':
      return [{ x: -18, y: 14 }, { x: -6, y: 14 }, { x: 6, y: 14 }, { x: 18, y: 14 }];
    case 'arduino.uno':
      return [{ x: -32, y: -12 }, { x: -32, y: 12 }, { x: 32, y: -12 }, { x: 32, y: 12 }];
    default:
      return [{ x: -20, y: 0 }, { x: 20, y: 0 }];
  }
}

export function computeRotatedPinWorld(comp: PlacedComponent, pinIdx: number): Point {
  const pins = getPinLocalPositions(comp.partId);
  const pin = pins[pinIdx] ?? { x: 0, y: 0 };
  const rad = ((comp.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: comp.x + Math.round(pin.x * cos - pin.y * sin),
    y: comp.y + Math.round(pin.x * sin + pin.y * cos),
  };
}

function getComponentBox(comp: PlacedComponent): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (comp.partId === 'junction') return null;

  let hw = 24;
  let hh = 18;
  switch (comp.partId) {
    case 'arduino.uno':
      hw = 32;
      hh = 24;
      break;
    case 'breadboard.small':
      hw = 34;
      hh = 18;
      break;
    case 'sensor.ultrasonic':
      hw = 24;
      hh = 14;
      break;
    case 'ground':
      hw = 14;
      hh = 10;
      break;
    case 'battery.9v':
    case 'battery.3v':
      hw = 16;
      hh = 14;
      break;
    case 'led.5mm.red':
      hw = 14;
      hh = 14;
      break;
    case 'resistor.axial':
      hw = 22;
      hh = 12;
      break;
    case 'potentiometer':
      hw = 16;
      hh = 12;
      break;
  }

  const rot = (((comp.rotation || 0) % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const rx = swapped ? hh : hw;
  const ry = swapped ? hw : hh;
  return {
    minX: comp.x - rx,
    maxX: comp.x + rx,
    minY: comp.y - ry,
    maxY: comp.y + ry,
  };
}

function snapToGrid(val: number): number {
  return Math.round(val / GRID_STEP) * GRID_STEP;
}

function getPinExitPoint(comp: PlacedComponent, pinPos: Point): Point {
  if (comp.partId === 'junction') {
    return { x: snapToGrid(pinPos.x), y: snapToGrid(pinPos.y) };
  }
  const dx = pinPos.x - comp.x;
  const dy = pinPos.y - comp.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const dirX = dx >= 0 ? 1 : -1;
    return {
      x: snapToGrid(pinPos.x + dirX * GRID_STEP),
      y: snapToGrid(pinPos.y),
    };
  }
  const dirY = dy >= 0 ? 1 : -1;
  return {
    x: snapToGrid(pinPos.x),
    y: snapToGrid(pinPos.y + dirY * GRID_STEP),
  };
}

function simplifyOrthogonalPoints(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const deduped: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1]!;
    const curr = pts[i]!;
    if (prev.x !== curr.x || prev.y !== curr.y) {
      deduped.push(curr);
    }
  }
  if (deduped.length <= 2) return deduped;

  const result: Point[] = [deduped[0]!];
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = result[result.length - 1]!;
    const b = deduped[i]!;
    const c = deduped[i + 1]!;
    const collinearX = a.x === b.x && b.x === c.x;
    const collinearY = a.y === b.y && b.y === c.y;
    if (!collinearX && !collinearY) {
      result.push(b);
    }
  }
  result.push(deduped[deduped.length - 1]!);
  return result;
}

function pointsToSvgPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
}

function segmentKey(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 < x2 || (x1 === x2 && y1 <= y2)) {
    return `${x1},${y1}-${x2},${y2}`;
  }
  return `${x2},${y2}-${x1},${y1}`;
}

interface CachedWireRoute {
  key: string;
  routed: RoutedWire;
  routedGrid: Point[] | null;
}

const wireRouteCache = new Map<string, CachedWireRoute>();

export function clearWireRouteCache() {
  wireRouteCache.clear();
}

export function routeAllWires(
  components: PlacedComponent[],
  wires: WireConnection[],
  autoRoute: boolean = true
): RoutedWire[] {
  const compMap = new Map(components.map((c) => [c.id, c]));

  if (!autoRoute) {
    return wires
      .map((wire) => {
        const fromComp = compMap.get(wire.fromId);
        const toComp = compMap.get(wire.toId);
        if (!fromComp || !toComp) return null;
        const p1 = computeRotatedPinWorld(fromComp, wire.fromPin);
        const p2 = computeRotatedPinWorld(toComp, wire.toPin);
        const midX = Math.round((p1.x + p2.x) / 2);
        const raw = [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
        const points = simplifyOrthogonalPoints(raw);
        return {
          wireId: wire.id,
          points,
          corners: points.slice(1, -1),
          dPath: pointsToSvgPath(points),
        };
      })
      .filter((r): r is RoutedWire => r !== null);
  }

  // Collect obstacle boxes for all non-junction components
  const boxes = components
    .map((c) => ({ id: c.id, box: getComponentBox(c) }))
    .filter((entry): entry is { id: string; box: NonNullable<ReturnType<typeof getComponentBox>> } => entry.box !== null);

  // Track occupied grid segments and occupied grid nodes across routed wires
  const occupiedSegments = new Set<string>();
  const occupiedNodes = new Set<string>();

  // Bounding box of workspace for clamped A*
  let worldMinX = Infinity;
  let worldMinY = Infinity;
  let worldMaxX = -Infinity;
  let worldMaxY = -Infinity;
  for (const c of components) {
    worldMinX = Math.min(worldMinX, c.x - 100);
    worldMinY = Math.min(worldMinY, c.y - 100);
    worldMaxX = Math.max(worldMaxX, c.x + 100);
    worldMaxY = Math.max(worldMaxY, c.y + 100);
  }
  if (!Number.isFinite(worldMinX)) {
    return [];
  }
  const boundMinX = snapToGrid(worldMinX) - 60;
  const boundMinY = snapToGrid(worldMinY) - 60;
  const boundMaxX = snapToGrid(worldMaxX) + 60;
  const boundMaxY = snapToGrid(worldMaxY) + 60;

  // Precompute grid cell obstacle cost
  const isInsideObstacle = (gx: number, gy: number): boolean => {
    for (const { box } of boxes) {
      if (gx >= box.minX && gx <= box.maxX && gy >= box.minY && gy <= box.maxY) {
        return true;
      }
    }
    return false;
  };

  const results: RoutedWire[] = [];

  for (let wIdx = 0; wIdx < wires.length; wIdx++) {
    const wire = wires[wIdx]!;
    const fromComp = compMap.get(wire.fromId);
    const toComp = compMap.get(wire.toId);
    if (!fromComp || !toComp) continue;

    const pStart = computeRotatedPinWorld(fromComp, wire.fromPin);
    const pEnd = computeRotatedPinWorld(toComp, wire.toPin);

    const exitStart = getPinExitPoint(fromComp, pStart);
    const exitEnd = getPinExitPoint(toComp, pEnd);

    // Constrain A* corridor tightly around start and end points
    const CORRIDOR_PADDING = 120;
    const wireMinX = Math.max(boundMinX, Math.min(exitStart.x, exitEnd.x) - CORRIDOR_PADDING);
    const wireMinY = Math.max(boundMinY, Math.min(exitStart.y, exitEnd.y) - CORRIDOR_PADDING);
    const wireMaxX = Math.min(boundMaxX, Math.max(exitStart.x, exitEnd.x) + CORRIDOR_PADDING);
    const wireMaxY = Math.min(boundMaxY, Math.max(exitStart.y, exitEnd.y) + CORRIDOR_PADDING);

    // Compute localized obstacle signature within the wire corridor
    const localObstacles = boxes
      .filter(
        ({ box }) =>
          box.maxX >= wireMinX &&
          box.minX <= wireMaxX &&
          box.maxY >= wireMinY &&
          box.minY <= wireMaxY
      )
      .map(({ id, box }) => `${id}:${box.minX},${box.minY}`)
      .sort()
      .join('|');

    const cacheKey = `${wire.id}:${fromComp.id}@${fromComp.x},${fromComp.y},${fromComp.rotation}:${wire.fromPin}->${toComp.id}@${toComp.x},${toComp.y},${toComp.rotation}:${wire.toPin}[${localObstacles}]`;

    const cached = wireRouteCache.get(wire.id);
    if (cached && cached.key === cacheKey) {
      // Re-register segments to maintain lane separation
      if (cached.routedGrid && cached.routedGrid.length > 1) {
        for (let i = 0; i < cached.routedGrid.length - 1; i++) {
          const a = cached.routedGrid[i]!;
          const b = cached.routedGrid[i + 1]!;
          occupiedSegments.add(segmentKey(a.x, a.y, b.x, b.y));
          if (i > 0) {
            occupiedNodes.add(`${a.x},${a.y}`);
          }
        }
      }
      results.push(cached.routed);
      continue;
    }

    // Run compact orthogonal A* between exitStart and exitEnd inside the corridor
    const routedGrid = findOrthogonalPath(
      exitStart,
      exitEnd,
      wireMinX,
      wireMinY,
      wireMaxX,
      wireMaxY,
      isInsideObstacle,
      occupiedSegments,
      occupiedNodes
    );

    const fullRaw: Point[] = [pStart];
    if (routedGrid && routedGrid.length > 0) {
      fullRaw.push(...routedGrid);
    } else {
      // Fallback: obstacle-clear midX/midY lane offset
      const laneOffset = ((wIdx % 5) - 2) * GRID_STEP;
      const midX = snapToGrid((exitStart.x + exitEnd.x) / 2) + laneOffset;
      fullRaw.push(exitStart, { x: midX, y: exitStart.y }, { x: midX, y: exitEnd.y }, exitEnd);
    }
    fullRaw.push(pEnd);

    const points = simplifyOrthogonalPoints(fullRaw);

    // Record interior routed grid segments so subsequent wires pick separate lanes
    if (routedGrid && routedGrid.length > 1) {
      for (let i = 0; i < routedGrid.length - 1; i++) {
        const a = routedGrid[i]!;
        const b = routedGrid[i + 1]!;
        occupiedSegments.add(segmentKey(a.x, a.y, b.x, b.y));
        if (i > 0) {
          occupiedNodes.add(`${a.x},${a.y}`);
        }
      }
    }

    const routedWire: RoutedWire = {
      wireId: wire.id,
      points,
      corners: points.slice(1, -1),
      dPath: pointsToSvgPath(points),
    };

    // Cache the newly computed route
    wireRouteCache.set(wire.id, {
      key: cacheKey,
      routed: routedWire,
      routedGrid,
    });
    if (wireRouteCache.size > 250) {
      const firstKey = wireRouteCache.keys().next().value;
      if (firstKey) wireRouteCache.delete(firstKey);
    }

    results.push(routedWire);
  }

  return results;
}

const DIRS = [
  { dx: GRID_STEP, dy: 0, dir: 0 },
  { dx: -GRID_STEP, dy: 0, dir: 1 },
  { dx: 0, dy: GRID_STEP, dir: 2 },
  { dx: 0, dy: -GRID_STEP, dir: 3 },
];

function findOrthogonalPath(
  start: Point,
  goal: Point,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  isObstacle: (x: number, y: number) => boolean,
  occupiedSegments: Set<string>,
  occupiedNodes: Set<string>
): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) {
    return [start];
  }

  // State key: x,y,dir
  interface Node {
    x: number;
    y: number;
    dir: number; // -1 at start
    g: number;
    f: number;
    parentIdx: number;
  }

  const heap: number[] = [];
  const nodes: Node[] = [];
  const bestG = new Map<string, number>();

  const pushHeap = (idx: number) => {
    heap.push(idx);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (nodes[heap[p]!]!.f <= nodes[heap[i]!]!.f) break;
      const tmp = heap[p]!;
      heap[p] = heap[i]!;
      heap[i] = tmp;
      i = p;
    }
  };

  const popHeap = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      const n = heap.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && nodes[heap[l]!]!.f < nodes[heap[smallest]!]!.f) smallest = l;
        if (r < n && nodes[heap[r]!]!.f < nodes[heap[smallest]!]!.f) smallest = r;
        if (smallest === i) break;
        const tmp = heap[i]!;
        heap[i] = heap[smallest]!;
        heap[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  };

  const h = (x: number, y: number) => Math.abs(goal.x - x) + Math.abs(goal.y - y);

  nodes.push({ x: start.x, y: start.y, dir: -1, g: 0, f: h(start.x, start.y), parentIdx: -1 });
  pushHeap(0);
  bestG.set(`${start.x},${start.y},-1`, 0);

  let expansions = 0;
  const MAX_EXPANSIONS = 3500;

  while (heap.length > 0 && expansions < MAX_EXPANSIONS) {
    const curIdx = popHeap();
    const cur = nodes[curIdx]!;
    expansions++;

    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Point[] = [];
      let trace = curIdx;
      while (trace !== -1) {
        const n = nodes[trace]!;
        path.push({ x: n.x, y: n.y });
        trace = n.parentIdx;
      }
      path.reverse();
      return path;
    }

    const curKey = `${cur.x},${cur.y},${cur.dir}`;
    if ((bestG.get(curKey) ?? Infinity) < cur.g) continue;

    for (const d of DIRS) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;

      let stepCost = GRID_STEP;
      // Turn penalty favors minimum-bend schematics
      if (cur.dir !== -1 && cur.dir !== d.dir) {
        stepCost += 22;
      }
      // Obstacle penalty (never block goal itself)
      const atEndpoint = (nx === goal.x && ny === goal.y) || (nx === start.x && ny === start.y);
      if (!atEndpoint && isObstacle(nx, ny)) {
        stepCost += 600;
      }
      // Lane separation penalty on shared grid segments
      if (occupiedSegments.has(segmentKey(cur.x, cur.y, nx, ny))) {
        stepCost += 75;
      } else if (!atEndpoint && occupiedNodes.has(`${nx},${ny}`)) {
        stepCost += 14;
      }

      const ng = cur.g + stepCost;
      const nKey = `${nx},${ny},${d.dir}`;
      if (ng < (bestG.get(nKey) ?? Infinity)) {
        bestG.set(nKey, ng);
        const idx = nodes.length;
        nodes.push({
          x: nx,
          y: ny,
          dir: d.dir,
          g: ng,
          f: ng + h(nx, ny),
          parentIdx: curIdx,
        });
        pushHeap(idx);
      }
    }
  }

  return null;
}

export function findClosestPointOnPolyline(
  points: Point[],
  target: Point
): { point: Point; distance: number } {
  if (points.length === 0) return { point: target, distance: Infinity };
  if (points.length === 1) {
    const p = points[0]!;
    return { point: p, distance: Math.hypot(target.x - p.x, target.y - p.y) };
  }

  let bestPoint = points[0]!;
  let bestDist = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lenSq));
    }
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const dist = Math.hypot(target.x - projX, target.y - projY);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = { x: snapToGrid(projX), y: snapToGrid(projY) };
    }
  }

  return { point: bestPoint, distance: bestDist };
}

