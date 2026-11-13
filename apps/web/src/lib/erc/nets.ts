/**
 * Union-find netlist builder for CircuitMentor ERC.
 * Pure TypeScript — no React imports.
 */

import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import { getPartMeta, type PinRole } from '../parts';

export interface NetPin {
  compId: string;
  pinIndex: number;
  pinId: string | number;
  name: string;
  role: PinRole;
  required?: boolean;
  partId: string;
}

export interface Net {
  id: string;
  pins: NetPin[];
}

export function buildNets(
  components: PlacedComponent[],
  wires: WireConnection[]
): Net[] {
  const parent = new Map<string, string>();
  const pinDetails = new Map<string, NetPin>();

  const find = (k: string): string => {
    if (!parent.has(k)) {
      parent.set(k, k);
    }
    const p = parent.get(k)!;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };

  const union = (k1: string, k2: string): void => {
    const root1 = find(k1);
    const root2 = find(k2);
    if (root1 !== root2) {
      parent.set(root1, root2);
    }
  };

  // 1. Initialize all pins from placed components into disjoint sets
  for (const comp of components) {
    const meta = getPartMeta(comp.partId);
    meta.pins.forEach((p, idx) => {
      const key = `${comp.id}.${idx}`;
      find(key);
      pinDetails.set(key, {
        compId: comp.id,
        pinIndex: idx,
        pinId: p.id,
        name: p.name,
        role: p.role,
        required: p.required,
        partId: comp.partId,
      });
    });
  }

  // 2. Union pins connected by wires
  for (const wire of wires) {
    const fromCompId = wire.fromId ?? (wire as any).from?.c;
    const fromPin = wire.fromPin ?? (wire as any).from?.pin;
    const toCompId = wire.toId ?? (wire as any).to?.c;
    const toPin = wire.toPin ?? (wire as any).to?.pin;

    if (fromCompId != null && fromPin != null && toCompId != null && toPin != null) {
      const k1 = `${fromCompId}.${fromPin}`;
      const k2 = `${toCompId}.${toPin}`;
      find(k1);
      find(k2);
      union(k1, k2);
    }
  }

  // 3. Group by root representative
  const groups = new Map<string, NetPin[]>();
  for (const key of parent.keys()) {
    const root = find(key);
    const detail = pinDetails.get(key);
    if (detail) {
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(detail);
    }
  }

  // 4. Return array of unified electrical nets
  return Array.from(groups.entries()).map(([rootId, pins]) => ({
    id: `net_${rootId}`,
    pins,
  }));
}

