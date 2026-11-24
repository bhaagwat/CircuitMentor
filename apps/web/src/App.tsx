import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Rail from './components/Rail';
import Library from './components/Library';
import Canvas, { type WireConnection, type AddWireWithJunctionsPayload } from './components/Canvas';
import Inspector from './components/Inspector';
import CodeEditor from './components/CodeEditor';
import MentorDock from './components/MentorDock';
import ErcFindings from './components/ErcFindings';
import CommandPalette from './components/CommandPalette';
import SmallScreenNotice from './components/SmallScreenNotice';
import Dashboard from './components/Dashboard';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import ShortcutsHelpSheet from './components/ShortcutsHelpSheet';
import SettingsModal, {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from './components/SettingsModal';
import { isInputElement } from './lib/shortcuts';
import { getPartMeta } from './lib/parts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { api, ApiError, type BackendProject, type UserProfile, type ProjectProgress } from './lib/api';
import { evaluateErc } from './lib/erc/rules';
import type { ErcFindingWithHints } from './lib/erc/types';
import { useMentor } from './lib/mentor/useMentor';
import { getTaskById, evaluateTaskMilestones } from './lib/learning/tasks';
import { runDcSimulation } from './lib/sim/dcSim';
import { AppleBorderGradient } from './components/v1/skiper86';

export interface PlacedComponent {
  id: string;
  partId: string;
  designator: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  params: Record<string, string>;
}

export type ErcFinding = ErcFindingWithHints;

export interface ProjectData {
  id: string;
  name: string;
  updatedAt: string;
  components: PlacedComponent[];
  wires: WireConnection[];
  findings: ErcFinding[];
  taskId?: string | null;
  progress?: ProjectProgress;
  goal?: string | null;
}

function backendToProjectData(bp: BackendProject): ProjectData {
  const rawComps = bp.circuit_data?.components;
  const rawWires = bp.circuit_data?.wires;
  const comps: PlacedComponent[] = Array.isArray(rawComps) ? rawComps : [];
  const wires: WireConnection[] = Array.isArray(rawWires) ? rawWires : [];
  return {
    id: bp.id,
    name: bp.title,
    updatedAt: bp.updated_at ? new Date(bp.updated_at).toLocaleString() : 'Just now',
    components: comps,
    wires: wires,
    findings: evaluateErc(comps, wires),
    taskId: bp.task_id || null,
    progress: bp.progress || {},
    goal: bp.goal || null,
  };
}

// 54-Component Dense Circuit for Performance Testing
const DENSE_COMPONENTS: PlacedComponent[] = Array.from({ length: 54 }, (_, i) => {
  const row = Math.floor(i / 9);
  const col = i % 9;
  const kinds = ['resistor.axial', 'led.5mm.red', 'capacitor.ceramic', 'diode.1n4007', 'potentiometer', 'resistor.axial'];
  const kind = kinds[i % kinds.length]!;
  const designators = ['R', 'D', 'C', 'D', 'RV', 'R'];
  const des = `${designators[i % designators.length]}${i + 1}`;
  const params: Record<string, string> =
    kind === 'resistor.axial'
      ? { resistance: '10 kΩ' }
      : kind === 'capacitor.ceramic'
      ? { capacitance: '100 nF' }
      : {};
  return {
    id: `cd_${i + 1}`,
    partId: kind,
    designator: des,
    name: kind === 'resistor.axial' ? 'Resistor' : kind === 'led.5mm.red' ? 'LED' : kind === 'capacitor.ceramic' ? 'Capacitor' : kind === 'diode.1n4007' ? 'Diode' : 'Potentiometer',
    x: 100 + col * 90,
    y: 80 + row * 75,
    rotation: 0,
    params,
  };
});

// Initial Starter Projects for Dashboard
const INITIAL_PROJECTS: ProjectData[] = [
  {
    id: 'proj-1',
    name: 'LED Current Limiter Lab',
    updatedAt: 'Edited 12m ago',
    components: [
      { id: 'c1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
      { id: 'c2', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 300, y: 120, rotation: 0, params: { resistance: '220 Ω', tolerance: '5 %', power: '0.25 W' } },
      { id: 'c3', partId: 'led.5mm.red', designator: 'D1', name: 'LED (Red 5mm)', x: 480, y: 120, rotation: 0, params: { color: 'Red', forward_voltage: '2.0 V', max_current: '20 mA' } },
      { id: 'c4', partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 300, y: 320, rotation: 0, params: {} },
    ],
    // Initially V1 is directly connected to D1 without R1, causing the active overcurrent finding
    wires: [
      { id: 'w1', fromId: 'c1', fromPin: 0, toId: 'c3', toPin: 0, netType: 'vcc' },
      { id: 'w2', fromId: 'c3', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
      { id: 'w3', fromId: 'c1', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
    ],
    findings: evaluateErc(
      [
        { id: 'c1', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
        { id: 'c2', partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 300, y: 120, rotation: 0, params: { resistance: '220 Ω', tolerance: '5 %', power: '0.25 W' } },
        { id: 'c3', partId: 'led.5mm.red', designator: 'D1', name: 'LED (Red 5mm)', x: 480, y: 120, rotation: 0, params: { color: 'Red', forward_voltage: '2.0 V', max_current: '20 mA' } },
        { id: 'c4', partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 300, y: 320, rotation: 0, params: {} },
      ],
      [
        { id: 'w1', fromId: 'c1', fromPin: 0, toId: 'c3', toPin: 0, netType: 'vcc' },
        { id: 'w2', fromId: 'c3', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
        { id: 'w3', fromId: 'c1', fromPin: 1, toId: 'c4', toPin: 0, netType: 'gnd' },
      ]
    ),
    progress: {
      milestones: {},
      hints_used: 1,
      findings_seen: { LED_NO_RESISTOR: 3 },
    },
  },
  {
    id: 'proj-dense',
    name: 'Dense Matrix System (54 Components Stress Test)',
    updatedAt: 'Edited 2m ago',
    components: DENSE_COMPONENTS,
    wires: [],
    findings: [],
  },
  {
    id: 'proj-2',
    name: 'Automatic Dustbin (Arduino + Servo)',
    updatedAt: 'Edited 2h ago',
    components: [
      { id: 'c20', partId: 'arduino.uno', designator: 'U1', name: 'Arduino Uno R3', x: 260, y: 160, rotation: 0, params: { mcu: 'ATmega328P', clock: '16 MHz' } },
      { id: 'c21', partId: 'sensor.ultrasonic', designator: 'S1', name: 'HC-SR04 Ultrasonic', x: 100, y: 100, rotation: 0, params: { range: '2cm - 400cm' } },
      { id: 'c22', partId: 'servo', designator: 'M1', name: 'Micro Servo 9g', x: 440, y: 180, rotation: 0, params: { torque: '1.8 kg·cm' } },
      { id: 'c23', partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 260, y: 300, rotation: 0, params: {} },
    ],
    wires: [
      { id: 'w20', fromId: 'c20', fromPin: 0, toId: 'c21', toPin: 0, netType: 'vcc' },
      { id: 'w21', fromId: 'c20', fromPin: 1, toId: 'c23', toPin: 0, netType: 'gnd' },
    ],
    findings: [],
  },
  {
    id: 'proj-3',
    name: 'Dual Rail Power Supply Network',
    updatedAt: 'Edited yesterday',
    components: [
      { id: 'c30', partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 120, y: 180, rotation: 0, params: { voltage: '9 V' } },
      { id: 'c31', partId: 'potentiometer', designator: 'RV1', name: 'Potentiometer', x: 280, y: 140, rotation: 0, params: { resistance: '10 kΩ' } },
      { id: 'c32', partId: 'capacitor.ceramic', designator: 'C1', name: 'Capacitor', x: 440, y: 180, rotation: 0, params: { capacitance: '100 nF' } },
      { id: 'c33', partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 280, y: 280, rotation: 0, params: {} },
    ],
    wires: [
      { id: 'w30', fromId: 'c30', fromPin: 0, toId: 'c31', toPin: 0, netType: 'vcc' },
      { id: 'w31', fromId: 'c31', fromPin: 1, toId: 'c32', toPin: 0, netType: 'signal' },
      { id: 'w32', fromId: 'c32', fromPin: 1, toId: 'c33', toPin: 0, netType: 'gnd' },
    ],
    findings: [
      {
        id: 'f2',
        ruleId: 'MISSING_DECOUPLING',
        severity: 'info',
        title: 'No decoupling capacitor on supply rail',
        detail: 'A 100 nF ceramic capacitor near the IC helps filter transient supply noise.',
        anchorId: 'c30',
        componentIds: ['c30'],
        hints: [
          {
            level: 1,
            text: 'What keeps a supply rail steady when loads switch quickly?',
            highlight: { components: ['c30'] },
          },
          {
            level: 2,
            text: 'Decoupling principle: a small capacitor across VCC and Ground acts as a local energy reservoir to absorb voltage spikes.',
            highlight: { components: ['c30'], netPath: ['c30', 'c32', 'c33'], gapAfter: 'c30' },
          },
          {
            level: 3,
            text: 'Inspect the positive rail near V1 — a ceramic capacitor placed across VCC and GND filters transient noise.',
            highlight: {
              components: ['c30'],
              ghost: { nearComponentId: 'c30', category: 'decoupling capacitor?' },
            },
          },
          {
            level: 4,
            text: 'Connect a 100 nF ceramic capacitor between VCC and Ground near the supply.',
            highlight: {
              components: ['c30'],
              ghost: { nearComponentId: 'c30', category: 'capacitor', value: '100 nF' },
            },
          },
        ],
      },
    ],
  },
];

interface AppProps {
  initialScreen?: 'landing' | 'login' | 'dashboard' | 'editor';
}

export default function App({ initialScreen }: AppProps = {}) {
  const [screen, setScreenState] = useState<'landing' | 'login' | 'dashboard' | 'editor'>(() => {
    if (initialScreen) return initialScreen;
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/dashboard')) return 'dashboard';
      if (path.startsWith('/workbench') || path.startsWith('/editor')) return 'editor';
      if (path.startsWith('/login')) return 'login';
    }
    return 'landing';
  });

  const setScreen = useCallback((nextScreen: 'landing' | 'login' | 'dashboard' | 'editor') => {
    setScreenState(nextScreen);
    if (typeof window !== 'undefined') {
      const pathMap: Record<string, string> = {
        landing: '/',
        dashboard: '/dashboard',
        editor: '/workbench',
        login: '/login',
      };
      const targetPath = pathMap[nextScreen] || '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname;
      if (path.startsWith('/dashboard')) setScreenState('dashboard');
      else if (path.startsWith('/workbench') || path.startsWith('/editor')) setScreenState('editor');
      else if (path.startsWith('/login')) setScreenState('login');
      else setScreenState('landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>(() => {
    try {
      const draft = localStorage.getItem('cm_draft_proj-1');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (
          Array.isArray(parsed.components) &&
          Array.isArray(parsed.wires) &&
          parsed.components.every((c: any) => c && typeof c.id === 'string' && typeof c.partId === 'string')
        ) {
          return INITIAL_PROJECTS.map((p) => {
            if (p.id === 'proj-1') {
              return {
                ...p,
                components: parsed.components,
                wires: parsed.wires,
                findings: evaluateErc(parsed.components, parsed.wires),
              };
            }
            return p;
          });
        }
      }
    } catch {
      // ignore draft parsing errors
    }
    return INITIAL_PROJECTS;
  });
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-1');
  const [, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editor shell states
  const [activeRailItem, setActiveRailItem] = useState('components');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState<'inspector' | 'code' | 'mentor' | 'erc'>('inspector');

  // Selection & tool states
  const [selectedIds, setSelectedIds] = useState<string[]>(['c2']);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectedLibraryPart, setSelectedLibraryPart] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'wire'>('select');
  const [isSimulating, setIsSimulating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    try {
      const saved = localStorage.getItem('cm_editor_settings');
      if (saved) return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_EDITOR_SETTINGS;
  });
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [circuitChangeCount, setCircuitChangeCount] = useState(0);

  const handleUpdateSettings = useCallback((next: EditorSettings) => {
    setEditorSettings(next);
    try {
      localStorage.setItem('cm_editor_settings', JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<Array<{ components: PlacedComponent[]; wires: WireConnection[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ components: PlacedComponent[]; wires: WireConnection[] }>>([]);

  // Active Project
  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || projects[0]!;
  }, [projects, activeProjectId]);

  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const selectedWire = useMemo(() => {
    return selectedWireId ? currentProject.wires.find((w) => w.id === selectedWireId) || null : null;
  }, [currentProject.wires, selectedWireId]);

  const lastSavedCircuitRef = useRef<string>('');

  const selectedComponent = useMemo(() => {
    return currentProject.components.find((c) => c.id === selectedIds[0]) || null;
  }, [currentProject.components, selectedIds]);

  const currentTask = useMemo(() => {
    return currentProject.taskId ? getTaskById(currentProject.taskId) : null;
  }, [currentProject.taskId]);

  const simResult = useMemo(() => {
    if (!isSimulating) return null;
    return runDcSimulation(currentProject.components, currentProject.wires);
  }, [isSimulating, currentProject.components, currentProject.wires]);

  const circuitContext = useMemo(
    () => ({
      projectName: currentProject.name,
      task: currentTask ? { title: currentTask.title, goal: currentTask.goal } : null,
      components: currentProject.components,
      wires: currentProject.wires,
      selectedComponentIds: selectedIds,
      selectedConnectionIds: selectedWireId ? [selectedWireId] : [],
      simulation: {
        running: isSimulating,
        result: simResult,
      },
    }),
    [
      currentProject.name,
      currentTask,
      currentProject.components,
      currentProject.wires,
      selectedIds,
      selectedWireId,
      isSimulating,
      simResult,
    ]
  );

  const mentor = useMentor(
    currentProject.id,
    currentProject.findings,
    circuitChangeCount,
    circuitContext,
    selectedComponent?.id ?? null
  );

  // Evaluate task milestones whenever circuit topology changes in a task-associated project
  useEffect(() => {
    if (!currentTask) return;
    const computedMilestones = evaluateTaskMilestones(
      currentTask,
      currentProject.components,
      currentProject.wires
    );
    const existingMilestones = currentProject.progress?.milestones || {};
    let diff = false;
    for (const m of currentTask.milestones) {
      if (!!existingMilestones[m.id] !== !!computedMilestones[m.id]) {
        diff = true;
        break;
      }
    }
    const allPassed = currentTask.milestones.every((m) => !!computedMilestones[m.id]);
    const newlyCompleted = allPassed && !currentProject.progress?.completed_at;

    if (diff || newlyCompleted) {
      const nextProgress: ProjectProgress = {
        ...currentProject.progress,
        milestones: computedMilestones,
        completed_at: newlyCompleted ? new Date().toISOString() : currentProject.progress?.completed_at,
      };

      setProjects((prev) =>
        prev.map((p) => (p.id === activeProjectId ? { ...p, progress: nextProgress } : p))
      );
    }
  }, [currentTask, currentProject.components, currentProject.wires, activeProjectId]);

  // Track ERC findings encountered across sessions
  useEffect(() => {
    if (currentProject.findings.length === 0) return;
    const currentSeen = currentProject.progress?.findings_seen || {};
    let changed = false;
    const updatedSeen = { ...currentSeen };
    for (const f of currentProject.findings) {
      if (!updatedSeen[f.id]) {
        updatedSeen[f.id] = (updatedSeen[f.id] || 0) + 1;
        changed = true;
      }
    }
    if (changed) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === activeProjectId
            ? { ...p, progress: { ...p.progress, findings_seen: updatedSeen } }
            : p
        )
      );
    }
  }, [currentProject.findings, activeProjectId]);

  // Wrap hint requests to count hints_used
  const handleHintWithProgress = useCallback(
    (findingId?: string) => {
      if (findingId) {
        mentor.focusFinding(findingId);
      }
      mentor.handleHint();
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          const prevHints = p.progress?.hints_used || 0;
          return {
            ...p,
            progress: {
              ...p.progress,
              hints_used: prevHints + 1,
            },
          };
        })
      );
    },
    [mentor, activeProjectId]
  );

  // Push Snapshot to Undo Stack before mutations
  const pushHistory = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-30),
      {
        components: currentProject.components,
        wires: currentProject.wires,
      },
    ]);
    setRedoStack([]);
  }, [currentProject.components, currentProject.wires]);

  // Undo Action
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1]!;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      {
        components: currentProject.components,
        wires: currentProject.wires,
      },
    ]);
    const validIds = new Set(previous.components.map((c) => c.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
    setProjects((prevProjects) =>
      prevProjects.map((p) => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          components: previous.components,
          wires: previous.wires,
          findings: evaluateErc(previous.components, previous.wires),
        };
      })
    );
    setCircuitChangeCount((c) => c + 1);
    setSaveToast('Undid action');
    setTimeout(() => setSaveToast(null), 1200);
  }, [undoStack, currentProject.components, currentProject.wires, activeProjectId]);

  // Redo Action
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      {
        components: currentProject.components,
        wires: currentProject.wires,
      },
    ]);
    const validIds = new Set(next.components.map((c) => c.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
    setProjects((prevProjects) =>
      prevProjects.map((p) => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          components: next.components,
          wires: next.wires,
          findings: evaluateErc(next.components, next.wires),
        };
      })
    );
    setCircuitChangeCount((c) => c + 1);
    setSaveToast('Redid action');
    setTimeout(() => setSaveToast(null), 1200);
  }, [redoStack, currentProject.components, currentProject.wires, activeProjectId]);

  // App load: check authentication via GET /v1/auth/me
  useEffect(() => {
    let active = true;
    async function checkAuth() {
      try {
        setAuthLoading(true);
        const user = await api.getMe();
        if (!active) return;
        setCurrentUser(user);
        setIsAuthenticated(true);
        if (window.location.pathname.startsWith('/dashboard')) {
          setScreen('dashboard');
        }
      } catch {
        if (!active) return;
        setIsAuthenticated(false);
        setCurrentUser(null);
        if (window.location.pathname.startsWith('/login') || window.location.search.includes('error=')) {
          setScreen('login');
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    checkAuth();
    return () => {
      active = false;
    };
  }, []);

  // When authenticated, fetch real projects from /v1/projects
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    async function loadProjects() {
      try {
        setProjectsLoading(true);
        setProjectsError(null);
        const list = await api.listProjects();
        if (!active) return;
        if (list.length > 0) {
          const mapped = list.map(backendToProjectData);
          setProjects(mapped);
          if (!mapped.some((p) => p.id === activeProjectId)) {
            setActiveProjectId(mapped[0]!.id);
          }
        }
      } catch (err: any) {
        if (!active) return;
        setProjectsError(err.message || 'Failed to fetch projects');
      } finally {
        if (active) setProjectsLoading(false);
      }
    }
    loadProjects();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Auth Handlers
  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    api.logout();
  }, []);

  // Open Project handler
  const handleOpenProject = useCallback(
    (projectId: string, options?: { openMentor?: boolean; findingId?: string }) => {
      setActiveProjectId(projectId);
      setScreen('editor');
      setUndoStack([]);
      setRedoStack([]);
      const target = projects.find((p) => p.id === projectId);
      if (target && target.components.length > 0) {
        setSelectedIds([target.components[0]!.id]);
      } else {
        setSelectedIds([]);
      }
      if (options?.openMentor) {
        setDockTab('mentor');
        setDockOpen(true);
      }
    },
    [projects]
  );

  // Create Project handler
  const handleCreateProject = useCallback(
    async (name: string, template: string = 'blank', taskId?: string) => {
      let starterComps: PlacedComponent[] = [];
      let starterWires: WireConnection[] = [];

      if (taskId) {
        const task = getTaskById(taskId);
        if (task) {
          starterComps = task.starterCircuit.components;
          starterWires = task.starterCircuit.wires;
        }
      } else if (template === 'led') {
        starterComps = [
          { id: `c_${Date.now()}_1`, partId: 'battery.9v', designator: 'V1', name: '9V Battery', x: 120, y: 200, rotation: 0, params: { voltage: '9 V' } },
          { id: `c_${Date.now()}_2`, partId: 'resistor.axial', designator: 'R1', name: 'Resistor', x: 280, y: 140, rotation: 0, params: { resistance: '220 Ω' } },
          { id: `c_${Date.now()}_3`, partId: 'led.5mm.red', designator: 'D1', name: 'LED (Red)', x: 440, y: 140, rotation: 0, params: { color: 'Red' } },
          { id: `c_${Date.now()}_4`, partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 280, y: 300, rotation: 0, params: {} },
        ];
        starterWires = [
          { id: `w_${Date.now()}_1`, fromId: starterComps[0]!.id, fromPin: 0, toId: starterComps[1]!.id, toPin: 0, netType: 'vcc' },
          { id: `w_${Date.now()}_2`, fromId: starterComps[1]!.id, fromPin: 1, toId: starterComps[2]!.id, toPin: 0, netType: 'signal' },
          { id: `w_${Date.now()}_3`, fromId: starterComps[2]!.id, fromPin: 1, toId: starterComps[3]!.id, toPin: 0, netType: 'gnd' },
        ];
      } else if (template === 'arduino') {
        starterComps = [
          { id: `c_${Date.now()}_1`, partId: 'arduino.uno', designator: 'U1', name: 'Arduino Uno R3', x: 240, y: 160, rotation: 0, params: { mcu: 'ATmega328P' } },
          { id: `c_${Date.now()}_2`, partId: 'sensor.ultrasonic', designator: 'S1', name: 'HC-SR04 Ultrasonic', x: 100, y: 100, rotation: 0, params: {} },
          { id: `c_${Date.now()}_3`, partId: 'ground', designator: 'GND', name: 'Earth Ground', x: 240, y: 300, rotation: 0, params: {} },
        ];
      }

      const progress: ProjectProgress = taskId
        ? {
            milestones: {},
            hints_used: 0,
            findings_seen: {},
          }
        : {};

      if (isAuthenticated) {
        try {
          const created = await api.createProject({
            title: name,
            board_type: 'breadboard',
            task_id: taskId || null,
            progress,
            circuit_data: {
              v: 1,
              components: starterComps,
              wires: starterWires,
            },
          });
          const newProj = backendToProjectData(created);
          setProjects((prev) => [newProj, ...prev]);
          setActiveProjectId(newProj.id);
          setUndoStack([]);
          setRedoStack([]);
          setScreen('editor');
          if (starterComps.length > 0) {
            setSelectedIds([starterComps[0]!.id]);
          } else {
            setSelectedIds([]);
          }
          if (taskId) {
            setDockTab('mentor');
            setDockOpen(true);
          }
          return;
        } catch (err: any) {
          setProjectsError(`Failed to create project on server: ${err.message}`);
        }
      }

      const newProj: ProjectData = {
        id: `proj_${Date.now()}`,
        name,
        updatedAt: 'Just now',
        components: starterComps,
        wires: starterWires,
        findings: evaluateErc(starterComps, starterWires),
        taskId: taskId || null,
        progress,
      };

      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);
      setUndoStack([]);
      setRedoStack([]);
      setScreen('editor');
      if (starterComps.length > 0) {
        setSelectedIds([starterComps[0]!.id]);
      } else {
        setSelectedIds([]);
      }
      if (taskId) {
        setDockTab('mentor');
        setDockOpen(true);
      }
    },
    [isAuthenticated]
  );

  const handleRenameProject = useCallback(
    async (projectId: string, newName: string) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, name: newName, updatedAt: 'Just now' } : p))
      );
      if (isAuthenticated) {
        try {
          await api.updateProject(projectId, { title: newName });
        } catch {
          // ignore
        }
      }
    },
    [isAuthenticated]
  );

  const handleDuplicateProject = useCallback(
    async (projectId: string) => {
      const target = projects.find((p) => p.id === projectId);
      if (!target) return;
      const dupName = `${target.name} (Copy)`;
      await handleCreateProject(dupName, undefined, target.taskId || undefined);
    },
    [projects, handleCreateProject]
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (activeProjectId === projectId) {
        const remaining = projects.filter((p) => p.id !== projectId);
        if (remaining.length > 0) {
          setActiveProjectId(remaining[0]!.id);
        }
      }
      if (isAuthenticated) {
        try {
          await api.deleteProject(projectId);
        } catch {
          // ignore
        }
      }
    },
    [activeProjectId, isAuthenticated, projects]
  );

  // Update component positions after canvas drag
  const handleUpdateComponentPositions = useCallback(
    (updates: Array<{ id: string; x: number; y: number }>) => {
      pushHistory();
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            components: p.components.map((c) => {
              const match = updateMap.get(c.id);
              return match ? { ...c, x: match.x, y: match.y } : c;
            }),
          };
        })
      );
    },
    [activeProjectId, pushHistory]
  );

  // Add Component to Canvas (via drag-and-drop or click-to-place)
  const handlePlaceComponent = useCallback(
    (partId: string, x: number, y: number) => {
      pushHistory();
      const meta = getPartMeta(partId);
      const prefix = meta?.prefix || 'U';
      const name = meta?.name || 'Component';
      const params = meta ? { ...meta.params } : {};

      const count = currentProject.components.filter((c) => c.partId === partId).length + 1;
      const des = prefix === 'GND' ? (count > 1 ? `GND${count}` : 'GND') : `${prefix}${count}`;

      const newComp: PlacedComponent = {
        id: `c_${Date.now()}`,
        partId,
        designator: des,
        name,
        x,
        y,
        rotation: 0,
        params,
      };

      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          const updatedComps = [...p.components, newComp];
          return {
            ...p,
            components: updatedComps,
            findings: evaluateErc(updatedComps, p.wires),
          };
        })
      );

      setSelectedIds([newComp.id]);
      setDockTab('inspector');
      setCircuitChangeCount((c) => c + 1);
    },
    [pushHistory, currentProject.components, activeProjectId]
  );

  // Add Wire Connection
  const handleAddWire = useCallback(
    (fromId: string, fromPin: number, toId: string, toPin: number) => {
      const exists = currentProject.wires.some(
        (w) =>
          (w.fromId === fromId && w.fromPin === fromPin && w.toId === toId && w.toPin === toPin) ||
          (w.fromId === toId && w.fromPin === toPin && w.toId === fromId && w.toPin === fromPin)
      );
      if (exists) return;

      pushHistory();
      const fromComp = currentProject.components.find((c) => c.id === fromId);
      const toComp = currentProject.components.find((c) => c.id === toId);

      // Determine wire semantic netType
      let netType: 'vcc' | 'gnd' | 'signal' = 'signal';
      if (
        (fromComp?.partId.startsWith('battery') && fromPin === 0) ||
        (toComp?.partId.startsWith('battery') && toPin === 0) ||
        (fromComp?.partId === 'arduino.uno' && fromPin === 0) ||
        (toComp?.partId === 'arduino.uno' && toPin === 0)
      ) {
        netType = 'vcc';
      } else if (
        fromComp?.partId === 'ground' ||
        toComp?.partId === 'ground' ||
        (fromComp?.partId.startsWith('battery') && fromPin === 1) ||
        (toComp?.partId.startsWith('battery') && toPin === 1) ||
        (fromComp?.partId === 'arduino.uno' && (fromPin === 1 || fromPin === 2)) ||
        (toComp?.partId === 'arduino.uno' && (toPin === 1 || toPin === 2))
      ) {
        netType = 'gnd';
      }

      const newWire: WireConnection = {
        id: `w_${Date.now()}`,
        fromId,
        fromPin,
        toId,
        toPin,
        netType,
      };

      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          const updatedWires = [...p.wires, newWire];
          return {
            ...p,
            wires: updatedWires,
            findings: evaluateErc(p.components, updatedWires),
          };
        })
      );
      setCircuitChangeCount((c) => c + 1);
    },
    [pushHistory, currentProject.components, currentProject.wires, activeProjectId]
  );

  // Add Wire Connection with Automatic Wire-to-Wire T-Junction Splitting
  const handleAddWireWithJunctions = useCallback(
    (payload: AddWireWithJunctionsPayload) => {
      pushHistory();
      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          let nextComps = [...p.components];
          let nextWires = [...p.wires];
          const ts = Date.now();
          let jSeq = p.components.filter((c) => c.partId === 'junction').length + 1;

          let actualFromId = payload.fromId;
          let actualFromPin = payload.fromPin;
          let actualToId = payload.toId;
          let actualToPin = payload.toPin;
          let inheritedNet: 'vcc' | 'gnd' | 'signal' | null = null;

          if (payload.fromSplit) {
            const orig = nextWires.find((w) => w.id === payload.fromSplit!.wireId);
            if (orig) {
              const jId = `c_j_${ts}_a`;
              nextComps.push({
                id: jId,
                partId: 'junction',
                designator: `J${jSeq++}`,
                name: 'Wire Junction',
                x: payload.fromSplit.x,
                y: payload.fromSplit.y,
                rotation: 0,
                params: {},
              });
              nextWires = nextWires.filter((w) => w.id !== orig.id);
              nextWires.push(
                {
                  id: `w_${ts}_sa1`,
                  fromId: orig.fromId,
                  fromPin: orig.fromPin,
                  toId: jId,
                  toPin: 0,
                  netType: orig.netType,
                },
                {
                  id: `w_${ts}_sa2`,
                  fromId: jId,
                  fromPin: 0,
                  toId: orig.toId,
                  toPin: orig.toPin,
                  netType: orig.netType,
                }
              );
              actualFromId = jId;
              actualFromPin = 0;
              inheritedNet = orig.netType;
            }
          }

          if (payload.toSplit) {
            // Avoid splitting the exact same wire twice in one drag
            if (payload.fromSplit && payload.toSplit.wireId === payload.fromSplit.wireId) {
              return {
                ...p,
                components: nextComps,
                wires: nextWires,
                findings: evaluateErc(nextComps, nextWires),
              };
            }
            const orig = nextWires.find((w) => w.id === payload.toSplit!.wireId);
            if (orig) {
              const jId = `c_j_${ts}_b`;
              nextComps.push({
                id: jId,
                partId: 'junction',
                designator: `J${jSeq++}`,
                name: 'Wire Junction',
                x: payload.toSplit.x,
                y: payload.toSplit.y,
                rotation: 0,
                params: {},
              });
              nextWires = nextWires.filter((w) => w.id !== orig.id);
              nextWires.push(
                {
                  id: `w_${ts}_sb1`,
                  fromId: orig.fromId,
                  fromPin: orig.fromPin,
                  toId: jId,
                  toPin: 0,
                  netType: orig.netType,
                },
                {
                  id: `w_${ts}_sb2`,
                  fromId: jId,
                  fromPin: 0,
                  toId: orig.toId,
                  toPin: orig.toPin,
                  netType: orig.netType,
                }
              );
              actualToId = jId;
              actualToPin = 0;
              inheritedNet = inheritedNet ?? orig.netType;
            }
          }

          if (
            actualFromId !== actualToId ||
            actualFromPin !== actualToPin
          ) {
            const fromComp = nextComps.find((c) => c.id === actualFromId);
            const toComp = nextComps.find((c) => c.id === actualToId);
            let netType: 'vcc' | 'gnd' | 'signal' = inheritedNet ?? 'signal';
            if (
              (fromComp?.partId.startsWith('battery') && actualFromPin === 0) ||
              (toComp?.partId.startsWith('battery') && actualToPin === 0)
            ) {
              netType = 'vcc';
            } else if (
              fromComp?.partId === 'ground' ||
              toComp?.partId === 'ground' ||
              (fromComp?.partId.startsWith('battery') && actualFromPin === 1) ||
              (toComp?.partId.startsWith('battery') && actualToPin === 1)
            ) {
              netType = 'gnd';
            }

            nextWires.push({
              id: `w_${ts}_new`,
              fromId: actualFromId,
              fromPin: actualFromPin,
              toId: actualToId,
              toPin: actualToPin,
              netType,
            });
          }

          return {
            ...p,
            components: nextComps,
            wires: nextWires,
            findings: evaluateErc(nextComps, nextWires),
          };
        })
      );
      setCircuitChangeCount((c) => c + 1);
    },
    [pushHistory, activeProjectId]
  );

  // Update Component properties (from Inspector)
  const handleUpdateComponent = useCallback(
    (id: string, updates: Partial<PlacedComponent>) => {
      pushHistory();
      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          const updatedComps = p.components.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          );
          return {
            ...p,
            components: updatedComps,
            findings: evaluateErc(updatedComps, p.wires),
          };
        })
      );
      setCircuitChangeCount((c) => c + 1);
    },
    [pushHistory, activeProjectId]
  );

  // Delete Wire Connection with Auto-Healing of Degree <= 2 Junctions
  const handleDeleteWire = useCallback(
    (wireId: string) => {
      pushHistory();
      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          const targetWire = p.wires.find((w) => w.id === wireId);
          if (!targetWire) return p;

          let updatedWires = p.wires.filter((w) => w.id !== wireId);
          let updatedComps = [...p.components];

          // Inspect both endpoints attached to the deleted wire
          const checkEndpoints = [
            { id: targetWire.fromId, pin: targetWire.fromPin },
            { id: targetWire.toId, pin: targetWire.toPin },
          ];

          for (const ep of checkEndpoints) {
            const comp = updatedComps.find((c) => c.id === ep.id);
            if (!comp || comp.partId !== 'junction') continue;

            const remaining = updatedWires.filter(
              (w) => w.fromId === comp.id || w.toId === comp.id
            );

            if (remaining.length <= 1) {
              // Degree <= 1: Junction is no longer a branching point; remove it and any dead stub wire
              updatedComps = updatedComps.filter((c) => c.id !== comp.id);
              if (remaining.length === 1) {
                const dangId = remaining[0]!.id;
                updatedWires = updatedWires.filter((w) => w.id !== dangId);
              }
            } else if (remaining.length === 2) {
              // Degree == 2: Merge the two wires into one continuous segment and remove the junction node!
              const [w1, w2] = remaining;
              if (!w1 || !w2) continue;
              const ep1 = w1.fromId === comp.id ? { id: w1.toId, pin: w1.toPin } : { id: w1.fromId, pin: w1.fromPin };
              const ep2 = w2.fromId === comp.id ? { id: w2.toId, pin: w2.toPin } : { id: w2.fromId, pin: w2.fromPin };

              updatedComps = updatedComps.filter((c) => c.id !== comp.id);

              const mergedWire: WireConnection = {
                id: `w_merged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                fromId: ep1.id,
                fromPin: ep1.pin,
                toId: ep2.id,
                toPin: ep2.pin,
                netType: w1.netType !== 'signal' ? w1.netType : w2.netType,
              };

              updatedWires = updatedWires.filter((w) => w.id !== w1.id && w.id !== w2.id).concat(mergedWire);
            }
          }

          return {
            ...p,
            components: updatedComps,
            wires: updatedWires,
            findings: evaluateErc(updatedComps, updatedWires),
          };
        })
      );
      setSelectedWireId((cur) => (cur === wireId ? null : cur));
      setCircuitChangeCount((c) => c + 1);
    },
    [pushHistory, activeProjectId]
  );

  // Component Selection (support single or shift-multi-select)
  const handleSelectComponent = useCallback((comp: PlacedComponent, isMulti: boolean) => {
    setSelectedWireId(null);
    if (isMulti) {
      setSelectedIds((prev) =>
        prev.includes(comp.id) ? prev.filter((id) => id !== comp.id) : [...prev, comp.id]
      );
    } else {
      setSelectedIds([comp.id]);
    }
    setDockTab('inspector');
    setDockOpen(true);
  }, []);

  // Wire Selection
  const handleSelectWire = useCallback((wireId: string | null) => {
    setSelectedWireId(wireId);
    if (wireId) {
      setSelectedIds([]);
      setDockTab('inspector');
      setDockOpen(true);
    }
  }, []);

  // Clear Selection
  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectedWireId(null);
  }, []);

  // Delete Selected Components or Selected Wire
  const handleDeleteSelected = useCallback(() => {
    if (selectedWireId) {
      handleDeleteWire(selectedWireId);
      setSelectedWireId(null);
      return;
    }
    if (selectedIds.length === 0) {
      return;
    }
    pushHistory();
    setProjects((prevProjects) =>
      prevProjects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const remainingComps = p.components.filter((c) => !selectedIds.includes(c.id));
        const remainingWires = p.wires.filter(
          (w) => !selectedIds.includes(w.fromId) && !selectedIds.includes(w.toId)
        );
        return {
          ...p,
          components: remainingComps,
          wires: remainingWires,
          findings: evaluateErc(remainingComps, remainingWires),
        };
      })
    );
    setSelectedIds([]);
    setCircuitChangeCount((c) => c + 1);
  }, [pushHistory, selectedIds, activeProjectId, selectedWireId, handleDeleteWire]);

  // Rotate Selected Components
  const handleRotateSelected = useCallback(
    (deltaAngle: number = 90) => {
      if (selectedIds.length === 0) return;
      pushHistory();
      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            components: p.components.map((c) =>
              selectedIds.includes(c.id)
                ? { ...c, rotation: ((c.rotation || 0) + deltaAngle + 360) % 360 }
                : c
            ),
          };
        })
      );
      setCircuitChangeCount((c) => c + 1);
    },
    [selectedIds, pushHistory, activeProjectId]
  );

  // Nudge Selected Components (with Arrow Keys)
  const handleNudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0) return;
      pushHistory();
      setProjects((prevProjects) =>
        prevProjects.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            components: p.components.map((c) =>
              selectedIds.includes(c.id)
                ? { ...c, x: Math.max(20, c.x + dx), y: Math.max(20, c.y + dy) }
                : c
            ),
          };
        })
      );
    },
    [selectedIds, pushHistory, activeProjectId]
  );

  // Duplicate Selected Components (⌘D)
  const handleDuplicate = useCallback(() => {
    if (selectedIds.length === 0) return;
    pushHistory();
    const toDuplicate = currentProject.components.filter((c) => selectedIds.includes(c.id));
    const newComps: PlacedComponent[] = [];

    for (const comp of toDuplicate) {
      const meta = getPartMeta(comp.partId);
      const prefix = meta?.prefix || 'U';
      const count = currentProject.components.length + newComps.length + 1;
      const newId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      newComps.push({
        ...comp,
        id: newId,
        designator: `${prefix}${count}`,
        x: comp.x + 40,
        y: comp.y + 40,
      });
    }

    setProjects((prevProjects) =>
      prevProjects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const updated = [...p.components, ...newComps];
        return {
          ...p,
          components: updated,
          findings: evaluateErc(updated, p.wires),
        };
      })
    );
    setSelectedIds(newComps.map((c) => c.id));
    setCircuitChangeCount((c) => c + 1);
  }, [selectedIds, pushHistory, currentProject.components, activeProjectId]);

  // Select All Components (⌘A)
  const handleSelectAll = useCallback(() => {
    setSelectedIds(currentProject.components.map((c) => c.id));
  }, [currentProject.components]);

  // Toggle Simulation (⌘R)
  const handleToggleSimulation = useCallback(() => {
    setIsSimulating((prev) => !prev);
  }, []);

  // Persist circuit to backend (PATCH /v1/projects/:id)
  const persistCircuit = useCallback(
    async (projId: string, comps: PlacedComponent[], wires: WireConnection[], prog?: ProjectProgress) => {
      if (!isAuthenticated || !projId) return;
      try {
        setIsSaving(true);
        setSaveError(null);
        await api.updateProject(projId, {
          circuit_data: {
            v: 1,
            components: comps,
            wires: wires,
          },
          progress: prog || currentProject.progress || {},
        });
        lastSavedCircuitRef.current = JSON.stringify({
          components: comps,
          wires: wires,
          progress: prog || currentProject.progress || {},
        });
        setProjects((prev) =>
          prev.map((p) => (p.id === projId ? { ...p, updatedAt: 'Saved just now' } : p))
        );
        setSaveToast('Saved');
        setTimeout(() => setSaveToast(null), 1500);
      } catch (err: any) {
        const errorMsg = err instanceof ApiError ? err.message : (err?.message || 'Auto-save failed');
        setSaveError(errorMsg);
        setSaveToast(`Save failed: ${errorMsg}`);
        if (err instanceof ApiError && err.status === 401) {
          setIsAuthenticated(false);
        }
        setTimeout(() => setSaveToast(null), 3500);
      } finally {
        setIsSaving(false);
      }
    },
    [isAuthenticated, currentProject.progress]
  );

  // Debounced auto-save (1s) on circuit component / wire changes & local draft backup
  useEffect(() => {
    if (screen !== 'editor' || !activeProjectId) return;

    const circuitPayload = JSON.stringify({
      components: currentProject.components,
      wires: currentProject.wires,
      progress: currentProject.progress || {},
    });

    // Save offline draft to localStorage for instant recovery
    try {
      localStorage.setItem(`cm_draft_${activeProjectId}`, circuitPayload);
    } catch {
      // ignore quota
    }

    if (!isAuthenticated) return;
    if (circuitPayload === lastSavedCircuitRef.current) return;

    const timer = setTimeout(() => {
      lastSavedCircuitRef.current = circuitPayload;
      persistCircuit(activeProjectId, currentProject.components, currentProject.wires, currentProject.progress);
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentProject.components, currentProject.wires, currentProject.progress, activeProjectId, screen, isAuthenticated, persistCircuit]);

  // Save Project (⌘S)
  const handleSaveProject = useCallback(() => {
    if (isAuthenticated) {
      persistCircuit(activeProjectId, currentProject.components, currentProject.wires, currentProject.progress);
    } else {
      setProjects((prev) =>
        prev.map((p) => (p.id === activeProjectId ? { ...p, updatedAt: 'Saved just now' } : p))
      );
      setSaveToast(`Saved "${currentProject.name}"`);
      setTimeout(() => setSaveToast(null), 2500);
    }
  }, [activeProjectId, currentProject.components, currentProject.wires, currentProject.progress, currentProject.name, isAuthenticated, persistCircuit]);

  // Run ERC / Open Issues Tab (⌘E)
  const handleRunErc = useCallback(() => {
    setDockTab('erc');
    setDockOpen(true);
  }, []);

  // Quick action: Add Arduino Uno from Code tab empty state
  const handleAddArduino = useCallback(() => {
    handlePlaceComponent('arduino.uno', 280, 180);
    setDockTab('code');
  }, [handlePlaceComponent]);

  // ERC Click & Hover
  const handleErcClick = useCallback(
    (finding: ErcFinding) => {
      setHighlightedId(finding.anchorId);
      mentor.focusFinding(finding.id);
      setDockTab('mentor');
      setDockOpen(true);
      setTimeout(() => setHighlightedId(null), 3500);
    },
    [mentor]
  );

  const handleErcHover = useCallback((finding: ErcFinding | null) => {
    setHighlightedId(finding?.anchorId ?? null);
  }, []);

  // Centralized Keyboard Shortcut Handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      const inInput = isInputElement(e.target);

      // Global ⌘K / Ctrl+K (opens Command Palette everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Global ⌘S / Ctrl+S (save project everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
        return;
      }

      // Global Escape handling
      if (e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (shortcutsHelpOpen) {
          setShortcutsHelpOpen(false);
          return;
        }
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (selectedLibraryPart) {
          setSelectedLibraryPart(null);
          return;
        }
        if (selectedIds.length > 0) {
          setSelectedIds([]);
          return;
        }
        return;
      }

      // Input Focus Guard: Do NOT intercept typing in input fields!
      if (inInput) {
        return;
      }

      // Shortcuts Help Sheet (?)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsHelpOpen((prev) => !prev);
        return;
      }

      // The remaining shortcuts only apply when in the Editor screen
      if (screen !== 'editor') {
        return;
      }

      // Undo: ⌘Z (no Shift) / Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: ⌘⇧Z or Ctrl+Y
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (!navigator.userAgent.includes('Mac') && e.ctrlKey && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Duplicate: ⌘D / Ctrl+D (prevents bookmarking)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // Select All: ⌘A / Ctrl+A
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Rotate: [ (CCW -90) and ] (CW +90)
      if (e.key === '[') {
        e.preventDefault();
        handleRotateSelected(-90);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        handleRotateSelected(90);
        return;
      }

      // Run / Toggle Simulation: ⌘R / Ctrl+R (prevents browser reload)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleToggleSimulation();
        return;
      }

      // Run ERC: ⌘E / Ctrl+E (toggle issues dock)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (dockOpen && dockTab === 'erc') {
          setDockOpen(false);
        } else {
          setDockTab('erc');
          setDockOpen(true);
        }
        return;
      }

      // Toggle Right Dock: ⌘/ / Ctrl+/
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        if (dockOpen && dockTab === 'mentor') {
          setDockOpen(false);
        } else {
          setDockTab('mentor');
          setDockOpen(true);
        }
        return;
      }

      // Toggle Left Library: ⌘\ or ⌘B / Ctrl+\ or Ctrl+B
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        setLibraryOpen((prev) => !prev);
        return;
      }

      // Zoom In / Out / Reset / Fit
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cm-zoom-in'));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cm-zoom-out'));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cm-zoom-100'));
        return;
      }
      if (e.shiftKey && (e.key === '!' || e.key === '1')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cm-zoom-fit'));
        return;
      }

      // Arrow Key Nudging
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleNudgeSelected(0, e.shiftKey ? -50 : -20);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNudgeSelected(0, e.shiftKey ? 50 : 20);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleNudgeSelected(e.shiftKey ? -50 : -20, 0);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNudgeSelected(e.shiftKey ? 50 : 20, 0);
        return;
      }

      // Single-Key Tool Switches and Part Quick-Placement (no modifiers)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'v') {
          setActiveTool('select');
          return;
        }
        if (key === 'h') {
          // Pan tool toggle: press H once to activate Pan, press H again to return to Select
          setActiveTool((prev) => (prev === 'pan' ? 'select' : 'pan'));
          return;
        }
        if (key === 'w') {
          // Wire tool toggle: press W once to activate Wire, press W again to return to Select
          setActiveTool((prev) => (prev === 'wire' ? 'select' : 'wire'));
          return;
        }
        if (key === 'r') {
          setSelectedLibraryPart((prev) => (prev === 'resistor.axial' ? null : 'resistor.axial'));
          return;
        }
        if (key === 'l') {
          setSelectedLibraryPart((prev) => (prev === 'led.5mm.red' ? null : 'led.5mm.red'));
          return;
        }
        if (key === 'c') {
          setSelectedLibraryPart((prev) => (prev === 'capacitor.ceramic' ? null : 'capacitor.ceramic'));
          return;
        }
        if (key === 'b') {
          setSelectedLibraryPart((prev) => (prev === 'battery.9v' ? null : 'battery.9v'));
          return;
        }
        if (key === 'u') {
          setSelectedLibraryPart((prev) => (prev === 'mcu.arduino.nano' ? null : 'mcu.arduino.nano'));
          return;
        }
        if (key === 'g') {
          setSelectedLibraryPart((prev) => (prev === 'ground' ? null : 'ground'));
          return;
        }
        if (key === 'p') {
          setSelectedLibraryPart((prev) => (prev === 'pushbutton' ? null : 'pushbutton'));
          return;
        }
        if (key === 's') {
          setSelectedLibraryPart((prev) => (prev === 'switch.spst' ? null : 'switch.spst'));
          return;
        }
        if (key === 'j') {
          setSelectedLibraryPart((prev) => (prev === 'junction' ? null : 'junction'));
          return;
        }
      }
    },
    [
      shortcutsHelpOpen,
      commandPaletteOpen,
      selectedLibraryPart,
      selectedIds.length,
      screen,
      dockOpen,
      dockTab,
      handleSaveProject,
      handleUndo,
      handleRedo,
      handleDuplicate,
      handleSelectAll,
      handleDeleteSelected,
      handleRotateSelected,
      handleToggleSimulation,
      handleRunErc,
      handleNudgeSelected,
    ]
  );

  // Global window shortcut listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Loading splash on initial load if route indicates an authenticated view
  if (authLoading && (typeof window !== 'undefined' && (window.location.pathname.startsWith('/dashboard') || window.location.pathname.startsWith('/projects')))) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cm-void, #000)', color: 'var(--cm-text-secondary, #8A92A0)', fontFamily: 'sans-serif' }}>
        <p>Loading CircuitMentor...</p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={handleKeyDown} tabIndex={-1} className="app-root">
      {/* 1. Landing Page Screen */}
      {screen === 'landing' ? (
        <LandingPage
          onOpenApp={() => setScreen('dashboard')}
          onOpenEditor={() => setScreen('editor')}
          onOpenLogin={() => setScreen('login')}
          isAuthenticated={isAuthenticated}
        />
      ) : screen === 'login' ? (
        /* 2. Login Page Screen (shadcn login-03 pattern) */
        <LoginPage
          onNavigateHome={() => setScreen('landing')}
        />
      ) : screen === 'dashboard' ? (
        /* 3. Projects Dashboard Screen */
        <Dashboard
          projects={projects}
          isLoading={projectsLoading}
          error={projectsError}
          user={currentUser}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={() => setShortcutsHelpOpen(true)}
          onNavigateHome={() => setScreen('landing')}
          onLogout={handleLogout}
        />
      ) : (
        /* 4. Main Editor Shell */
        <div className="editor-shell">
          {/* Rail: Far-left Icon Bar (56px) */}
          <Rail
            active={activeTool === 'wire' ? 'wire' : activeRailItem}
            libraryOpen={libraryOpen}
            activeTool={activeTool}
            dockOpen={dockOpen}
            onOpenLanding={() => setScreen('landing')}
            onOpenProjects={() => setScreen('dashboard')}
            onToggleLibrary={() => {
              setLibraryOpen((prev) => !prev);
              setActiveRailItem('components');
            }}
            onToggleWireTool={() => {
              setActiveTool((prev) => (prev === 'wire' ? 'select' : 'wire'));
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPalette={() => setCommandPaletteOpen(true)}
            onOpenShortcuts={() => setShortcutsHelpOpen(true)}
            onToggleDock={() => setDockOpen((prev) => !prev)}
            onSelect={(item) => {
              if (item === 'landing') {
                setScreen('landing');
                return;
              }
              if (item === 'project') {
                setScreen('dashboard');
                return;
              }
              if (item === 'wire') {
                setActiveTool((prev) => (prev === 'wire' ? 'select' : 'wire'));
                return;
              }
              if (item === 'settings') {
                setSettingsOpen(true);
                return;
              }
              setActiveTool('select');
              setActiveRailItem(item);
              if (item === 'components') {
                setLibraryOpen((prev) => !prev);
              }
            }}
          />

          {/* Canvas: Full-bleed background (--void #000000) underlaying detached sidebars */}
          <Canvas
            components={currentProject.components}
            wires={currentProject.wires}
            selectedIds={selectedIds}
            highlightedId={highlightedId}
            findings={currentProject.findings}
            selectedLibraryPart={selectedLibraryPart}
            selectedWireId={selectedWireId}
            onSelectWire={handleSelectWire}
            onSelectComponent={handleSelectComponent}
            onClearSelection={handleClearSelection}
            onUpdateComponentPositions={handleUpdateComponentPositions}
            onUpdateComponent={handleUpdateComponent}
            onPlaceComponent={handlePlaceComponent}
            onAddWire={handleAddWire}
            onAddWireWithJunctions={handleAddWireWithJunctions}
            onDeleteWire={handleDeleteWire}
            onDeleteSelected={handleDeleteSelected}
            onClearSelectedLibraryPart={() => setSelectedLibraryPart(null)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            isSimulating={isSimulating}
            onToggleSimulation={handleToggleSimulation}
            onOpenErc={handleRunErc}
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            hintHighlight={mentor.activeHint?.hint.highlight ?? null}
            hintLevel={mentor.activeHint?.hint.level ?? 1}
            gridSnap={editorSettings.gridSnap}
            autoRouteWires={editorSettings.autoRouteWires}
            showPinLabels={editorSettings.showPinLabels}
            showGrid={editorSettings.showGrid}
          />

          {/* Component Library: Detached Glass Sidebar Card (280px) */}
          <Library
            className={`library-panel ${libraryOpen ? 'library-open' : 'library-closed'}`}
            selectedPart={selectedLibraryPart}
            onSelectPart={setSelectedLibraryPart}
          />

          {/* Right Dock: Detached Glass Sidebar Card (360px) */}
          <aside className={`dock ${dockOpen ? 'dock-open' : 'dock-closed'} ${dockTab === 'mentor' ? 'dock-mentor-active' : ''}`} aria-label="Inspector, Code and AI Mentor">
            {/* Skiper86 Apple AI Gradient Border when AI Mentor tab is active */}
            <AppleBorderGradient
              isActive={dockTab === 'mentor'}
              intensity="md"
              borderWidth={2}
            />

            {/* 4-Tab Bar: [ Properties | Code | AI Mentor | Issues (N) ] */}
            <Tabs
              value={dockTab}
              onValueChange={(val) => setDockTab(val as 'inspector' | 'code' | 'mentor' | 'erc')}
              className="flex flex-col h-full w-full min-h-0 relative z-10"
            >
              <div className="dock-tabs-container">
                <TabsList className="dock-tabs">
                  <TabsTrigger
                    value="inspector"
                    id="tab-properties"
                    aria-controls="panel-properties"
                    className={`dock-tab ${dockTab === 'inspector' ? 'active' : ''}`}
                  >
                    Properties
                  </TabsTrigger>
                  <TabsTrigger
                    value="code"
                    id="tab-code"
                    aria-controls="panel-code"
                    className={`dock-tab ${dockTab === 'code' ? 'active' : ''}`}
                  >
                    Code
                  </TabsTrigger>
                  <TabsTrigger
                    value="mentor"
                    id="tab-mentor"
                    aria-controls="panel-mentor"
                    className={`dock-tab ${dockTab === 'mentor' ? 'active dock-tab-mentor-active' : ''}`}
                  >
                    <span className={dockTab === 'mentor' ? 'apple-ai-text-gradient font-medium inline-flex items-center gap-1.5' : 'inline-flex items-center gap-1.5'}>
                      {dockTab === 'mentor' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#0071E3] via-[#2997FF] to-[#64D2FF] animate-pulse" />
                      )}
                      AI Mentor
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="erc"
                    id="tab-erc"
                    aria-controls="panel-erc"
                    className={`dock-tab ${dockTab === 'erc' ? 'active' : ''}`}
                  >
                    <span>Issues</span>
                    {currentProject.findings.length > 0 && (
                      <span className="dock-issues-badge" aria-label={`${currentProject.findings.length} issues`}>
                        {currentProject.findings.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Sliding 2px blue indicator bar across 4 tabs */}
                <div className={`dock-tab-slider tab-count-4 slider-${dockTab}`} />
              </div>

              {/* Dock Content Body */}
              <div
                className="dock-content"
                role="tabpanel"
                id={`panel-${dockTab}`}
                aria-labelledby={`tab-${dockTab}`}
              >
                <TabsContent value="inspector" className="m-0 h-full p-0 outline-none">
                  <Inspector
                    component={selectedComponent}
                    wires={currentProject.wires}
                    allComponents={currentProject.components}
                    onUpdateComponent={handleUpdateComponent}
                    selectedWire={selectedWire}
                    onDeleteWire={handleDeleteWire}
                    simResult={simResult}
                    isSimulating={isSimulating}
                  />
                </TabsContent>
                <TabsContent value="code" className="m-0 h-full p-0 outline-none">
                  <CodeEditor
                    components={currentProject.components}
                    onAddMcu={handleAddArduino}
                  />
                </TabsContent>
                <TabsContent value="erc" className="m-0 h-full p-0 outline-none">
                  <ErcFindings
                    findings={currentProject.findings}
                    onFindingClick={handleErcClick}
                    onFindingHover={handleErcHover}
                  />
                </TabsContent>
                <TabsContent value="mentor" className="m-0 h-full min-h-0 flex-1 p-0 outline-none overflow-hidden flex flex-col">
                  {/* Task Milestones Checklist Panel (active for learning path tasks) */}
                  {currentTask && (
                    <div className="task-milestone-panel">
                      <div className="task-milestone-header">
                        <div className="task-milestone-title-row">
                          <span className="task-milestone-title">{currentTask.title}</span>
                          <span className="task-milestone-count">
                            {currentTask.milestones.filter((m) => currentProject.progress?.milestones?.[m.id]).length} / {currentTask.milestones.length}
                          </span>
                        </div>
                        <div className="task-milestone-goal">{currentTask.goal}</div>
                      </div>

                      <div className="task-milestone-list">
                        {currentTask.milestones.map((m) => {
                          const isDone = !!currentProject.progress?.milestones?.[m.id];
                          return (
                            <div key={m.id} className={`task-milestone-item ${isDone ? 'done' : ''}`}>
                              <span className="task-milestone-check">{isDone ? '✓' : '○'}</span>
                              <div className="task-milestone-info">
                                <span className="task-milestone-label">{m.label}</span>
                                {m.hint && !isDone && (
                                  <span className="task-milestone-hint">{m.hint}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {currentTask.milestones.every((m) => currentProject.progress?.milestones?.[m.id]) && (
                        <div className="task-complete-banner">
                          ✓ Task Completed! All milestones satisfied.
                        </div>
                      )}
                    </div>
                  )}

                  <MentorDock
                    key={currentProject.id}
                    selectedComponent={selectedComponent}
                    selectedCount={selectedIds.length}
                    components={currentProject.components}
                    wires={currentProject.wires}
                    findings={currentProject.findings}
                    activeHint={mentor.activeHint}
                    activeFinding={mentor.activeFinding}
                    activeFindingState={mentor.activeFindingState}
                    activeUnlockedLevel={mentor.activeUnlockedLevel}
                    isStreaming={mentor.isStreaming}
                    streamError={mentor.streamError}
                    includeCircuitContext={mentor.includeCircuitContext}
                    onToggleCircuitContext={mentor.toggleCircuitContext}
                    messages={mentor.messages}
                    onWhatsWrong={mentor.handleWhatsWrong}
                    onHint={handleHintWithProgress}
                    onConceptQuestion={mentor.handleConceptQuestion}
                    onRetryConcept={mentor.handleRetryConcept}
                    onHighlightComponent={(id) => {
                      setHighlightedId(id);
                      setTimeout(() => setHighlightedId(null), 3500);
                    }}
                    onHighlightFinding={(finding) => {
                      mentor.focusFinding(finding.id);
                      setHighlightedId(finding.anchorId);
                      setTimeout(() => setHighlightedId(null), 3500);
                    }}
                    onClearHintOverlay={mentor.clearHintOverlay}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </aside>

          {/* Tablet/Mobile dock & library toggle triggers */}
          <div className="mobile-toggles">
            <button
              className={`mobile-toggle-btn ${libraryOpen ? 'active' : ''}`}
              onClick={() => setLibraryOpen((prev) => !prev)}
              aria-label="Toggle component library"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              className={`mobile-toggle-btn ${dockOpen ? 'active' : ''}`}
              onClick={() => setDockOpen((prev) => !prev)}
              aria-label="Toggle inspector dock"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Unsupported Screen Floor (< 768px) Notice */}
      <SmallScreenNotice />

      {/* Spotlight Command Palette (⌘K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        context={screen === 'dashboard' ? 'dashboard' : 'editor'}
        onSelectPart={(partId) => {
          setSelectedLibraryPart(partId);
          setScreen('editor');
        }}
        onSelectTool={setActiveTool}
        onRunSimulation={handleToggleSimulation}
        onRunErc={handleRunErc}
        onSaveProject={handleSaveProject}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomFit={() => {
          window.dispatchEvent(new CustomEvent('cm-zoom-fit'));
        }}
        onZoom100={() => {
          window.dispatchEvent(new CustomEvent('cm-zoom-100'));
        }}
        onToggleLibrary={() => setLibraryOpen((prev) => !prev)}
        onToggleInspector={() => setDockOpen((prev) => !prev)}
        onOpenMentor={() => {
          setDockTab('mentor');
          setDockOpen(true);
        }}
        onOpenShortcutsHelp={() => setShortcutsHelpOpen(true)}
        onNewProject={() => {
          handleCreateProject('Untitled Project');
        }}
        projects={projects}
        onOpenProject={(id) => handleOpenProject(id)}
        onCreateProject={() => handleCreateProject('New Project')}
        onNavigateHome={() => setScreen('landing')}
      />

      {/* Workspace Settings & Preferences Overlay (with blurred background) */}
      <SettingsModal
        open={settingsOpen}
        settings={editorSettings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setSettingsOpen(false)}
        onOpenShortcuts={() => setShortcutsHelpOpen(true)}
      />

      {/* Shortcuts Help Sheet (?) */}
      <ShortcutsHelpSheet
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />

      {/* Save Notification Toast */}
      {saveToast && (
        <div className={`cm-save-toast ${saveError ? 'save-error' : ''}`} role="status" aria-live="polite">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {saveError ? (
              <circle cx="12" cy="12" r="10" />
            ) : (
              <polyline points="20 6 9 17 4 12" />
            )}
          </svg>
          <span>{saveToast}</span>
        </div>
      )}
    </div>
  );
}
