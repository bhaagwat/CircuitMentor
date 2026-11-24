import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import type { PlacedComponent, ErcFinding } from '../App';
import FloatingToolbar from './FloatingToolbar';
import HintLayer from './HintLayer';
import type { HintHighlight } from '../lib/erc/types';
import { runDcSimulation, type SimulationResult } from '../lib/sim/dcSim';
import { getPartMeta } from '@/lib/parts';
import {
  routeAllWires,
  findClosestPointOnPolyline,
  computeRotatedPinWorld,
  getPinLocalPositions,
  type RoutedWire,
} from '../lib/canvas/wireRouter';

export interface WireConnection {
  id: string;
  fromId: string;
  fromPin: number;
  toId: string;
  toPin: number;
  netType: 'vcc' | 'gnd' | 'signal';
}

export interface AddWireWithJunctionsPayload {
  fromId: string;
  fromPin: number;
  fromSplit?: { wireId: string; x: number; y: number };
  toId: string;
  toPin: number;
  toSplit?: { wireId: string; x: number; y: number };
}

interface CanvasProps {
  components: PlacedComponent[];
  wires?: WireConnection[];
  selectedIds: string[];
  highlightedId: string | null;
  findings: ErcFinding[];
  selectedLibraryPart?: string | null;
  onSelectComponent: (comp: PlacedComponent, multi: boolean) => void;
  onClearSelection: () => void;
  onUpdateComponentPositions: (updates: Array<{ id: string; x: number; y: number }>) => void;
  onPlaceComponent?: (partId: string, x: number, y: number) => void;
  onAddWire?: (fromId: string, fromPin: number, toId: string, toPin: number) => void;
  onAddWireWithJunctions?: (payload: AddWireWithJunctionsPayload) => void;
  onDeleteWire?: (wireId: string) => void;
  onDeleteSelected?: () => void;
  onClearSelectedLibraryPart?: () => void;
  // Toolbar and history action triggers
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  onOpenErc?: () => void;
  activeTool?: 'select' | 'pan' | 'wire';
  onSelectTool?: (tool: 'select' | 'pan' | 'wire') => void;
  hintHighlight?: HintHighlight | null;
  hintLevel?: 1 | 2 | 3 | 4;
  // Selection & Update triggers
  selectedWireId?: string | null;
  onSelectWire?: (wireId: string | null) => void;
  onUpdateComponent?: (id: string, updates: Partial<PlacedComponent>) => void;
  // Editor settings
  gridSnap?: number;
  autoRouteWires?: boolean;
  showPinLabels?: boolean;
  showGrid?: boolean;
}

const DEFAULT_WIRES: WireConnection[] = [
  { id: 'w1', fromId: 'c1', fromPin: 0, toId: 'c2', toPin: 0, netType: 'vcc' },
  { id: 'w2', fromId: 'c2', fromPin: 1, toId: 'c3', toPin: 0, netType: 'signal' },
  { id: 'w3', fromId: 'c3', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
  { id: 'w4', fromId: 'c1', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
];

export default function Canvas({
  components,
  wires = DEFAULT_WIRES,
  selectedIds,
  highlightedId,
  findings,
  selectedLibraryPart,
  onSelectComponent,
  onClearSelection,
  onUpdateComponentPositions,
  onPlaceComponent,
  onAddWire,
  onAddWireWithJunctions,
  onDeleteWire,
  onDeleteSelected,
  onClearSelectedLibraryPart,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  isSimulating = false,
  onToggleSimulation,
  onOpenErc,
  activeTool: controlledTool,
  onSelectTool,
  hintHighlight = null,
  hintLevel = 1,
  selectedWireId: controlledWireId,
  onSelectWire,
  onUpdateComponent,
  gridSnap = 10,
  autoRouteWires = true,
  showPinLabels = true,
  showGrid = true,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 60, y: 40 });

  const handleZoomFit = useCallback(() => {
    if (components.length === 0) {
      setZoom(100);
      setPan({ x: 60, y: 40 });
      return;
    }
    const minX = Math.min(...components.map((c) => c.x - 40));
    const maxX = Math.max(...components.map((c) => c.x + 40));
    const minY = Math.min(...components.map((c) => c.y - 40));
    const maxY = Math.max(...components.map((c) => c.y + 40));

    const w = maxX - minX;
    const h = maxY - minY;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 120) / Math.max(w, 200);
    const scaleY = (rect.height - 120) / Math.max(h, 200);
    const fitScale = Math.max(0.3, Math.min(2.5, Math.min(scaleX, scaleY)));
    setZoom(Math.round(fitScale * 100));
    setPan({
      x: Math.round((rect.width - (minX + maxX) * fitScale) / 2),
      y: Math.round((rect.height - (minY + maxY) * fitScale) / 2),
    });
  }, [components]);

  useEffect(() => {
    const onZoomFitEvent = () => handleZoomFit();
    const onZoom100Event = () => {
      setZoom(100);
      setPan({ x: 60, y: 40 });
    };
    const onZoomInEvent = () => setZoom((prev) => Math.min(400, prev + 25));
    const onZoomOutEvent = () => setZoom((prev) => Math.max(20, prev - 25));
    window.addEventListener('cm-zoom-fit', onZoomFitEvent);
    window.addEventListener('cm-zoom-100', onZoom100Event);
    window.addEventListener('cm-zoom-in', onZoomInEvent);
    window.addEventListener('cm-zoom-out', onZoomOutEvent);
    return () => {
      window.removeEventListener('cm-zoom-fit', onZoomFitEvent);
      window.removeEventListener('cm-zoom-100', onZoom100Event);
      window.removeEventListener('cm-zoom-in', onZoomInEvent);
      window.removeEventListener('cm-zoom-out', onZoomOutEvent);
    };
  }, [handleZoomFit]);

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [localTool, setLocalTool] = useState<'select' | 'pan' | 'wire'>('select');
  const activeTool = controlledTool !== undefined ? controlledTool : localTool;
  const handleSelectTool = useCallback(
    (tool: 'select' | 'pan' | 'wire') => {
      setLocalTool(tool);
      onSelectTool?.(tool);
    },
    [onSelectTool]
  );
  const [localWireId, setLocalWireId] = useState<string | null>(null);
  const selectedWireId = controlledWireId !== undefined ? controlledWireId : localWireId;
  const setSelectedWireId = useCallback(
    (id: string | null) => {
      setLocalWireId(id);
      onSelectWire?.(id);
    },
    [onSelectWire]
  );
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!selectedLibraryPart) {
      setGhostPos(null);
    }
  }, [selectedLibraryPart]);

  // Wire drawing rubberband state
  const [drawingWire, setDrawingWire] = useState<{
    fromId: string;
    fromPin: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    pendingSplit?: { wireId: string; x: number; y: number };
  } | null>(null);

  // Wire junction snap preview when hovering existing wires in Wire mode
  const [hoveredWireSnap, setHoveredWireSnap] = useState<{
    wireId: string;
    x: number;
    y: number;
  } | null>(null);

  // Magnetic pin snap preview when drawing wire
  const [hoveredPinSnap, setHoveredPinSnap] = useState<{
    compId: string;
    pinIdx: number;
    x: number;
    y: number;
  } | null>(null);

  // Pin pointer down tracker for drag-to-connect vs click-to-connect
  const pinPointerDownPos = useRef<{
    compId: string;
    pinIdx: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const routedWires: RoutedWire[] = useMemo(
    () => routeAllWires(components, wires, autoRouteWires),
    [components, wires, autoRouteWires]
  );

  const routedWireMap = useMemo(
    () => new Map(routedWires.map((rw) => [rw.wireId, rw])),
    [routedWires]
  );

  const snapStep = Math.max(1, gridSnap);
  const snapVal = useCallback(
    (v: number) => Math.round(v / snapStep) * snapStep,
    [snapStep]
  );

  // Marquee state
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Drag ref for direct DOM manipulation during gestures (single commit on release)
  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialPositions: Map<string, { x: number; y: number; rot: number }>;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPositions: new Map(),
  });

  const panRef = useRef({ x: 0, y: 0 });
  const panStartPos = useRef({ x: 0, y: 0 });
  const scale = zoom / 100;

  // Spacebar, Backspace, and Delete keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacePressed && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        setIsSpacePressed(true);
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        if (selectedWireId) {
          e.preventDefault();
          e.stopPropagation();
          onDeleteWire?.(selectedWireId);
          setSelectedWireId(null);
        } else if (selectedIds.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          onDeleteSelected?.();
        }
      }
      if (e.key === 'Escape') {
        setDrawingWire(null);
        setHoveredWireSnap(null);
        setHoveredPinSnap(null);
        onClearSelectedLibraryPart?.();
        setGhostPos(null);
        onClearSelection();
        setSelectedWireId(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed, selectedWireId, selectedIds, onDeleteWire, onDeleteSelected, onClearSelectedLibraryPart, onClearSelection, setSelectedWireId]);

  // Two-Finger Trackpad Pan OR Cursor-Centered Wheel Zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      if (e.ctrlKey || e.metaKey) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - pan.x) / scale;
        const worldY = (mouseY - pan.y) / scale;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
        const newZoom = Math.max(20, Math.min(400, Math.round(zoom * zoomFactor)));
        const newScale = newZoom / 100;

        const newPanX = mouseX - worldX * newScale;
        const newPanY = mouseY - worldY * newScale;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      } else {
        setPan((prev) => ({
          x: Math.round(prev.x - e.deltaX),
          y: Math.round(prev.y - e.deltaY),
        }));
      }
    },
    [pan, scale, zoom]
  );

  // Background Pointer Down: Pan, Marquee, or Place Component
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('.canvas-toolbar-pill, .canvas-sim-readout')) {
        return;
      }

      // If actively drawing a wire
      if (drawingWire) {
        if (hoveredPinSnap) {
          onAddWire?.(drawingWire.fromId, drawingWire.fromPin, hoveredPinSnap.compId, hoveredPinSnap.pinIdx);
          setDrawingWire(null);
          setHoveredPinSnap(null);
          setHoveredWireSnap(null);
          return;
        }
        if (hoveredWireSnap) {
          onAddWireWithJunctions?.({
            fromId: drawingWire.fromId,
            fromPin: drawingWire.fromPin,
            fromSplit: drawingWire.pendingSplit,
            toId: '__SPLIT__',
            toPin: 0,
            toSplit: { wireId: hoveredWireSnap.wireId, x: hoveredWireSnap.x, y: hoveredWireSnap.y },
          });
          setDrawingWire(null);
          setHoveredPinSnap(null);
          setHoveredWireSnap(null);
          return;
        }
        setDrawingWire(null);
        setHoveredPinSnap(null);
        setHoveredWireSnap(null);
        return;
      }

      // Middle-mouse drag OR Space+drag OR touch drag OR activeTool === 'pan'
      if (
        e.button === 1 ||
        (e.button === 0 && (isSpacePressed || activeTool === 'pan')) ||
        e.pointerType === 'touch'
      ) {
        setIsPanning(true);
        panRef.current = { x: e.clientX, y: e.clientY };
        panStartPos.current = { x: e.clientX, y: e.clientY };
        try {
          containerRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      // Left click on empty canvas
      if (e.button === 0) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / scale;
        const canvasY = (e.clientY - rect.top - pan.y) / scale;

        // 1. Click-to-place selected library part
        if (selectedLibraryPart && onPlaceComponent && !isSpacePressed) {
          onPlaceComponent(selectedLibraryPart, snapVal(canvasX), snapVal(canvasY));
          onClearSelectedLibraryPart?.();
          setGhostPos(null);
          return;
        }

        // Clicking empty canvas clears both component and wire selections
        onClearSelection();
        setSelectedWireId(null);

        if (activeTool === 'pan' || isSpacePressed) {
          setIsPanning(true);
          panRef.current = { x: e.clientX, y: e.clientY };
          panStartPos.current = { x: e.clientX, y: e.clientY };
        } else if (e.shiftKey || activeTool === 'select') {
          // Direct marquee box selection in Select mode
          setMarquee({
            startX: canvasX,
            startY: canvasY,
            currentX: canvasX,
            currentY: canvasY,
          });
        }

        try {
          containerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    },
    [
      activeTool,
      drawingWire,
      hoveredPinSnap,
      hoveredWireSnap,
      isSpacePressed,
      onAddWire,
      onAddWireWithJunctions,
      onClearSelectedLibraryPart,
      onClearSelection,
      onPlaceComponent,
      pan,
      scale,
      selectedLibraryPart,
      setSelectedWireId,
      snapVal,
    ]
  );

  // Component Pointer Down: Start immediate DOM drag or place library component
  const handleComponentPointerDown = useCallback(
    (e: React.PointerEvent, comp: PlacedComponent) => {
      e.stopPropagation();

      // If library part is active, place it
      if (selectedLibraryPart && onPlaceComponent && !isSpacePressed) {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - pan.x) / scale;
          const canvasY = (e.clientY - rect.top - pan.y) / scale;
          onPlaceComponent(selectedLibraryPart, snapVal(canvasX), snapVal(canvasY));
          onClearSelectedLibraryPart?.();
          setGhostPos(null);
        }
        return;
      }

      // If drawing a wire, clicking component body shouldn't drag it
      if (drawingWire) return;

      if (isSpacePressed || e.button === 1 || activeTool === 'pan') {
        setIsPanning(true);
        panRef.current = { x: e.clientX, y: e.clientY };
        panStartPos.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) {
          try {
            containerRef.current.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }
        return;
      }

      setSelectedWireId(null);

      // Select component (if not already selected)
      if (!selectedIds.includes(comp.id)) {
        onSelectComponent(comp, e.shiftKey);
      }

      // In Wire mode, allow clicking/selecting without accidentally dragging parts
      if (activeTool === 'wire') return;

      const idsToDrag = selectedIds.includes(comp.id) ? selectedIds : [comp.id];
      const initialMap = new Map<string, { x: number; y: number; rot: number }>();
      idsToDrag.forEach((id) => {
        const c = components.find((item) => item.id === id);
        if (c) initialMap.set(id, { x: c.x, y: c.y, rot: c.rotation });
      });

      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initialPositions: initialMap,
      };

      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [activeTool, components, drawingWire, isSpacePressed, onSelectComponent, selectedIds]
  );

  // Wire Pin Click: Start or finish wire connection (supports pending wire split at origin)
  const handlePinClick = useCallback(
    (e: React.PointerEvent, comp: PlacedComponent, pinIdx: number) => {
      e.stopPropagation();
      if (selectedLibraryPart && onPlaceComponent && !isSpacePressed) {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - pan.x) / scale;
          const canvasY = (e.clientY - rect.top - pan.y) / scale;
          onPlaceComponent(selectedLibraryPart, snapVal(canvasX), snapVal(canvasY));
          onClearSelectedLibraryPart?.();
          setGhostPos(null);
        }
        return;
      }
      if (activeTool === 'pan') return;
      const { x: pinCanvasX, y: pinCanvasY } = computeRotatedPinWorld(comp, pinIdx);

      if (!drawingWire) {
        setSelectedWireId(null);
        pinPointerDownPos.current = {
          compId: comp.id,
          pinIdx,
          clientX: e.clientX,
          clientY: e.clientY,
        };
        setDrawingWire({
          fromId: comp.id,
          fromPin: pinIdx,
          startX: pinCanvasX,
          startY: pinCanvasY,
          currentX: pinCanvasX,
          currentY: pinCanvasY,
        });
      } else {
        if (drawingWire.pendingSplit) {
          onAddWireWithJunctions?.({
            fromId: drawingWire.fromId,
            fromPin: drawingWire.fromPin,
            fromSplit: drawingWire.pendingSplit,
            toId: comp.id,
            toPin: pinIdx,
          });
        } else if (drawingWire.fromId !== comp.id || drawingWire.fromPin !== pinIdx) {
          onAddWire?.(drawingWire.fromId, drawingWire.fromPin, comp.id, pinIdx);
        }
        setDrawingWire(null);
        setHoveredPinSnap(null);
        setHoveredWireSnap(null);
        pinPointerDownPos.current = null;
      }
    },
    [
      activeTool,
      drawingWire,
      isSpacePressed,
      onAddWire,
      onAddWireWithJunctions,
      onClearSelectedLibraryPart,
      onPlaceComponent,
      pan,
      scale,
      selectedLibraryPart,
      setSelectedWireId,
      snapVal,
    ]
  );

  // Wire Segment Click / PointerDown: Select wire in Select mode, or create/connect T-junction in Wire mode
  const handleWirePointerDown = useCallback(
    (e: React.PointerEvent, wireId: string) => {
      e.stopPropagation();
      if (selectedLibraryPart && onPlaceComponent && !isSpacePressed) {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - pan.x) / scale;
          const canvasY = (e.clientY - rect.top - pan.y) / scale;
          onPlaceComponent(selectedLibraryPart, snapVal(canvasX), snapVal(canvasY));
          onClearSelectedLibraryPart?.();
          setGhostPos(null);
        }
        return;
      }
      if (isSpacePressed || e.button === 1 || activeTool === 'pan') {
        setIsPanning(true);
        panRef.current = { x: e.clientX, y: e.clientY };
        panStartPos.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) {
          try {
            containerRef.current.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }
        return;
      }

      if (activeTool === 'wire' || drawingWire) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / scale;
        const canvasY = (e.clientY - rect.top - pan.y) / scale;
        const routed = routedWireMap.get(wireId);
        const snapPt = routed
          ? findClosestPointOnPolyline(routed.points, { x: canvasX, y: canvasY }).point
          : { x: snapVal(canvasX), y: snapVal(canvasY) };

        if (!drawingWire) {
          setDrawingWire({
            fromId: '__SPLIT__',
            fromPin: 0,
            startX: snapPt.x,
            startY: snapPt.y,
            currentX: snapPt.x,
            currentY: snapPt.y,
            pendingSplit: { wireId, x: snapPt.x, y: snapPt.y },
          });
        } else {
          onAddWireWithJunctions?.({
            fromId: drawingWire.fromId,
            fromPin: drawingWire.fromPin,
            fromSplit: drawingWire.pendingSplit,
            toId: '__SPLIT__',
            toPin: 0,
            toSplit: { wireId, x: snapPt.x, y: snapPt.y },
          });
          setDrawingWire(null);
          setHoveredPinSnap(null);
          setHoveredWireSnap(null);
        }
        return;
      }

      // SELECT WIRE (do not call onClearSelection which resets selectedWireId to null!)
      setSelectedWireId(wireId);
    },
    [
      activeTool,
      drawingWire,
      isSpacePressed,
      onAddWireWithJunctions,
      onClearSelectedLibraryPart,
      onPlaceComponent,
      pan,
      routedWireMap,
      scale,
      selectedLibraryPart,
      setSelectedWireId,
      snapVal,
    ]
  );

  // Unified Pointer Move (60fps DOM drag, wire rubberband, marquee, and ghost preview)
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // 1. Ghost Placement follow
      if (selectedLibraryPart && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / scale;
        const canvasY = (e.clientY - rect.top - pan.y) / scale;
        setGhostPos({ x: snapVal(canvasX), y: snapVal(canvasY) });
      }

      // 2. Viewport Panning
      if (isPanning) {
        const dx = e.clientX - panRef.current.x;
        const dy = e.clientY - panRef.current.y;
        panRef.current = { x: e.clientX, y: e.clientY };
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        return;
      }

      // 3. Rubberband Wire drawing follow + Magnetic Pin Snap + Junction Snap Hover
      if ((drawingWire || activeTool === 'wire') && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / scale;
        const canvasY = (e.clientY - rect.top - pan.y) / scale;

        // Priority 1: Magnetic Pin Snapping
        let bestPinSnap: { compId: string; pinIdx: number; x: number; y: number } | null = null;
        let minPinDist = 22;

        for (const comp of components) {
          const pinPositions = getPinLocalPositions(comp.partId);
          for (let pIdx = 0; pIdx < pinPositions.length; pIdx++) {
            if (drawingWire && comp.id === drawingWire.fromId && pIdx === drawingWire.fromPin) continue;
            const p = computeRotatedPinWorld(comp, pIdx);
            const d = Math.hypot(canvasX - p.x, canvasY - p.y);
            if (d < minPinDist) {
              minPinDist = d;
              bestPinSnap = { compId: comp.id, pinIdx: pIdx, x: p.x, y: p.y };
            }
          }
        }
        setHoveredPinSnap(bestPinSnap);

        // Priority 2: Wire T-Junction Snapping (if not snapping to pin)
        let bestSnap: { wireId: string; x: number; y: number } | null = null;
        if (!bestPinSnap) {
          let bestDist = 16;
          for (const rw of routedWires) {
            if (drawingWire?.pendingSplit?.wireId === rw.wireId) continue;
            const res = findClosestPointOnPolyline(rw.points, { x: canvasX, y: canvasY });
            if (res.distance < bestDist) {
              bestDist = res.distance;
              bestSnap = { wireId: rw.wireId, x: res.point.x, y: res.point.y };
            }
          }
        }
        setHoveredWireSnap(bestSnap);

        if (drawingWire) {
          const targetX = bestPinSnap ? bestPinSnap.x : bestSnap ? bestSnap.x : snapVal(canvasX);
          const targetY = bestPinSnap ? bestPinSnap.y : bestSnap ? bestSnap.y : snapVal(canvasY);
          setDrawingWire((prev) =>
            prev ? { ...prev, currentX: targetX, currentY: targetY } : null
          );
          return;
        }
      } else {
        if (hoveredPinSnap) setHoveredPinSnap(null);
        if (hoveredWireSnap) setHoveredWireSnap(null);
      }

      // 4. Marquee Select
      if (marquee) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / scale;
        const canvasY = (e.clientY - rect.top - pan.y) / scale;
        setMarquee((prev) => (prev ? { ...prev, currentX: canvasX, currentY: canvasY } : null));
        return;
      }

      // 5. Component Dragging (Direct DOM manipulation at 60fps, snapped to grid)
      if (dragRef.current.isDragging) {
        const dx = (e.clientX - dragRef.current.startX) / scale;
        const dy = (e.clientY - dragRef.current.startY) / scale;

        dragRef.current.initialPositions.forEach((init, id) => {
          const domElem = document.getElementById(`comp-elem-${id}`);
          if (domElem) {
            const curX = snapVal(init.x + dx);
            const curY = snapVal(init.y + dy);
            domElem.setAttribute('transform', `translate(${curX}, ${curY}) rotate(${init.rot})`);
          }
        });

        // Fast live attached wire updates at 60fps
        for (const wire of wires) {
          const fromMoved = dragRef.current.initialPositions.get(wire.fromId);
          const toMoved = dragRef.current.initialPositions.get(wire.toId);
          if (!fromMoved && !toMoved) continue;

          const fromComp = components.find((c) => c.id === wire.fromId);
          const toComp = components.find((c) => c.id === wire.toId);
          if (!fromComp || !toComp) continue;

          const p1 = computeRotatedPinWorld(
            fromMoved ? { ...fromComp, x: snapVal(fromMoved.x + dx), y: snapVal(fromMoved.y + dy) } : fromComp,
            wire.fromPin
          );
          const p2 = computeRotatedPinWorld(
            toMoved ? { ...toComp, x: snapVal(toMoved.x + dx), y: snapVal(toMoved.y + dy) } : toComp,
            wire.toPin
          );

          const midX = Math.round((p1.x + p2.x) / 2);
          const liveD = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;

          const wireGroup = document.getElementById(`wire-group-${wire.id}`);
          if (wireGroup) {
            const paths = wireGroup.querySelectorAll('path');
            paths.forEach((p) => p.setAttribute('d', liveD));
          }
        }
      }
    },
    [
      activeTool,
      components,
      drawingWire,
      hoveredWireSnap,
      isPanning,
      marquee,
      pan,
      routedWires,
      scale,
      selectedLibraryPart,
      snapVal,
      wires,
    ]
  );

  // Pointer Up: Release capture and commit final coordinates (single commit on release)
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Drag-to-connect wire completion
      if (drawingWire && pinPointerDownPos.current) {
        const dragDist = Math.hypot(
          e.clientX - pinPointerDownPos.current.clientX,
          e.clientY - pinPointerDownPos.current.clientY
        );
        if (dragDist > 10) {
          if (hoveredPinSnap) {
            onAddWire?.(
              drawingWire.fromId,
              drawingWire.fromPin,
              hoveredPinSnap.compId,
              hoveredPinSnap.pinIdx
            );
            setDrawingWire(null);
            setHoveredPinSnap(null);
            setHoveredWireSnap(null);
            pinPointerDownPos.current = null;
            return;
          } else if (hoveredWireSnap) {
            onAddWireWithJunctions?.({
              fromId: drawingWire.fromId,
              fromPin: drawingWire.fromPin,
              fromSplit: drawingWire.pendingSplit,
              toId: '__SPLIT__',
              toPin: 0,
              toSplit: { wireId: hoveredWireSnap.wireId, x: hoveredWireSnap.x, y: hoveredWireSnap.y },
            });
            setDrawingWire(null);
            setHoveredPinSnap(null);
            setHoveredWireSnap(null);
            pinPointerDownPos.current = null;
            return;
          }
        }
        pinPointerDownPos.current = null;
      }

      if (isPanning) {
        setIsPanning(false);
        const dist = Math.hypot(e.clientX - panStartPos.current.x, e.clientY - panStartPos.current.y);

        // Click-to-place: if a library part was selected and user clicks empty canvas
        if (dist < 4 && selectedLibraryPart && onPlaceComponent && !isSpacePressed && e.button === 0) {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - pan.x) / scale;
            const canvasY = (e.clientY - rect.top - pan.y) / scale;
            onPlaceComponent(selectedLibraryPart, snapVal(canvasX), snapVal(canvasY));
            onClearSelectedLibraryPart?.();
            setGhostPos(null);
          }
        } else if (dist < 4 && !isSpacePressed && e.button === 0) {
          onClearSelection();
          setSelectedWireId(null);
        }

        try {
          containerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      if (marquee) {
        const minX = Math.min(marquee.startX, marquee.currentX);
        const maxX = Math.max(marquee.startX, marquee.currentX);
        const minY = Math.min(marquee.startY, marquee.currentY);
        const maxY = Math.max(marquee.startY, marquee.currentY);

        if (maxX - minX > 6 || maxY - minY > 6) {
          const boxed = components.filter((c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY);
          boxed.forEach((b) => onSelectComponent(b, true));
        }
        setMarquee(null);
        try {
          containerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      if (dragRef.current.isDragging) {
        const dx = (e.clientX - dragRef.current.startX) / scale;
        const dy = (e.clientY - dragRef.current.startY) / scale;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          const updates: Array<{ id: string; x: number; y: number }> = [];
          dragRef.current.initialPositions.forEach((init, id) => {
            updates.push({
              id,
              x: snapVal(init.x + dx),
              y: snapVal(init.y + dy),
            });
          });
          onUpdateComponentPositions(updates);
        } else if (dragRef.current.initialPositions.size === 1) {
          // If clicked without dragging, toggle switch or pushbutton
          const clickedId = dragRef.current.initialPositions.keys().next().value;
          const comp = components.find((c) => c.id === clickedId);
          if (comp && (comp.partId === 'switch.spst' || comp.partId === 'pushbutton')) {
            const curState = (comp.params.state ?? 'closed') === 'closed' ? 'open' : 'closed';
            onUpdateComponent?.(comp.id, {
              params: { ...comp.params, state: curState },
            });
          }
        }

        dragRef.current.isDragging = false;
        try {
          containerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    },
    [
      components,
      drawingWire,
      hoveredPinSnap,
      hoveredWireSnap,
      isPanning,
      isSpacePressed,
      marquee,
      onAddWire,
      onAddWireWithJunctions,
      onClearSelectedLibraryPart,
      onClearSelection,
      onPlaceComponent,
      onSelectComponent,
      onUpdateComponent,
      onUpdateComponentPositions,
      pan,
      scale,
      selectedLibraryPart,
      setSelectedWireId,
      snapVal,
    ]
  );

  // Drag and Drop from Component Library onto Canvas
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!containerRef.current || !onPlaceComponent) return;

      const partId = e.dataTransfer.getData('text/plain');
      if (!partId) return;

      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / scale;
      const canvasY = (e.clientY - rect.top - pan.y) / scale;

      onPlaceComponent(partId, snapVal(canvasX), snapVal(canvasY));
    },
    [onPlaceComponent, pan, scale, snapVal]
  );

  const simResult: SimulationResult | null = useMemo(() => {
    if (!isSimulating) return null;
    return runDcSimulation(components, wires);
  }, [isSimulating, components, wires]);

  // Two-tier grid dot parameters
  const minorPitch = 10 * scale;
  const majorPitch = 50 * scale;

  const minorOffsetX = (((pan.x - minorPitch / 2) % minorPitch) + minorPitch) % minorPitch;
  const minorOffsetY = (((pan.y - minorPitch / 2) % minorPitch) + minorPitch) % minorPitch;

  const majorOffsetX = (((pan.x - majorPitch / 2) % majorPitch) + majorPitch) % majorPitch;
  const majorOffsetY = (((pan.y - majorPitch / 2) % majorPitch) + majorPitch) % majorPitch;

  return (
    <div className="canvas-container">
      <div
        ref={containerRef}
        className={`canvas-svg-layer ${isPanning ? 'is-panning' : ''} ${isSpacePressed ? 'space-held' : ''}`}
        style={{
          cursor: isPanning
            ? 'grabbing'
            : activeTool === 'pan' || isSpacePressed
            ? 'grab'
            : drawingWire || activeTool === 'wire'
            ? 'crosshair'
            : selectedLibraryPart
            ? 'copy'
            : 'default',
        }}
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg ref={svgRef} className="canvas-svg">
          <defs>
            {/* Minor Dot Grid (10px pitch = 2.54mm at 100% zoom) */}
            <pattern
              id="minorDotGrid"
              x={minorOffsetX}
              y={minorOffsetY}
              width={minorPitch}
              height={minorPitch}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={minorPitch / 2}
                cy={minorPitch / 2}
                r={1}
                fill="rgba(255, 255, 255, 0.10)"
              />
            </pattern>

            {/* Major Dot Grid (every 5th minor dot = 50px pitch) */}
            <pattern
              id="majorDotGrid"
              x={majorOffsetX}
              y={majorOffsetY}
              width={majorPitch}
              height={majorPitch}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={majorPitch / 2}
                cy={majorPitch / 2}
                r={1.5}
                fill="rgba(255, 255, 255, 0.18)"
              />
            </pattern>
          </defs>

          {/* Void Background */}
          <rect width="100%" height="100%" fill="var(--void)" />

          {/* Dot Grids */}
          {showGrid && (
            <>
              <rect width="100%" height="100%" fill="url(#minorDotGrid)" pointerEvents="none" />
              <rect width="100%" height="100%" fill="url(#majorDotGrid)" pointerEvents="none" />
            </>
          )}

          {/* Content Group (Pan & Zoom Transformed) */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            <CircuitContent
              components={components}
              wires={wires}
              routedWireMap={routedWireMap}
              selectedIds={selectedIds}
              selectedWireId={selectedWireId}
              highlightedId={highlightedId}
              findings={findings}
              hintHighlight={hintHighlight}
              hintLevel={hintLevel}
              simResult={simResult}
              isSimulating={isSimulating}
              drawingOrigin={drawingWire ? { compId: drawingWire.fromId, pinIdx: drawingWire.fromPin } : null}
              activeTool={activeTool}
              showPinLabels={showPinLabels}
              isSpacePressed={isSpacePressed}
              onComponentPointerDown={handleComponentPointerDown}
              onPinClick={handlePinClick}
              onWirePointerDown={handleWirePointerDown}
            />

            {/* Wire T-Junction Snap Preview Dot */}
            {hoveredWireSnap && (activeTool === 'wire' || drawingWire) && (
              <g className="wire-junction-preview" pointerEvents="none">
                <circle
                  cx={hoveredWireSnap.x}
                  cy={hoveredWireSnap.y}
                  r="7"
                  fill="rgba(10, 132, 255, 0.22)"
                  stroke="var(--blue)"
                  strokeWidth="1.2"
                />
                <circle
                  cx={hoveredWireSnap.x}
                  cy={hoveredWireSnap.y}
                  r="3.2"
                  fill="var(--blue)"
                  stroke="#FFFFFF"
                  strokeWidth="1"
                />
              </g>
            )}

            {/* Magnetic Pin Snap Ring Indicator */}
            {hoveredPinSnap && (activeTool === 'wire' || drawingWire) && (
              <g className="pin-snap-preview" pointerEvents="none">
                <circle
                  cx={hoveredPinSnap.x}
                  cy={hoveredPinSnap.y}
                  r="12"
                  fill="rgba(100, 210, 255, 0.15)"
                  stroke="#64D2FF"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  style={{ filter: 'drop-shadow(0 0 3px rgba(100, 210, 255, 0.4))' }}
                />
                <circle
                  cx={hoveredPinSnap.x}
                  cy={hoveredPinSnap.y}
                  r="4.5"
                  fill="#64D2FF"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              </g>
            )}

            {/* Active Orthogonal Wire Drawing Rubberband Line */}
            {drawingWire && (
              <g className="rubberband-wire" pointerEvents="none">
                <path
                  d={(() => {
                    const mx = Math.round((drawingWire.startX + drawingWire.currentX) / 2);
                    return `M ${drawingWire.startX},${drawingWire.startY} L ${mx},${drawingWire.startY} L ${mx},${drawingWire.currentY} L ${drawingWire.currentX},${drawingWire.currentY}`;
                  })()}
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="6 4"
                />
                <circle
                  cx={drawingWire.startX}
                  cy={drawingWire.startY}
                  r="3.5"
                  fill="var(--blue)"
                />
                <circle
                  cx={drawingWire.currentX}
                  cy={drawingWire.currentY}
                  r="4.5"
                  fill="var(--blue)"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  style={{ filter: 'drop-shadow(0 0 3px var(--blue))' }}
                />
              </g>
            )}

          {/* Marquee Selection Rectangle */}
          {marquee && (
            <rect
              x={Math.min(marquee.startX, marquee.currentX)}
              y={Math.min(marquee.startY, marquee.currentY)}
              width={Math.abs(marquee.currentX - marquee.startX)}
              height={Math.abs(marquee.currentY - marquee.startY)}
              fill="rgba(10, 132, 255, 0.10)"
              stroke="var(--blue)"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
          )}

          {/* Ghost Component Placement Preview */}
          {selectedLibraryPart && ghostPos && (
            <g
              className="ghost-placement-component"
              transform={`translate(${ghostPos.x}, ${ghostPos.y})`}
              pointerEvents="none"
            >
              {/* Snap crosshair indicator */}
              <circle cx="0" cy="0" r="18" fill="rgba(10, 132, 255, 0.08)" stroke="var(--blue)" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="-10" y1="0" x2="10" y2="0" stroke="var(--blue)" strokeWidth="1" opacity="0.6" />
              <line x1="0" y1="-10" x2="0" y2="10" stroke="var(--blue)" strokeWidth="1" opacity="0.6" />

              {/* Ghost Symbol */}
              <g opacity="0.75">
                {renderSymbol(
                  {
                    id: 'ghost',
                    partId: selectedLibraryPart,
                    designator: getPartMeta(selectedLibraryPart).prefix,
                    name: getPartMeta(selectedLibraryPart).name,
                    x: 0,
                    y: 0,
                    rotation: 0,
                    params: {},
                  },
                  false
                )}
              </g>

              {/* Ghost Indicator Label */}
              <text y="32" textAnchor="middle" fill="var(--blue-text)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)">
                Click to place {getPartMeta(selectedLibraryPart).prefix}
              </text>
            </g>
          )}
        </g>
        </svg>
      </div>

      {/* Floating Canvas Toolbar Pill (outside SVG layer so pointer capture never steals clicks) */}
      <FloatingToolbar
        zoom={Math.round(zoom)}
        onZoomIn={() => setZoom((prev) => Math.min(400, prev + 25))}
        onZoomOut={() => setZoom((prev) => Math.max(20, prev - 25))}
        onZoomReset={() => {
          setZoom(100);
          setPan({ x: 60, y: 40 });
        }}
        onZoomFit={handleZoomFit}
        ercCount={findings.length}
        onOpenErc={onOpenErc}
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        isSimulating={isSimulating}
        onToggleSimulation={onToggleSimulation}
      />

      {/* Live DC Simulation Readout Pill */}
      {simResult && (
        <div
          className={`canvas-sim-readout glass sim-${simResult.severity}`}
          role="status"
          aria-live="polite"
        >
          <span className={`sim-readout-dot sim-dot-${simResult.severity}`} />
          <span>{simResult.summary}</span>
        </div>
      )}
    </div>
  );
}

interface CircuitContentProps {
  components: PlacedComponent[];
  wires: WireConnection[];
  routedWireMap: Map<string, RoutedWire>;
  selectedIds: string[];
  selectedWireId: string | null;
  highlightedId: string | null;
  findings: ErcFinding[];
  hintHighlight: HintHighlight | null;
  hintLevel: 1 | 2 | 3 | 4;
  simResult: SimulationResult | null;
  isSimulating: boolean;
  drawingOrigin: { compId: string; pinIdx: number } | null;
  activeTool: 'select' | 'pan' | 'wire';
  showPinLabels: boolean;
  isSpacePressed: boolean;
  onComponentPointerDown: (e: React.PointerEvent, comp: PlacedComponent) => void;
  onPinClick: (e: React.PointerEvent, comp: PlacedComponent, pinIdx: number) => void;
  onWirePointerDown: (e: React.PointerEvent, wireId: string) => void;
}

const CircuitContent = memo(function CircuitContent({
  components,
  wires,
  routedWireMap,
  selectedIds,
  selectedWireId,
  highlightedId,
  findings,
  hintHighlight,
  hintLevel,
  simResult,
  isSimulating,
  drawingOrigin,
  activeTool,
  showPinLabels,
  isSpacePressed,
  onComponentPointerDown,
  onPinClick,
  onWirePointerDown,
}: CircuitContentProps) {
  const findingAnchors = useMemo(() => new Set(findings.map((f) => f.anchorId)), [findings]);
  const activeWireSet = useMemo(
    () => new Set(simResult?.activeWireIds ?? []),
    [simResult]
  );

  return (
    <>
      {/* Wires rendered with orthogonal obstacle-avoiding paths */}
      {wires.map((wire) => {
        const routed = routedWireMap.get(wire.id);
        if (!routed || !routed.dPath) return null;
        const dPath = routed.dPath;
        const isSelected = selectedWireId === wire.id;
        const isEnergized = activeWireSet.has(wire.id);

        return (
          <g
            key={wire.id}
            id={`wire-group-${wire.id}`}
            className={`circuit-wire-group ${isSelected ? 'wire-selected' : ''}`}
            onPointerDown={(e) => onWirePointerDown(e, wire.id)}
          >
            {/* Generous Clickable Hit Target (24px wide for effortless clicking) */}
            <path
              d={dPath}
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity="0.001"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                cursor: activeTool === 'pan' ? 'grab' : activeTool === 'wire' || drawingOrigin ? 'crosshair' : 'pointer',
                pointerEvents: activeTool === 'pan' ? 'none' : 'stroke',
              }}
            />

            {/* Selection Subtle Accent Ring / Under-layer */}
            {isSelected && (
              <path
                d={dPath}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.35"
                style={{ filter: 'drop-shadow(0 0 2px rgba(56, 189, 248, 0.35))' }}
              />
            )}

            {/* Visible Wire with rounded line joins and caps */}
            <path
              d={dPath}
              className={`circuit-wire wire-${wire.netType} ${isSelected ? 'wire-active-stroke' : ''}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Subtle current flow pulse when simulation is active */}
            {isEnergized && (
              <path
                d={dPath}
                fill="none"
                stroke={simResult?.severity === 'error' ? 'var(--error)' : 'var(--mentor)'}
                strokeWidth="2.2"
                strokeDasharray="6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
                className="sim-current-flow"
              />
            )}

            {/* Terminal and waypoint handles when selected */}
            {isSelected && routed.points.map((pt, pIdx) => (
              <circle
                key={pIdx}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                fill="#0A0B0E"
                stroke="#38BDF8"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0 0 2px rgba(56, 189, 248, 0.3))' }}
              />
            ))}
          </g>
        );
      })}

      {/* Socratic Visual Hint Layer (above wires, below pins & symbols) */}
      <HintLayer
        highlight={hintHighlight}
        level={hintLevel}
        components={components}
        wires={wires}
      />

      {/* Components */}
      {components.map((comp) => {
        const isSelected = selectedIds.includes(comp.id);
        const isHighlighted = comp.id === highlightedId;
        const hasFinding = findingAnchors.has(comp.id);
        const finding = findings.find((f) => f.anchorId === comp.id);
        const ledSim = simResult?.ledStates[comp.id];

        return (
          <g
            key={comp.id}
            id={`comp-elem-${comp.id}`}
            transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`}
            className={`circuit-component ${isSelected ? 'selected' : ''}`}
            onPointerDown={(e) => onComponentPointerDown(e, comp)}
            role="button"
            tabIndex={0}
            aria-label={`${comp.designator} ${comp.name}`}
          >
            {/* Simulated LED Glow */}
            {ledSim && (ledSim.status === 'lit' || ledSim.status === 'overcurrent') && (
              <circle
                cx="0"
                cy="0"
                r={ledSim.status === 'overcurrent' ? 24 : 20}
                fill={
                  ledSim.status === 'overcurrent'
                    ? 'rgba(255, 69, 58, 0.38)'
                    : 'rgba(255, 95, 60, 0.32)'
                }
                style={{
                  filter:
                    ledSim.status === 'overcurrent'
                      ? 'drop-shadow(0 0 12px var(--error))'
                      : 'drop-shadow(0 0 10px rgba(255, 110, 64, 0.85))',
                }}
                pointerEvents="none"
              />
            )}
            {/* Simulated LED Current & State Badge */}
            {isSimulating && ledSim && (
              <g className="canvas-current-badge" transform="translate(18, -14)" pointerEvents="none">
                <rect
                  x="-3"
                  y="-10"
                  width={ledSim.currentMa >= 100 ? 54 : 46}
                  height="14"
                  rx="3"
                  fill="rgba(10, 11, 14, 0.9)"
                  stroke={ledSim.status === 'overcurrent' ? 'var(--error)' : 'rgba(0, 113, 227, 0.5)'}
                  strokeWidth="1"
                />
                <text
                  x="2"
                  y="0"
                  fill={ledSim.status === 'overcurrent' ? 'var(--error)' : 'var(--text-1)'}
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  fontWeight="600"
                >
                  {ledSim.status === 'reversed' ? 'REV' : `${ledSim.currentMa.toFixed(1)} mA`}
                </text>
              </g>
            )}
            {/* Generous Hit Area */}
            {comp.partId === 'junction' ? (
              <circle
                cx="0"
                cy="0"
                r="14"
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: isSpacePressed ? 'grab' : 'move' }}
              />
            ) : (
              <rect
                x="-35"
                y="-25"
                width="70"
                height="50"
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: isSpacePressed ? 'grab' : 'move' }}
              />
            )}

            {/* Selection Blue Halo */}
            {isSelected && (
              <g className="component-selection-aura">
                {renderSymbol(comp, true)}
              </g>
            )}

            {/* Fault Halo: Animated dashed outline per design system */}
            {hasFinding && (
              <g className="erc-fault-group">
                <rect
                  x="-36"
                  y="-26"
                  width="72"
                  height="52"
                  rx="8"
                  fill="none"
                  stroke={finding?.severity === 'warning' ? 'var(--warning)' : 'var(--error)'}
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  className="erc-dashed-halo"
                />
                <circle cx="28" cy="-20" r="7" fill="var(--error)" />
                <text x="28" y="-17.5" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="600" fontFamily="var(--font-mono)">
                  !
                </text>
              </g>
            )}

            {/* Mentor Highlight Halo */}
            {isHighlighted && !hasFinding && (
              <rect
                x="-36"
                y="-26"
                width="72"
                height="52"
                rx="8"
                fill="none"
                stroke="var(--mentor)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.9"
              />
            )}

            {/* Schematic Symbol */}
            <g className={`component-symbol-group ${isSelected ? 'symbol-selected' : ''}`}>
              {renderSymbol(comp, false)}
            </g>

            {/* Component Pins with 20px generous hit targets */}
            {renderPins(
              comp,
              onPinClick,
              drawingOrigin,
              showPinLabels && (activeTool === 'wire' || Boolean(drawingOrigin) || isSelected)
            )}

            {/* Component Identifier */}
            {comp.partId !== 'junction' && (
              <text y="28" textAnchor="middle" className="component-identifier-text">
                {comp.designator}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
});

/** Render schematic symbol for a component */
function renderSymbol(comp: PlacedComponent, isAura: boolean = false) {
  const strokeColor = isAura ? 'var(--blue)' : 'var(--text-1)';
  const strokeW = isAura ? 2.5 : 1.5;
  const auraStyle = isAura
    ? {
        filter: 'drop-shadow(0 0 3px rgba(0, 113, 227, 0.4))',
        opacity: 0.7,
      }
    : undefined;

  switch (comp.partId) {
    case 'resistor.axial':
      return (
        <g className="component-body" style={auraStyle}>
          {/* Authentic sharp IEEE zigzag */}
          <path
            d="M -30,0 L -18,0 L -14,-7 L -7,7 L 0,-7 L 7,7 L 14,-7 L 18,0 L 30,0"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'led.5mm.red':
      return (
        <g className="component-body" style={auraStyle}>
          {/* Diode triangle + vertical cathode line + light emission arrows */}
          <polygon points="-8,-10 -8,10 10,0" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="10" y1="-10" x2="10" y2="10" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-20" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="10" y1="0" x2="24" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          {!isAura && (
            <>
              <line x1="4" y1="-12" x2="12" y2="-18" stroke="var(--error)" strokeWidth="1.2" strokeLinecap="round" />
              <polyline points="9,-18 12,-18 12,-15" stroke="var(--error)" strokeWidth="1.2" fill="none" />
              <line x1="8" y1="-10" x2="16" y2="-16" stroke="var(--error)" strokeWidth="1.2" strokeLinecap="round" />
              <polyline points="13,-16 16,-16 16,-13" stroke="var(--error)" strokeWidth="1.2" fill="none" />
            </>
          )}
        </g>
      );
    case 'battery.9v':
      return (
        <g className="component-body" style={auraStyle}>
          <line x1="0" y1="-20" x2="0" y2="-8" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-14" y1="-8" x2="14" y2="-8" stroke={strokeColor} strokeWidth={isAura ? 3.5 : 2.5} />
          <line x1="-7" y1="-2" x2="7" y2="-2" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-14" y1="4" x2="14" y2="4" stroke={strokeColor} strokeWidth={isAura ? 3.5 : 2.5} />
          <line x1="-7" y1="10" x2="7" y2="10" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="0" y1="10" x2="0" y2="20" stroke={strokeColor} strokeWidth={strokeW} />
          {!isAura && (
            <>
              <text x="18" y="-4" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)">+</text>
              <text x="18" y="10" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)">−</text>
            </>
          )}
        </g>
      );
    case 'ground':
      return (
        <g className="component-body" style={auraStyle}>
          <line x1="0" y1="-12" x2="0" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-14" y1="0" x2="14" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-9" y1="5" x2="9" y2="5" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-4" y1="10" x2="4" y2="10" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    case 'arduino.uno':
      return (
        <g className="component-body" style={auraStyle}>
          <rect x="-32" y="-24" width="64" height="48" rx="4" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <rect x="-22" y="-16" width="14" height="12" fill="var(--raised)" stroke="var(--blue)" strokeWidth="1" />
          <text x="4" y="4" textAnchor="middle" fill="var(--blue)" fontSize="9" fontFamily="var(--font-mono)">UNO</text>
        </g>
      );
    case 'capacitor.ceramic':
      return (
        <g className="component-body" style={auraStyle}>
          <line x1="-20" y1="0" x2="-6" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-6" y1="-14" x2="-6" y2="14" stroke={strokeColor} strokeWidth={isAura ? 3 : 2} />
          <line x1="6" y1="-14" x2="6" y2="14" stroke={strokeColor} strokeWidth={isAura ? 3 : 2} />
          <line x1="6" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    case 'battery.3v':
      return (
        <g className="component-body" style={auraStyle}>
          <line x1="0" y1="-16" x2="0" y2="-6" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-12" y1="-6" x2="12" y2="-6" stroke={strokeColor} strokeWidth={isAura ? 3.5 : 2.5} />
          <line x1="-6" y1="6" x2="6" y2="6" stroke={strokeColor} strokeWidth={isAura ? 4 : 3} />
          <line x1="0" y1="6" x2="0" y2="16" stroke={strokeColor} strokeWidth={strokeW} />
          {!isAura && (
            <>
              <text x="14" y="-2" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)">+</text>
              <text x="14" y="10" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)">−</text>
            </>
          )}
        </g>
      );
    case 'diode.1n4007':
      return (
        <g className="component-body" style={auraStyle}>
          <polygon points="-8,-10 -8,10 10,0" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="10" y1="-10" x2="10" y2="10" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-20" y1="0" x2="-8" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="10" y1="0" x2="20" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    case 'pushbutton': {
      const isClosed = (comp.params.state ?? 'closed') === 'closed';
      return (
        <g className="component-body" style={auraStyle}>
          <circle cx="-10" cy="4" r="2.5" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <circle cx="10" cy="4" r="2.5" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-20" y1="4" x2="-12.5" y2="4" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="12.5" y1="4" x2="20" y2="4" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-10" y1={isClosed ? 4 : -3} x2="10" y2={isClosed ? 4 : -3} stroke={strokeColor} strokeWidth={isAura ? 3 : 2} />
          <line x1="0" y1={isClosed ? 4 : -3} x2="0" y2={isClosed ? -6 : -12} stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    }
    case 'potentiometer': {
      const rawWiper = comp.params.wiper !== undefined ? Number(comp.params.wiper) : 50;
      const wiper = Math.max(0, Math.min(100, Number.isFinite(rawWiper) ? rawWiper : 50));
      const arrowX = Math.round(-12 + (wiper / 100) * 24);
      return (
        <g className="component-body" style={auraStyle}>
          <path
            d="M -24,4 L -16,4 L -12,-2 L -6,10 L 0,-2 L 6,10 L 12,-2 L 16,4 L 24,4"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1={arrowX} y1="-14" x2={arrowX} y2="-4" stroke={strokeColor} strokeWidth={strokeW} />
          <polyline points={`${arrowX - 3},-7 ${arrowX},-4 ${arrowX + 3},-7`} fill="none" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    }
    case 'switch.spst': {
      const isClosed = (comp.params.state ?? 'closed') === 'closed';
      return (
        <g className="component-body" style={auraStyle}>
          <circle cx="-10" cy="4" r="2.5" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <circle cx="10" cy="4" r="2.5" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-20" y1="4" x2="-12.5" y2="4" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="12.5" y1="4" x2="20" y2="4" stroke={strokeColor} strokeWidth={strokeW} />
          {isClosed ? (
            <line x1="-10" y1="4" x2="10" y2="4" stroke={strokeColor} strokeWidth={isAura ? 3 : 2} strokeLinecap="round" />
          ) : (
            <line x1="-8" y1="2" x2="8" y2="-8" stroke={strokeColor} strokeWidth={isAura ? 3 : 2} strokeLinecap="round" />
          )}
        </g>
      );
    }
    case 'transistor.npn':
      return (
        <g className="component-body" style={auraStyle}>
          <circle cx="0" cy="0" r="15" fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeDasharray="3 2" opacity="0.6" />
          <line x1="-16" y1="0" x2="-6" y2="0" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-6" y1="-10" x2="-6" y2="10" stroke={strokeColor} strokeWidth={isAura ? 3 : 2.2} />
          <line x1="-6" y1="-5" x2="10" y2="-12" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-6" y1="5" x2="10" y2="12" stroke={strokeColor} strokeWidth={strokeW} />
          <polygon points="6,12 10,12 8,8" fill={strokeColor} />
        </g>
      );
    case 'motor.dc':
      return (
        <g className="component-body" style={auraStyle}>
          <circle cx="0" cy="0" r="14" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <text x="0" y="4" textAnchor="middle" fill={strokeColor} fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">M</text>
          <line x1="0" y1="-20" x2="0" y2="-14" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="0" y1="14" x2="0" y2="20" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    case 'servo':
      return (
        <g className="component-body" style={auraStyle}>
          <rect x="-18" y="-12" width="36" height="24" rx="3" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <circle cx="0" cy="0" r="5" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="0" y1="-5" x2="5" y2="-8" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    case 'sensor.ultrasonic':
      return (
        <g className="component-body" style={auraStyle}>
          <rect x="-24" y="-14" width="48" height="28" rx="3" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <circle cx="-11" cy="0" r="7" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <circle cx="11" cy="0" r="7" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
        </g>
      );
    case 'breadboard.small':
      return (
        <g className="component-body" style={auraStyle}>
          <rect x="-35" y="-18" width="70" height="36" rx="4" fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          <line x1="-28" y1="-8" x2="28" y2="-8" stroke={strokeColor} strokeDasharray="2 3" strokeWidth="1" opacity="0.6" />
          <line x1="-28" y1="0" x2="28" y2="0" stroke={strokeColor} strokeDasharray="2 3" strokeWidth="1" opacity="0.6" />
          <line x1="-28" y1="8" x2="28" y2="8" stroke={strokeColor} strokeDasharray="2 3" strokeWidth="1" opacity="0.6" />
        </g>
      );
    case 'junction':
      return (
        <g className="component-body" style={auraStyle}>
          <circle
            cx="0"
            cy="0"
            r={isAura ? 7 : 4.5}
            fill={isAura ? 'var(--blue)' : '#52A8FF'}
            stroke="#05070B"
            strokeWidth="1.5"
          />
        </g>
      );
    default:
      return (
        <g className="component-body" style={auraStyle}>
          <rect x="-22" y="-16" width="44" height="32" fill="none" stroke={strokeColor} strokeWidth={strokeW} rx="3" />
        </g>
      );
  }
}

/** Render component pins with generous 20px invisible hit targets */
function renderPins(
  comp: PlacedComponent,
  onPinClick: (e: React.PointerEvent, comp: PlacedComponent, pinIdx: number) => void,
  drawingOrigin: { compId: string; pinIdx: number } | null,
  showLabels: boolean = false
) {
  const pinPositions = getPinLocalPositions(comp.partId);
  const meta = showLabels && comp.partId !== 'junction' ? getPartMeta(comp.partId) : null;
  return (
    <g>
      {pinPositions.map((pin, i) => {
        const isOrigin = drawingOrigin?.compId === comp.id && drawingOrigin?.pinIdx === i;
        const pinMeta = meta?.pins[i];
        return (
          <g
            key={i}
            className={`pin-target-group ${isOrigin ? 'pin-connecting' : ''}`}
            onPointerDown={(e) => onPinClick(e, comp, i)}
          >
            {/* Generous 20px invisible hit target */}
            <circle
              cx={pin.x}
              cy={pin.y}
              r="10"
              fill="transparent"
              style={{ cursor: 'crosshair', pointerEvents: 'all' }}
            />
            {/* Visible pin dot */}
            <circle
              cx={pin.x}
              cy={pin.y}
              className={`circuit-pin ${isOrigin ? 'pin-active' : ''}`}
            />
            {/* Optional pin role callout */}
            {showLabels && pinMeta && (
              <text
                x={pin.x}
                y={pin.y - 7}
                textAnchor="middle"
                className="pin-role-callout"
              >
                {pinMeta.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export {
  computeRotatedPinWorld as getRotatedPinWorldPos,
  getPinLocalPositions as getPinPositions,
};
