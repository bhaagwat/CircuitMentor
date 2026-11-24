import { useState, useMemo, useEffect } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import type { PlacedComponent, ErcFinding } from '../App';
import type { UserProfile, ProjectProgress } from '@/lib/api';
import type { WireConnection } from './Canvas';
import { TASKS, type LearningTask } from '@/lib/learning/tasks';
import { CONCEPTS, type ConceptCard } from '@/lib/learning/concepts';
import { fadeUp, stagger, buttonTap } from '@/lib/motion';
import { useDashboardData } from '@/mocks/dashboard';

// Unified Minimal Logo
import CircuitMentorLogo from '@/components/ui/CircuitMentorLogo';

// shadcn UI Primitives
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@/components/ui/avatar';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Lucide Icons (consistent clean 1.5px stroke)
import {
  Plus,
  Search,
  CircuitBoard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  MoreVertical,
  Trash2,
  Copy,
  Edit3,
  BookOpen,
  GraduationCap,
  Activity,
  HelpCircle,
  LogOut,
  LayoutGrid,
  ListFilter,
  Zap,
  Check,
  FolderOpen,
  TrendingUp,
  Cpu,
  Settings,
  Flame,
  FileText,
} from 'lucide-react';

// Recharts for Data Visualizations
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

export interface ProjectData {
  id: string;
  name: string;
  updatedAt: string;
  components: PlacedComponent[];
  wires?: WireConnection[];
  findings: ErcFinding[];
  taskId?: string | null;
  progress?: ProjectProgress;
  goal?: string | null;
}

interface DashboardProps {
  projects: ProjectData[];
  isLoading?: boolean;
  error?: string | null;
  user?: UserProfile | null;
  onOpenProject: (projectId: string, options?: { openMentor?: boolean; findingId?: string }) => void;
  onCreateProject: (name: string, template?: string, taskId?: string) => void;
  onRenameProject?: (projectId: string, newName: string) => void;
  onDuplicateProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  onNavigateHome?: () => void;
  onLogout?: () => void;
}

// ── Smooth CountUp Animation Component ───────────────────────────────────────
function CountUp({
  value,
  duration = 0.8,
  decimals = 0,
}: {
  value: number;
  duration?: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }

    const startTime = performance.now();
    let frameId: number;

    const step = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const easeVal = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = easeVal * value;
      setDisplay(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setDisplay(value);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</>;
}

// ── Spotlight Card with Subtle Cursor-Tracking Glow ─────────────────────────
function SpotlightCard({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl border border-white/[0.08] bg-[#0C1017] transition-all duration-300 hover:border-white/[0.16] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

// ── Sparkline Miniature Trend Component ──────────────────────────────────────
function Sparkline({
  data,
  color = '#0071E3',
  height = 28,
  width = 68,
}: {
  data: { value: number }[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (!data || data.length < 2) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${points[0]} L ${points.join(' L ')} L ${width},${height} L 0,${height} Z`;
  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0 pointer-events-none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Radial Progress Ring for Curriculum Status ────────────────────────────────
function RadialProgress({
  value,
  size = 50,
  strokeWidth = 4.5,
  color = '#0071E3',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeVal = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (safeVal / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-[11px] font-mono font-semibold text-white">
        {Math.round(value)}%
      </span>
    </div>
  );
}

export default function Dashboard({
  projects,
  isLoading = false,
  error = null,
  user = null,
  onOpenProject,
  onCreateProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onOpenSettings,
  onOpenShortcuts,
  onNavigateHome: _onNavigateHome,
  onLogout,
}: DashboardProps) {
  // Mock Data & Visualizations
  const dashboardData = useDashboardData();

  // Top Tabs: Workbench | Learning Labs | Challenges
  const [activeTab, setActiveTab] = useState<'workbench' | 'learning-labs' | 'challenges'>('workbench');
  const [learningSubTab, setLearningSubTab] = useState<'roadmap' | 'rules-and-concepts'>('roadmap');

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'clean' | 'issues' | 'tasks'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');

  // Chart Series Toggle
  const [visibleSeries, setVisibleSeries] = useState<{ checks: boolean; nets: boolean }>({
    checks: true,
    nets: true,
  });

  // Modals & Overlays
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'blank' | 'led' | 'arduino'>('blank');

  const [deleteConfirmProj, setDeleteConfirmProj] = useState<ProjectData | null>(null);
  const [renameProj, setRenameProj] = useState<{ id: string; name: string } | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<ConceptCard | null>(null);

  // Keyboard Shortcuts (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Time-based Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const userName = user?.display_name || user?.email?.split('@')[0] || 'Learner';

  // Filtered & Sorted Projects
  const filteredProjects = useMemo(() => {
    let list = [...projects];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    if (filterMode === 'clean') {
      list = list.filter((p) => p.findings.length === 0);
    } else if (filterMode === 'issues') {
      list = list.filter((p) => p.findings.length > 0);
    } else if (filterMode === 'tasks') {
      list = list.filter((p) => Boolean(p.taskId));
    }

    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    return list;
  }, [projects, search, filterMode, sortBy]);

  // Most recent project for Continue Working hero card
  const continueProject = useMemo(() => {
    if (projects.length === 0) return null;
    return projects[0]!;
  }, [projects]);

  // Aggregate Metrics
  const progressMetrics = useMemo(() => {
    const taskProjects = projects.filter((p) => Boolean(p.taskId));
    const completedTasksCount = taskProjects.filter(
      (p) => Boolean(p.progress?.completed_at) || Object.values(p.progress?.milestones || {}).every(Boolean)
    ).length;

    let totalHintsUsed = 0;
    const ruleFrequencyMap: Record<string, number> = {};

    for (const p of projects) {
      totalHintsUsed += p.progress?.hints_used || 0;
      if (p.progress?.findings_seen) {
        for (const [rule, count] of Object.entries(p.progress.findings_seen)) {
          ruleFrequencyMap[rule] = (ruleFrequencyMap[rule] || 0) + (count || 1);
        }
      }
    }

    let topRepeatedRule: { ruleId: string; count: number } | null = null;
    for (const [ruleId, count] of Object.entries(ruleFrequencyMap)) {
      if (count >= 2 && (!topRepeatedRule || count > topRepeatedRule.count)) {
        topRepeatedRule = { ruleId, count };
      }
    }

    const cleanCircuitsCount = projects.filter((p) => p.findings.length === 0 && p.components.length > 0).length;
    const issueCircuitsCount = projects.filter((p) => p.findings.length > 0).length;

    // Total verification checks computed across sessions
    const totalChecks = dashboardData.activity.reduce((acc, curr) => acc + curr.ercChecks, 0);

    return {
      completedTasksCount,
      totalHintsUsed,
      totalChecks,
      topRepeatedRule,
      cleanCircuitsCount,
      issueCircuitsCount,
    };
  }, [projects, dashboardData.activity]);

  const handleStartTask = (task: LearningTask) => {
    const existing = projects.find((p) => p.taskId === task.id);
    if (existing) {
      onOpenProject(existing.id);
    } else {
      onCreateProject(task.title, undefined, task.id);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || 'Untitled Circuit';
    onCreateProject(name, selectedTemplate);
    setIsCreating(false);
    setNewProjectName('');
  };

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div id="dashboard-top" className="h-full w-full overflow-y-auto overflow-x-hidden bg-[#0A0B0E] text-[#F5F5F7] flex flex-col font-sans select-text scroll-smooth">
          {/* Skip-to-content accessibility link */}
          <a
            href="#main-dashboard-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#0071E3] focus:text-white focus:rounded-xl focus:shadow-lg focus:outline-none"
          >
            Skip to main content
          </a>

          {/* ── Sticky Apple-Glass Header (56px) ─────────────────────────────────── */}
          <header className="h-14 px-4 sm:px-8 bg-[rgba(10,11,14,0.85)] backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between shrink-0 gap-3 sm:gap-4 sticky top-0 z-40 transition-all">
            {/* Top faint blue highlight gradient */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#0071E3]/25 to-transparent pointer-events-none" />

            {/* Left: Brand with minimal logo - scrolls to top without circular navigation */}
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity select-none shrink-0"
              onClick={() => {
                const topElem = document.getElementById('dashboard-top');
                if (topElem) {
                  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                  topElem.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
                } else {
                  console.warn('[CircuitMentor Logo]: Target element #dashboard-top not found on Dashboard page. Falling back to window scroll.');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              title="Scroll to top of Dashboard"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const topElem = document.getElementById('dashboard-top');
                  topElem?.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              aria-label="Scroll to top of Dashboard"
            >
              <CircuitMentorLogo size={26} showText={false} />
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-white">CircuitMentor</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/10 text-[#86868B] bg-white/[0.03] hidden sm:inline-block">
                  Lab Bench
                </span>
              </div>
            </div>

            {/* Center: ⌘K Command Palette Search Trigger (No blue boundary) */}
            <div className="flex-1 max-w-md mx-2 relative">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Search projects, parts, or curriculum (Press Command K)"
                className="w-full flex items-center justify-between px-3 h-9 rounded-xl text-xs bg-[#12151B] border border-white/[0.08] text-[#86868B] hover:text-white hover:border-white/20 transition-all group outline-none"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Search className="w-3.5 h-3.5 text-[#86868B] group-hover:text-white transition-colors shrink-0" />
                  <span className="truncate">Search projects, curriculum, concepts...</span>
                </div>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[#181C24] border border-white/10 text-[#86868B]">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Right: Actions (Clean, minimal, no AI mentor, no sound cues) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Keyboard Shortcuts Overlay Trigger */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenShortcuts}
                    aria-label="Keyboard shortcuts reference (?)"
                    className="h-9 w-9 rounded-xl border border-white/[0.08] hover:border-white/20 flex items-center justify-center text-[#86868B] hover:text-white transition-colors bg-[#12151B] outline-none"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs bg-[#12151B] border-white/10">
                  Keyboard shortcuts (?)
                </TooltipContent>
              </Tooltip>

              {/* Lab Preferences / Settings Overlay Trigger */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label="Lab Settings & Preferences"
                    className="h-9 w-9 rounded-xl border border-white/[0.08] hover:border-white/20 flex items-center justify-center text-[#86868B] hover:text-white transition-colors bg-[#12151B] outline-none"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs bg-[#12151B] border-white/10">
                  Settings &amp; Preferences
                </TooltipContent>
              </Tooltip>

              {/* User Profile Dropdown Menu (No blue selection outline) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="User account menu"
                    className="h-9 px-2.5 rounded-xl flex items-center gap-2 text-xs font-normal hover:bg-[#181C24] border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer outline-none"
                  >
                    <Avatar className="h-5 w-5 border border-white/10 shrink-0">
                      {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={userName} />}
                      <AvatarFallback className="text-[10px] font-semibold bg-[#181C24] text-white">
                        {(userName[0] || 'U').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-[80px] sm:max-w-[110px] truncate text-white font-medium">{userName}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#0C1017] border-white/10 text-xs shadow-2xl">
                  <DropdownMenuLabel className="font-normal p-3 pb-2">
                    <div className="font-semibold text-sm text-white">{userName}</div>
                    <div className="text-[11px] text-[#86868B] truncate">{user?.email || 'Student Account'}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={onOpenSettings} className="gap-2 cursor-pointer py-2 text-white hover:bg-[#181C24]">
                    <Settings className="w-3.5 h-3.5 text-[#64D2FF]" />
                    <span>Lab Preferences</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenShortcuts} className="gap-2 cursor-pointer py-2 text-white hover:bg-[#181C24]">
                    <HelpCircle className="w-3.5 h-3.5 text-[#86868B]" />
                    <span>Shortcuts Reference</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  {onLogout && (
                    <DropdownMenuItem onClick={onLogout} className="gap-2 cursor-pointer py-2 text-red-400 hover:bg-red-500/10 focus:text-red-400">
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-5 bg-white/10 hidden sm:block" />

              {/* New Circuit Primary Button */}
              <motion.button
                whileTap={buttonTap}
                onClick={() => setIsCreating(true)}
                aria-label="Create a new circuit"
                className="btn-accent-blue h-9 px-4 text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Circuit</span>
              </motion.button>
            </div>
          </header>

          {/* ── Main Dashboard Workspace (Full Width, Centered, No Sidebar Rail) ───── */}
          <main
            id="main-dashboard-content"
            tabIndex={-1}
            className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8 pb-24 outline-none"
          >
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center justify-between">
                <span>Failed to sync projects: {error}</span>
              </div>
            )}

            {/* 1. Greeting and User Name in 2 SEPARATE LINES */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
            >
              <div>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.12]">
                  <span className="block text-[#86868B] font-medium">{greeting},</span>
                  <span className="block text-white mt-0.5">{userName}.</span>
                </h1>
                <p className="text-sm sm:text-base text-[#86868B] mt-3 max-w-2xl leading-relaxed">
                  Welcome to your interactive electronics lab. Pick up where you left off or tackle a learning challenge.
                </p>
              </div>
            </motion.div>

            {/* 2. Top-Level Tabs (Workbench | Learning Labs | Challenges) */}
            <div className="flex items-center gap-8 border-b border-white/[0.08] relative">
              <button
                type="button"
                onClick={() => setActiveTab('workbench')}
                className={`pb-3.5 pt-1 text-sm font-semibold transition-colors relative flex items-center gap-2 outline-none ${
                  activeTab === 'workbench' ? 'text-white' : 'text-[#86868B] hover:text-[#C7C7CC]'
                }`}
              >
                <CircuitBoard className="w-4 h-4 text-[#0071E3]" />
                <span>Workbench</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[#64D2FF]">
                  {projects.length}
                </span>
                {activeTab === 'workbench' && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 inset-x-0 h-[2px] bg-[#0071E3] rounded-full shadow-[0_0_8px_rgba(0,113,227,0.6)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('learning-labs')}
                className={`pb-3.5 pt-1 text-sm font-semibold transition-colors relative flex items-center gap-2 outline-none ${
                  activeTab === 'learning-labs' ? 'text-white' : 'text-[#86868B] hover:text-[#C7C7CC]'
                }`}
              >
                <GraduationCap className="w-4 h-4 text-[#64D2FF]" />
                <span>Learning Labs</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[#64D2FF]">
                  {progressMetrics.completedTasksCount}/{TASKS.length}
                </span>
                {activeTab === 'learning-labs' && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 inset-x-0 h-[2px] bg-[#0071E3] rounded-full shadow-[0_0_8px_rgba(0,113,227,0.6)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('challenges')}
                className={`pb-3.5 pt-1 text-sm font-semibold transition-colors relative flex items-center gap-2 outline-none ${
                  activeTab === 'challenges' ? 'text-white' : 'text-[#86868B] hover:text-[#C7C7CC]'
                }`}
              >
                <Flame className="w-4 h-4 text-[#FF9F0A]" />
                <span>Challenges</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[#FF9F0A]">
                  5
                </span>
                {activeTab === 'challenges' && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 inset-x-0 h-[2px] bg-[#0071E3] rounded-full shadow-[0_0_8px_rgba(0,113,227,0.6)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            </div>

            {/* ═════════════════════════════════════════════════════════════════
                TAB 1: WORKBENCH (Circuits, Charts, Projects Grid)
                ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'workbench' && (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="show"
                className="space-y-8"
              >
                {/* 3. Stat Row (4 Clean Cards with Sparklines & Radial Progress) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Stat Card 1: Total Circuits */}
                  <SpotlightCard className="p-5 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-xs font-medium text-[#86868B]">Total Circuits</span>
                      <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 text-[#0071E3]">
                        <CircuitBoard className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-white font-sans">
                          <CountUp value={projects.length} />
                        </div>
                        <p className="text-[11px] text-[#86868B] mt-1">
                          {filteredProjects.length} matching filters
                        </p>
                      </div>
                      <Sparkline data={dashboardData.sparklines.circuits} color="#0071E3" />
                    </div>
                  </SpotlightCard>

                  {/* Stat Card 2: ERC Rule Engine */}
                  <SpotlightCard className="p-5 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-xs font-medium text-[#86868B]">ERC Netlist Status</span>
                      <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 text-[#30D158]">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                          <span><CountUp value={progressMetrics.cleanCircuitsCount} /> Clean</span>
                        </div>
                        <div className="mt-1">
                          {progressMetrics.issueCircuitsCount > 0 ? (
                            <Badge variant="outline" className="text-[10px] text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10 py-0">
                              {progressMetrics.issueCircuitsCount} with hazards
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-[#30D158]">All nets pass validation</span>
                          )}
                        </div>
                      </div>
                      <Sparkline data={dashboardData.sparklines.clean} color="#30D158" />
                    </div>
                  </SpotlightCard>

                  {/* Stat Card 3: Curriculum Progress with Radial Ring */}
                  <SpotlightCard className="p-5 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-xs font-medium text-[#86868B]">Curriculum Mastery</span>
                      <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 text-[#64D2FF]">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-white font-sans">
                          <CountUp value={progressMetrics.completedTasksCount} /> / {TASKS.length}
                        </div>
                        <p className="text-[11px] text-[#86868B] mt-1">
                          Labs completed
                        </p>
                      </div>
                      <RadialProgress
                        value={(progressMetrics.completedTasksCount / TASKS.length) * 100}
                        color="#64D2FF"
                        size={52}
                      />
                    </div>
                  </SpotlightCard>

                  {/* Stat Card 4: Verification Engine Passes */}
                  <SpotlightCard className="p-5 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-xs font-medium text-[#86868B]">Verification Passes</span>
                      <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 text-[#64D2FF]">
                        <Activity className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <div className="text-3xl font-bold tracking-tight text-white font-sans">
                          <CountUp value={progressMetrics.totalChecks} />
                        </div>
                        <p className="text-[11px] text-[#86868B] mt-1">
                          Netlist validations run
                        </p>
                      </div>
                      <Sparkline data={dashboardData.sparklines.hints} color="#64D2FF" />
                    </div>
                  </SpotlightCard>
                </div>

                {/* 4. Continue Working Hero Card */}
                {continueProject && (
                  <motion.div variants={fadeUp}>
                    <SpotlightCard className="p-6 border-white/[0.12] bg-gradient-to-r from-[#0C1017] via-[#12151B] to-[#0C1017]">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        <div className="md:col-span-7 space-y-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#0071E3] font-semibold bg-[#0071E3]/10 border border-[#0071E3]/30 px-2.5 py-0.5 rounded-full">
                              Continue Working
                            </span>
                            {continueProject.findings.length > 0 ? (
                              <Badge variant="outline" className="gap-1.5 text-[11px] text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[200px]">{continueProject.findings[0]?.title || '1 Issue Detected'}</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1.5 text-[11px] text-[#30D158] border-[#30D158]/30 bg-[#30D158]/10">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Clean Netlist · ERC Verified</span>
                              </Badge>
                            )}
                          </div>

                          <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                              {continueProject.name}
                            </h2>
                            <p className="text-xs sm:text-sm text-[#86868B] mt-1 line-clamp-2 leading-relaxed">
                              {continueProject.goal ||
                                `${continueProject.components.length} components · ${continueProject.wires?.length || 0} wires · Last modified ${continueProject.updatedAt}`}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <motion.button
                              whileTap={buttonTap}
                              onClick={() => onOpenProject(continueProject.id)}
                              className="btn-accent-blue h-10 px-5 text-xs flex items-center gap-2"
                            >
                              <span>{continueProject.findings.length > 0 ? 'Resume & Debug' : 'Open Workspace'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </motion.button>
                          </div>
                        </div>

                        {/* Live Circuit Schematic Thumbnail */}
                        <div className="md:col-span-5 h-40 rounded-xl bg-[#05070A] border border-white/[0.08] relative overflow-hidden flex items-center justify-center p-3">
                          <svg viewBox="0 0 600 400" className="w-full h-full pointer-events-none">
                            {renderProjectMiniWires(continueProject)}
                            {continueProject.components.map((comp) => (
                              <g key={comp.id} transform={`translate(${comp.x}, ${comp.y})`}>
                                {renderMiniSymbol(comp.partId)}
                              </g>
                            ))}
                          </svg>
                          <div className="absolute bottom-2.5 right-2.5 text-[10px] font-mono text-[#86868B] bg-black/80 px-2 py-0.5 rounded-md border border-white/10">
                            {continueProject.components.length} parts · {continueProject.wires?.length || 0} wires
                          </div>
                        </div>
                      </div>
                    </SpotlightCard>
                  </motion.div>
                )}

                {/* 5. Verification Engine Activity Chart + Weekly Heatmap + Issue Bar */}
                <motion.div variants={fadeUp} className="space-y-4">
                  {/* Area Chart: Verification Engine Velocity */}
                  <Card className="bg-[#0C1017] border border-white/[0.08] p-5 sm:p-6 rounded-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#64D2FF]" />
                          <h3 className="text-sm font-semibold text-white">Verification Engine Activity</h3>
                        </div>
                        <p className="text-xs text-[#86868B] mt-0.5">
                          Real-time union-find netlist passes and node calculations over your recent sessions
                        </p>
                      </div>

                      {/* Interactive Series Toggle Legends */}
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleSeries((prev) => ({ ...prev, checks: !prev.checks }))
                          }
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all outline-none ${
                            visibleSeries.checks
                              ? 'border-[#64D2FF]/40 bg-[#64D2FF]/10 text-[#64D2FF]'
                              : 'border-white/10 text-[#86868B] opacity-50'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-[#64D2FF]" />
                          <span>ERC Checks</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setVisibleSeries((prev) => ({ ...prev, nets: !prev.nets }))
                          }
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all outline-none ${
                            visibleSeries.nets
                              ? 'border-[#0071E3]/40 bg-[#0071E3]/10 text-[#0071E3]'
                              : 'border-white/10 text-[#86868B] opacity-50'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-[#0071E3]" />
                          <span>Nets Solved</span>
                        </button>
                      </div>
                    </div>

                    <div className="h-48 w-full" role="img" aria-label="Verification Engine Activity Area Chart showing daily checks and solved nets">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dashboardData.activity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradientChecksApple" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#64D2FF" stopOpacity={0.32} />
                              <stop offset="95%" stopColor="#64D2FF" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradientNetsApple" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0071E3" stopOpacity={0.28} />
                              <stop offset="95%" stopColor="#0071E3" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="day" stroke="#6E6E73" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                          <YAxis stroke="#6E6E73" fontSize={11} tickLine={false} axisLine={false} />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: '#0C1017',
                              borderColor: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '12px',
                              color: '#F5F5F7',
                              fontSize: '11px',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                            }}
                          />
                          {visibleSeries.checks && (
                            <Area type="monotone" dataKey="ercChecks" name="ERC Checks" stroke="#64D2FF" strokeWidth={2} fillOpacity={1} fill="url(#gradientChecksApple)" />
                          )}
                          {visibleSeries.nets && (
                            <Area type="monotone" dataKey="netsSolved" name="Nets Solved" stroke="#0071E3" strokeWidth={2} fillOpacity={1} fill="url(#gradientNetsApple)" />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <table className="sr-only">
                      <caption>Verification Engine Activity by Day</caption>
                      <thead>
                        <tr><th>Day</th><th>ERC Checks</th><th>Nets Solved</th></tr>
                      </thead>
                      <tbody>
                        {dashboardData.activity.map((a) => (
                          <tr key={a.day}><td>{a.day}</td><td>{a.ercChecks}</td><td>{a.netsSolved}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>

                  {/* Lower Dual Charts: Weekly Activity Heatmap + ERC Issues by Type */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Weekly Activity Heatmap */}
                    <Card className="bg-[#0C1017] border border-white/[0.08] p-5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-2">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-[#0071E3]" />
                            <h4 className="text-sm font-semibold text-white">Session Activity Heatmap</h4>
                          </div>
                          <span className="text-[10px] font-mono text-[#86868B]">Past 4 Weeks</span>
                        </div>
                        <p className="text-xs text-[#86868B] mb-4">
                          Cadence of schematic modifications and electrical rule validations
                        </p>
                      </div>

                      {/* 7 x 4 Grid Matrix */}
                      <div className="space-y-1.5 py-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#86868B] pl-7 pb-1">
                          <span className="w-6 text-center">W1</span>
                          <span className="w-6 text-center">W2</span>
                          <span className="w-6 text-center">W3</span>
                          <span className="w-6 text-center">W4</span>
                        </div>

                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, dayIdx) => (
                          <div key={dayName} className="flex items-center gap-2">
                            <span className="w-6 text-[10px] font-mono text-[#86868B]">{dayName}</span>
                            <div className="flex items-center gap-1.5">
                              {[0, 1, 2, 3].map((weekIdx) => {
                                const cell = dashboardData.heatmap.find(
                                  (h) => h.weekIndex === weekIdx && h.dayOfWeek === dayIdx
                                );
                                const count = cell?.count ?? 0;
                                const bgColor =
                                  count === 0
                                    ? 'bg-white/[0.04]'
                                    : count < 5
                                    ? 'bg-[#0071E3]/25'
                                    : count < 15
                                    ? 'bg-[#0071E3]/55'
                                    : count < 25
                                    ? 'bg-[#0071E3]/85'
                                    : 'bg-[#64D2FF]';

                                return (
                                  <Tooltip key={`${weekIdx}-${dayIdx}`}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`w-6 h-4 rounded-[4px] border border-white/5 transition-transform hover:scale-110 cursor-pointer ${bgColor}`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent className="text-[10px] bg-[#141A24] border-white/10">
                                      {cell?.date}: {count} validations
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05] text-[10px] text-[#86868B]">
                        <span>Less activity</span>
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-[2px] bg-white/[0.04]" />
                          <span className="w-2.5 h-2.5 rounded-[2px] bg-[#0071E3]/25" />
                          <span className="w-2.5 h-2.5 rounded-[2px] bg-[#0071E3]/55" />
                          <span className="w-2.5 h-2.5 rounded-[2px] bg-[#0071E3]/85" />
                          <span className="w-2.5 h-2.5 rounded-[2px] bg-[#64D2FF]" />
                        </div>
                        <span>More activity</span>
                      </div>
                    </Card>

                    {/* ERC Issues by Type Horizontal Bar */}
                    <Card className="bg-[#0C1017] border border-white/[0.08] p-5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#0071E3]" />
                            <h4 className="text-sm font-semibold text-white">ERC Hazards by Type</h4>
                          </div>
                          <span className="text-[10px] font-mono text-[#86868B]">Union-Find Engine</span>
                        </div>
                        <p className="text-xs text-[#86868B] mb-2">
                          Common design oversights intercepted during automatic netlist verification
                        </p>
                      </div>

                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={dashboardData.issueStats}
                            layout="vertical"
                            margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                            <XAxis type="number" stroke="#6E6E73" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis dataKey="rule" type="category" stroke="#86868B" fontSize={10} width={95} tickLine={false} axisLine={false} />
                            <RechartsTooltip
                              contentStyle={{
                                backgroundColor: '#0C1017',
                                borderColor: 'rgba(255,255,255,0.12)',
                                borderRadius: '8px',
                                color: '#F5F5F7',
                                fontSize: '11px',
                              }}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                              {dashboardData.issueStats.map((entry, index) => (
                                <Cell key={`cell-issue-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05] text-[10px] text-[#86868B]">
                        <span>Top Error: <strong>Missing Resistor (42%)</strong></span>
                        <span className="text-[#64D2FF]">Real-time detection</span>
                      </div>
                    </Card>
                  </div>
                </motion.div>

                {/* 6. All Projects Grid / Table */}
                <motion.div variants={fadeUp} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-white">All Projects</h3>
                      {/* Filter Toggle Group */}
                      <div className="flex items-center gap-1 bg-[#12151B] border border-white/[0.08] p-0.5 rounded-xl text-xs">
                        <button
                          type="button"
                          onClick={() => setFilterMode('all')}
                          className={`px-3 py-1 rounded-lg transition-all outline-none ${
                            filterMode === 'all'
                              ? 'bg-[#181C24] text-white font-medium shadow-sm'
                              : 'text-[#86868B] hover:text-white'
                          }`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterMode('clean')}
                          className={`px-3 py-1 rounded-lg transition-all outline-none ${
                            filterMode === 'clean'
                              ? 'bg-[#181C24] text-white font-medium shadow-sm'
                              : 'text-[#86868B] hover:text-white'
                          }`}
                        >
                          Clean
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterMode('issues')}
                          className={`px-3 py-1 rounded-lg transition-all outline-none ${
                            filterMode === 'issues'
                              ? 'bg-[#181C24] text-white font-medium shadow-sm'
                              : 'text-[#86868B] hover:text-white'
                          }`}
                        >
                          With Issues
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterMode('tasks')}
                          className={`px-3 py-1 rounded-lg transition-all outline-none ${
                            filterMode === 'tasks'
                              ? 'bg-[#181C24] text-white font-medium shadow-sm'
                              : 'text-[#86868B] hover:text-white'
                          }`}
                        >
                          Challenges
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* Sort Select */}
                      <div className="w-36">
                        <Select value={sortBy} onValueChange={(val) => setSortBy(val as 'recent' | 'name')}>
                          <SelectTrigger className="h-8 rounded-xl bg-[#12151B] border-white/[0.08] outline-none">
                            <SelectValue placeholder="Sort" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0C1017] border-white/10">
                            <SelectItem value="recent">Sort by Recent</SelectItem>
                            <SelectItem value="name">Sort by Name</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* View Mode Toggle */}
                      <div className="flex items-center bg-[#12151B] border border-white/[0.08] rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-lg transition-all outline-none ${viewMode === 'grid' ? 'bg-[#181C24] text-white' : 'text-[#6E6E73] hover:text-white'}`}
                          title="Grid View"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('table')}
                          className={`p-1.5 rounded-lg transition-all outline-none ${viewMode === 'table' ? 'bg-[#181C24] text-white' : 'text-[#6E6E73] hover:text-white'}`}
                          title="Table View"
                        >
                          <ListFilter className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Projects Display */}
                  {isLoading ? (
                    <div className="py-20 text-center text-xs text-[#86868B]">
                      Loading circuit projects...
                    </div>
                  ) : filteredProjects.length === 0 ? (
                    <Card className="p-12 text-center bg-[#0C1017] border border-white/[0.08] rounded-2xl flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-2xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#86868B] mb-3">
                        <FolderOpen className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-semibold text-white">No circuits found</h4>
                      <p className="text-xs text-[#86868B] max-w-sm mt-1 mb-4">
                        {search ? `No projects match "${search}". Try adjusting your query.` : 'Start your first circuit design on a blank canvas or guided template.'}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSearch('');
                          setIsCreating(true);
                        }}
                        className="btn-accent-blue gap-2 h-10 px-4"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Circuit</span>
                      </Button>
                    </Card>
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredProjects.map((project) => {
                        const topFinding = project.findings[0];
                        const isTask = Boolean(project.taskId);

                        return (
                          <SpotlightCard
                            key={project.id}
                            onClick={() => onOpenProject(project.id)}
                            className="p-0 flex flex-col cursor-pointer group"
                          >
                            {/* Schematic Mini Preview Header */}
                            <div className="h-32 bg-[#05070A] border-b border-white/[0.08] relative flex items-center justify-center p-2 overflow-hidden">
                              <svg viewBox="0 0 600 400" className="w-full h-full pointer-events-none">
                                {renderProjectMiniWires(project)}
                                {project.components.map((comp) => (
                                  <g key={comp.id} transform={`translate(${comp.x}, ${comp.y})`}>
                                    {renderMiniSymbol(comp.partId)}
                                  </g>
                                ))}
                              </svg>

                              <div className="absolute top-2.5 right-2.5">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label="Project actions"
                                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                      className="h-7 w-7 rounded-lg bg-black/60 hover:bg-black/80 text-[#86868B] hover:text-white flex items-center justify-center border border-white/5 transition-colors outline-none"
                                    >
                                      <MoreVertical className="w-3.5 h-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40 bg-[#0C1017] border-white/10 text-xs">
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setRenameProj({ id: project.id, name: project.name });
                                      }}
                                      className="gap-2 cursor-pointer text-white hover:bg-[#141A24]"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>Rename</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onDuplicateProject?.(project.id);
                                      }}
                                      className="gap-2 cursor-pointer text-white hover:bg-[#141A24]"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Duplicate</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setDeleteConfirmProj(project);
                                      }}
                                      className="gap-2 cursor-pointer text-red-400 hover:bg-red-500/10 focus:text-red-400"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Delete</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-4 pb-2">
                              <h3 className="text-sm font-semibold truncate text-white group-hover:text-[#64D2FF] transition-colors">
                                {project.name}
                              </h3>
                              <p className="text-[11px] truncate text-[#86868B] mt-0.5">
                                {project.components.length} components · {project.wires?.length || 0} wires
                              </p>
                            </div>

                            {/* Card Footer */}
                            <div className="p-4 pt-2 mt-auto flex items-center justify-between border-t border-white/[0.05] text-[11px]">
                              {topFinding ? (
                                <Badge variant="outline" className="gap-1 text-[10px] text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10 py-0">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate max-w-[130px]">{topFinding.title}</span>
                                </Badge>
                              ) : isTask ? (
                                <Badge variant="outline" className="text-[10px] py-0 border-white/10 text-[#64D2FF] bg-[#64D2FF]/10">
                                  Task Circuit
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 text-[10px] text-[#30D158] border-[#30D158]/30 bg-[#30D158]/10 py-0">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Verified</span>
                                </Badge>
                              )}

                              <span className="text-[10px] font-mono text-[#6E6E73]">
                                {project.updatedAt}
                              </span>
                            </div>
                          </SpotlightCard>
                        );
                      })}
                    </div>
                  ) : (
                    /* Table View */
                    <Card className="bg-[#0C1017] border border-white/[0.08] rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader className="bg-[#12151B] border-b border-white/[0.08]">
                          <TableRow className="border-white/[0.08]">
                            <TableHead className="text-xs font-semibold text-[#86868B]">Circuit Name</TableHead>
                            <TableHead className="text-xs font-semibold text-[#86868B]">ERC Status</TableHead>
                            <TableHead className="text-xs font-semibold text-[#86868B]">Elements</TableHead>
                            <TableHead className="text-xs font-semibold text-[#86868B]">Last Modified</TableHead>
                            <TableHead className="text-xs font-semibold text-right text-[#86868B]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProjects.map((project) => {
                            const topFinding = project.findings[0];
                            return (
                              <TableRow
                                key={project.id}
                                className="border-white/[0.08] hover:bg-[#141A24]/60 cursor-pointer transition-colors"
                                onClick={() => onOpenProject(project.id)}
                              >
                                <TableCell className="font-medium text-xs text-white">
                                  <div className="flex items-center gap-2">
                                    <CircuitBoard className="w-3.5 h-3.5 text-[#0071E3]" />
                                    <span>{project.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {topFinding ? (
                                    <Badge variant="outline" className="text-[10px] gap-1 py-0 text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10">
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                      <span>{topFinding.title}</span>
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] gap-1 py-0 text-[#30D158] border-[#30D158]/30 bg-[#30D158]/10">
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Verified</span>
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-[#86868B] font-mono">
                                  {project.components.length} parts / {project.wires?.length || 0} wires
                                </TableCell>
                                <TableCell className="text-xs text-[#86868B] font-mono">
                                  {project.updatedAt}
                                </TableCell>
                                <TableCell className="text-right" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button type="button" className="h-7 w-7 rounded-lg hover:bg-white/10 text-[#86868B] inline-flex items-center justify-center outline-none">
                                        <MoreVertical className="w-3.5 h-3.5" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-36 bg-[#0C1017] border-white/10 text-xs">
                                      <DropdownMenuItem
                                        onClick={() => setRenameProj({ id: project.id, name: project.name })}
                                        className="gap-2 cursor-pointer text-white hover:bg-[#141A24]"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Rename</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => onDuplicateProject?.(project.id)}
                                        className="gap-2 cursor-pointer text-white hover:bg-[#141A24]"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Duplicate</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator className="bg-white/10" />
                                      <DropdownMenuItem
                                        onClick={() => setDeleteConfirmProj(project)}
                                        className="gap-2 cursor-pointer text-red-400 hover:bg-red-500/10 focus:text-red-400"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Delete</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Card>
                  )}
                </motion.div>
              </motion.div>
            )}

            {/* ═════════════════════════════════════════════════════════════════
                TAB 2: LEARNING LABS (Roadmap & Rules/Concepts)
                ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'learning-labs' && (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="show"
                className="space-y-6"
              >
                {/* Sub-Tabs Switcher: Roadmap vs Rules & Concepts */}
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2 bg-[#12151B] p-1 rounded-xl border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setLearningSubTab('roadmap')}
                      className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all outline-none ${
                        learningSubTab === 'roadmap'
                          ? 'bg-[#181C24] text-white shadow-sm border border-white/10'
                          : 'text-[#86868B] hover:text-white'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#0071E3]" />
                      <span>Roadmap</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#0071E3]/15 text-[#64D2FF] font-mono">
                        {progressMetrics.completedTasksCount}/{TASKS.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLearningSubTab('rules-and-concepts')}
                      className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all outline-none ${
                        learningSubTab === 'rules-and-concepts'
                          ? 'bg-[#181C24] text-white shadow-sm border border-white/10'
                          : 'text-[#86868B] hover:text-white'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5 text-[#64D2FF]" />
                      <span>Rules and Concepts</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.05] text-[#86868B] font-mono border border-white/10">
                        {Object.keys(CONCEPTS).length}
                      </span>
                    </button>
                  </div>

                  <div className="text-xs text-[#86868B] hidden sm:block">
                    {learningSubTab === 'roadmap'
                      ? 'Step-by-step interactive electronics curriculum'
                      : 'Physics models & deterministic rule definitions'}
                  </div>
                </div>

                {/* ── Sub-tab 1: ROADMAP ────────────────────────────────────── */}
                {learningSubTab === 'roadmap' && (
                  <div className="space-y-6">
                    {/* Learning Path Funnel Progression Banner */}
                    <SpotlightCard className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
                        <div>
                          <h3 className="text-base font-semibold text-white">Circuit Design Funnel Mastery</h3>
                          <p className="text-xs text-[#86868B] mt-1 max-w-xl leading-relaxed">
                            Progressive stages of mastery from schematic component placement to full DC simulator validation.
                          </p>
                        </div>
                        <div className="flex items-center gap-3 bg-[#181C24] p-3 rounded-xl border border-white/10 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-semibold text-white">
                              {progressMetrics.completedTasksCount} of {TASKS.length} Completed
                            </div>
                            <div className="text-[11px] text-[#64D2FF] font-mono">
                              {Math.round((progressMetrics.completedTasksCount / TASKS.length) * 100)}% Mastered
                            </div>
                          </div>
                          <div className="w-20">
                            <Progress value={(progressMetrics.completedTasksCount / TASKS.length) * 100} className="h-2" />
                          </div>
                        </div>
                      </div>

                      {/* Funnel Step Bars */}
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-4">
                        {dashboardData.funnel.map((step) => (
                          <div key={step.step} className="p-3 rounded-xl bg-[#05070A] border border-white/[0.06] space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-white truncate">{step.step}</span>
                              <span className="text-[#0071E3] font-mono">{step.pct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#0071E3] to-[#64D2FF] rounded-full transition-all duration-500"
                                style={{ width: `${step.pct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-[#86868B] truncate">{step.description}</p>
                          </div>
                        ))}
                      </div>
                    </SpotlightCard>

                    {/* 5 Milestone Tasks Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {TASKS.map((task, idx) => {
                        const matchedProject = projects.find((p) => p.taskId === task.id);
                        const isDone =
                          Boolean(matchedProject?.progress?.completed_at) ||
                          (matchedProject?.progress?.milestones &&
                            task.milestones.every((m) => matchedProject.progress?.milestones?.[m.id]));
                        const milestonesMet = matchedProject?.progress?.milestones
                          ? Object.values(matchedProject.progress.milestones).filter(Boolean).length
                          : 0;

                        return (
                          <SpotlightCard
                            key={task.id}
                            className={`p-5 flex flex-col justify-between ${
                              isDone ? 'border-[#30D158]/40 bg-[#30D158]/[0.02]' : ''
                            }`}
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-mono uppercase tracking-wider py-0 ${
                                    task.kind === 'build'
                                      ? 'text-[#0071E3] border-[#0071E3]/30 bg-[#0071E3]/10'
                                      : 'text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10'
                                  }`}
                                >
                                  {task.kind} {idx + 1}
                                </Badge>
                                <div className="flex items-center gap-1 text-[11px] text-[#86868B]">
                                  <Clock className="w-3 h-3" />
                                  <span>{task.minutes} min</span>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-semibold text-white leading-snug">
                                  {task.title}
                                </h4>
                                <p className="text-xs text-[#86868B] mt-1.5 leading-relaxed">
                                  {task.goal}
                                </p>
                              </div>

                              <div className="space-y-1.5 pt-1">
                                <div className="text-[11px] font-medium text-[#86868B]">Milestones:</div>
                                {task.milestones.map((m) => {
                                  const mDone = Boolean(matchedProject?.progress?.milestones?.[m.id]);
                                  return (
                                    <div key={m.id} className="flex items-center gap-2 text-xs text-white">
                                      <div
                                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border ${
                                          mDone
                                            ? 'bg-[#30D158]/20 border-[#30D158]/50 text-[#30D158]'
                                            : 'border-white/20 bg-[#141A24]'
                                        }`}
                                      >
                                        {mDone && <Check className="w-2.5 h-2.5" />}
                                      </div>
                                      <span className={`text-[11px] truncate ${mDone ? 'line-through text-[#86868B]' : 'text-white'}`}>
                                        {m.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="pt-4 mt-4 border-t border-white/[0.08] flex items-center justify-between">
                              <span className="text-[11px] text-[#86868B]">
                                {isDone ? 'Lab complete' : matchedProject ? `${milestonesMet}/${task.milestones.length} done` : 'Not started'}
                              </span>
                              <Button
                                size="sm"
                                onClick={() => handleStartTask(task)}
                                className={`h-8 px-3 text-xs font-semibold ${
                                  isDone
                                    ? 'border border-[#30D158]/30 text-[#30D158] bg-[#30D158]/10 hover:bg-[#30D158]/20 rounded-xl'
                                    : 'btn-accent-blue'
                                }`}
                              >
                                {isDone ? 'Review Lab' : matchedProject ? 'Continue →' : 'Start Lab →'}
                              </Button>
                            </div>
                          </SpotlightCard>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Sub-tab 2: RULES AND CONCEPTS ─────────────────────────── */}
                {learningSubTab === 'rules-and-concepts' && (
                  <div className="space-y-6">
                    {/* Diagnostic Rule Highlight */}
                    <SpotlightCard className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#64D2FF]" />
                            <h3 className="text-sm font-semibold text-white">Diagnostic ERC Patterns</h3>
                          </div>
                          <p className="text-xs text-[#86868B] max-w-2xl leading-relaxed">
                            {progressMetrics.topRepeatedRule ? (
                              <>
                                Frequently observed{' '}
                                <strong className="text-white">
                                  {CONCEPTS[progressMetrics.topRepeatedRule.ruleId]?.title || progressMetrics.topRepeatedRule.ruleId}
                                </strong>{' '}
                                across your circuits. Learn the physical model to prevent recurring faults.
                              </>
                            ) : (
                              'Deterministic electrical rules continuously verify circuit connectivity, short circuits, loop current limits, and polarity.'
                            )}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setSelectedConcept(CONCEPTS['LED_NO_RESISTOR']!)}
                          className="btn-accent-blue h-9 px-4 text-xs shrink-0"
                        >
                          <span>Browse Principles</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </div>
                    </SpotlightCard>

                    {/* Physics Curve vs Resistor Load Line Visual Graph */}
                    <Card className="bg-[#0C1017] border border-white/[0.08] p-5 sm:p-6 rounded-2xl">
                      <div className="flex items-center justify-between pb-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-[#64D2FF]" />
                          <h4 className="text-sm font-semibold text-white">Diode I-V Exponential Avalanche vs. Resistor Ohm Line</h4>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono text-[#64D2FF] border-[#64D2FF]/30">
                          Shockley Diode Physics
                        </Badge>
                      </div>
                      <p className="text-xs text-[#86868B] mb-4 leading-relaxed">
                        Visual proof of why LEDs burn out without a resistor: beyond the ~1.8V forward barrier, diode current spikes exponentially, while a series resistor constrains current linearly via I = V / R.
                      </p>

                      <div className="h-52 w-full" role="img" aria-label="Diode I-V Curve vs Resistor Current Graph">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dashboardData.diodeCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="v" stroke="#6E6E73" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                            <YAxis stroke="#6E6E73" fontSize={11} tickLine={false} axisLine={false} />
                            <RechartsTooltip
                              contentStyle={{
                                backgroundColor: '#0C1017',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                color: '#F5F5F7',
                                fontSize: '11px',
                              }}
                            />
                            <Line type="monotone" dataKey="diode_mA" name="LED Current (mA)" stroke="#FF453A" strokeWidth={2.2} dot={{ r: 3.5, fill: '#FF453A' }} />
                            <Line type="monotone" dataKey="resistor_mA" name="Resistor Current (mA)" stroke="#64D2FF" strokeWidth={2} dot={{ r: 3, fill: '#64D2FF' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05] text-[11px] text-[#86868B]">
                        <span className="flex items-center gap-1.5 text-red-400">
                          <span className="w-2 h-2 rounded-full bg-red-400" />
                          <span>Diode Avalanche (Hazardous without limit)</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-[#64D2FF]">
                          <span className="w-2 h-2 rounded-full bg-[#64D2FF]" />
                          <span>Resistor Linear Ohm Slope</span>
                        </span>
                      </div>
                    </Card>

                    {/* Core Electronics Concepts Grid */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">Electrical Rule Concepts</h4>
                        <span className="text-xs text-[#86868B]">Click any card to read explanation & formula</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.values(CONCEPTS).map((concept) => (
                          <SpotlightCard
                            key={concept.ruleId}
                            onClick={() => setSelectedConcept(concept)}
                            className="p-5 cursor-pointer space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono text-[#64D2FF] uppercase font-semibold">
                                {concept.ruleId}
                              </span>
                              <BookOpen className="w-3.5 h-3.5 text-[#86868B]" />
                            </div>
                            <div>
                              <h5 className="text-sm font-semibold text-white">{concept.title}</h5>
                              <p className="text-xs text-[#86868B] mt-1 line-clamp-2 leading-relaxed">
                                {concept.summary}
                              </p>
                            </div>
                            {concept.formula && (
                              <div className="px-2.5 py-1 rounded-lg bg-[#05070A] border border-white/10 text-[11px] font-mono text-[#64D2FF]">
                                {concept.formula}
                              </div>
                            )}
                          </SpotlightCard>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ═════════════════════════════════════════════════════════════════
                TAB 3: CHALLENGES (Guided Build & Debug Challenges)
                ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'challenges' && (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="show"
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div>
                    <h3 className="text-base font-semibold text-white">Interactive Guided Challenges</h3>
                    <p className="text-xs text-[#86868B] mt-1">
                      Targeted circuit problems designed to develop rapid diagnostic instincts for short circuits, component tolerances, and control switches.
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit text-xs font-mono text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10">
                    5 Engineering Labs
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {TASKS.map((task, idx) => {
                    const matchedProject = projects.find((p) => p.taskId === task.id);
                    const isDone =
                      Boolean(matchedProject?.progress?.completed_at) ||
                      (matchedProject?.progress?.milestones &&
                        task.milestones.every((m) => matchedProject.progress?.milestones?.[m.id]));

                    return (
                      <SpotlightCard key={task.id} className="p-5 flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono uppercase tracking-wider py-0 ${
                                task.kind === 'build'
                                  ? 'text-[#0071E3] border-[#0071E3]/30 bg-[#0071E3]/10'
                                  : 'text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10'
                              }`}
                            >
                              {task.kind} Challenge {idx + 1}
                            </Badge>
                            <span className="text-[11px] text-[#86868B] font-mono">{task.minutes} min</span>
                          </div>

                          <div>
                            <h4 className="text-sm font-semibold text-white">{task.title}</h4>
                            <p className="text-xs text-[#86868B] mt-1.5 leading-relaxed">{task.goal}</p>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <div className="text-[11px] font-medium text-[#86868B]">Objectives:</div>
                            {task.milestones.map((m) => (
                              <div key={m.id} className="flex items-center gap-2 text-xs text-white">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3]" />
                                <span className="text-[11.5px] truncate text-[#F5F5F7]">{m.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="pt-4 mt-4 border-t border-white/[0.08] flex items-center justify-between">
                          <span className="text-[11px] text-[#86868B]">
                            {isDone ? 'Completed' : matchedProject ? 'In Progress' : 'Not Started'}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleStartTask(task)}
                            className={`h-8 px-3 text-xs font-semibold ${
                              isDone
                                ? 'border border-[#30D158]/30 text-[#30D158] bg-[#30D158]/10 hover:bg-[#30D158]/20 rounded-xl'
                                : 'btn-accent-blue'
                            }`}
                          >
                            {isDone ? 'Review' : matchedProject ? 'Continue →' : 'Launch →'}
                          </Button>
                        </div>
                      </SpotlightCard>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </main>

          {/* ── ⌘K Command Dialog Palette (No blue outline) ───────────────────────── */}
          <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
            <CommandInput placeholder="Search projects, tasks, electrical concepts..." />
            <CommandList className="max-h-80 overflow-y-auto">
              <CommandEmpty>No matching results found.</CommandEmpty>

              <CommandGroup heading="Circuit Projects">
                {projects.slice(0, 5).map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => {
                      setCommandPaletteOpen(false);
                      onOpenProject(p.id);
                    }}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <CircuitBoard className="w-3.5 h-3.5 text-[#0071E3]" />
                      <span>{p.name}</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] font-mono">{p.components.length} parts</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Learning Labs & Challenges">
                {TASKS.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.title}
                    onSelect={() => {
                      setCommandPaletteOpen(false);
                      handleStartTask(t);
                    }}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-3.5 h-3.5 text-[#64D2FF]" />
                      <span>{t.title}</span>
                    </div>
                    <span className="text-[10px] text-[#86868B]">{t.minutes} min</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Concepts & Rules">
                {Object.values(CONCEPTS).map((c) => (
                  <CommandItem
                    key={c.ruleId}
                    value={c.title}
                    onSelect={() => {
                      setCommandPaletteOpen(false);
                      setSelectedConcept(c);
                    }}
                    className="flex items-center gap-2 py-2 text-xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#30D158]" />
                    <span>{c.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Quick Actions">
                <CommandItem
                  value="new circuit"
                  onSelect={() => {
                    setCommandPaletteOpen(false);
                    setIsCreating(true);
                  }}
                  className="flex items-center gap-2 py-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-[#0071E3]" />
                  <span>Create New Circuit</span>
                </CommandItem>
                <CommandItem
                  value="preferences"
                  onSelect={() => {
                    setCommandPaletteOpen(false);
                    onOpenSettings?.();
                  }}
                  className="flex items-center gap-2 py-2 text-xs"
                >
                  <Settings className="w-3.5 h-3.5 text-[#86868B]" />
                  <span>Open Lab Preferences</span>
                </CommandItem>
                <CommandItem
                  value="shortcuts"
                  onSelect={() => {
                    setCommandPaletteOpen(false);
                    onOpenShortcuts?.();
                  }}
                  className="flex items-center gap-2 py-2 text-xs"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-[#86868B]" />
                  <span>View Keyboard Shortcuts</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>

          {/* ── New Project Modal ─────────────────────────────────────────────────── */}
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogContent className="sm:max-w-[480px] bg-[#0C1017] border-white/10 text-[#F5F5F7] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold text-white">New Circuit Project</DialogTitle>
                <DialogDescription className="text-xs text-[#86868B]">
                  Name your project and select an initial circuit topology.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="proj-name-input" className="text-xs font-semibold text-white">
                    Project Name
                  </label>
                  <Input
                    id="proj-name-input"
                    type="text"
                    placeholder="e.g. 555 Astable Multivibrator"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    autoFocus
                    className="h-10 rounded-xl text-xs bg-[#181C24] border-white/10 text-white placeholder:text-[#6E6E73] outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-white">Starter Topology</span>
                  <div className="space-y-2">
                    {/* Blank Canvas */}
                    <div
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedTemplate === 'blank'
                          ? 'border-[#0071E3] bg-[#0071E3]/10'
                          : 'border-white/10 bg-[#181C24] hover:border-white/20'
                      }`}
                      onClick={() => setSelectedTemplate('blank')}
                    >
                      <div className="flex items-center gap-3">
                        <CircuitBoard className="w-4 h-4 text-[#86868B]" />
                        <div>
                          <div className="text-xs font-semibold text-white">Blank Canvas</div>
                          <div className="text-[11px] text-[#86868B]">Empty workspace for discrete or breadboard circuits.</div>
                        </div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selectedTemplate === 'blank' ? 'border-[#0071E3] bg-[#0071E3]' : 'border-white/20'}`}>
                        {selectedTemplate === 'blank' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    {/* LED Current Limiter */}
                    <div
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedTemplate === 'led'
                          ? 'border-[#0071E3] bg-[#0071E3]/10'
                          : 'border-white/10 bg-[#181C24] hover:border-white/20'
                      }`}
                      onClick={() => setSelectedTemplate('led')}
                    >
                      <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-[#FF9F0A]" />
                        <div>
                          <div className="text-xs font-semibold text-white">LED Current Limiter Lab</div>
                          <div className="text-[11px] text-[#86868B]">9V battery, 470Ω resistor, and 5mm LED.</div>
                        </div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selectedTemplate === 'led' ? 'border-[#0071E3] bg-[#0071E3]' : 'border-white/20'}`}>
                        {selectedTemplate === 'led' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    {/* Arduino Uno */}
                    <div
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedTemplate === 'arduino'
                          ? 'border-[#0071E3] bg-[#0071E3]/10'
                          : 'border-white/10 bg-[#181C24] hover:border-white/20'
                      }`}
                      onClick={() => setSelectedTemplate('arduino')}
                    >
                      <div className="flex items-center gap-3">
                        <Cpu className="w-4 h-4 text-[#64D2FF]" />
                        <div>
                          <div className="text-xs font-semibold text-white">Arduino Uno + Ultrasonic</div>
                          <div className="text-[11px] text-[#86868B]">ATmega328P microcontroller with distance sensor & servo.</div>
                        </div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selectedTemplate === 'arduino' ? 'border-[#0071E3] bg-[#0071E3]' : 'border-white/20'}`}>
                        {selectedTemplate === 'arduino' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsCreating(false)} className="rounded-xl border-white/10 text-[#86868B] hover:text-white">
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="btn-accent-blue">
                    Create Project
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* ── Concept Details Dialog ────────────────────────────────────────────── */}
          {selectedConcept && (
            <Dialog open={Boolean(selectedConcept)} onOpenChange={() => setSelectedConcept(null)}>
              <DialogContent className="sm:max-w-[500px] bg-[#0C1017] border-white/10 text-[#F5F5F7] rounded-2xl">
                <DialogHeader>
                  <Badge variant="outline" className="w-fit text-[10px] font-mono text-[#64D2FF] border-[#64D2FF]/30">
                    {selectedConcept.ruleId}
                  </Badge>
                  <DialogTitle className="text-base font-semibold mt-1 text-white">{selectedConcept.title}</DialogTitle>
                  <DialogDescription className="text-xs text-[#86868B] mt-1">
                    {selectedConcept.summary}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2 text-xs">
                  <p className="text-white leading-relaxed">{selectedConcept.explanation}</p>
                  {selectedConcept.formula && (
                    <div className="p-3 rounded-xl bg-[#141A24] border border-white/10 font-mono text-xs text-[#64D2FF]">
                      {selectedConcept.formula}
                    </div>
                  )}
                  <div className="p-3.5 rounded-xl bg-[#64D2FF]/10 border border-[#64D2FF]/30 text-xs text-[#F5F5F7]">
                    <strong className="text-[#64D2FF]">Key Takeaway:</strong> {selectedConcept.takeaway}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={() => setSelectedConcept(null)} className="btn-accent-blue">
                    Understood
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* ── Delete Confirmation Dialog ────────────────────────────────────────── */}
          {deleteConfirmProj && (
            <Dialog open={Boolean(deleteConfirmProj)} onOpenChange={() => setDeleteConfirmProj(null)}>
              <DialogContent className="sm:max-w-[400px] bg-[#0C1017] border-white/10 text-[#F5F5F7] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold text-white">Delete Project?</DialogTitle>
                  <DialogDescription className="text-xs text-[#86868B]">
                    Are you sure you want to delete "{deleteConfirmProj.name}"? This action permanently removes the schematic.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 pt-3">
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirmProj(null)} className="rounded-xl border-white/10 text-[#86868B]">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-xl"
                    onClick={() => {
                      onDeleteProject?.(deleteConfirmProj.id);
                      setDeleteConfirmProj(null);
                    }}
                  >
                    Delete Circuit
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* ── Rename Dialog ─────────────────────────────────────────────────────── */}
          {renameProj && (
            <Dialog open={Boolean(renameProj)} onOpenChange={() => setRenameProj(null)}>
              <DialogContent className="sm:max-w-[400px] bg-[#0C1017] border-white/10 text-[#F5F5F7] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold text-white">Rename Project</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renameProj.name.trim()) {
                      onRenameProject?.(renameProj.id, renameProj.name.trim());
                      setRenameProj(null);
                    }
                  }}
                  className="space-y-3 pt-2"
                >
                  <Input
                    type="text"
                    value={renameProj.name}
                    onChange={(e) => setRenameProj({ ...renameProj, name: e.target.value })}
                    autoFocus
                    className="h-10 rounded-xl text-xs bg-[#181C24] border-white/10 text-white outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setRenameProj(null)} className="rounded-xl border-white/10 text-[#86868B]">
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" className="btn-accent-blue">
                      Save
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}

// ── Miniature Schematic Symbol Renderers for Project Card Thumbnails ──────────

function renderMiniSymbol(partId: string) {
  switch (partId) {
    case 'resistor.axial':
      return (
        <path
          d="M -24,0 L -14,0 L -10,-6 L -5,6 L 0,-6 L 5,6 L 10,-6 L 14,0 L 24,0"
          fill="none"
          stroke="#F5F5F7"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      );
    case 'led.5mm.red':
      return (
        <g stroke="#F5F5F7" strokeWidth="1.5" fill="none">
          <polygon points="-6,-8 -6,8 8,0" />
          <line x1="8" y1="-8" x2="8" y2="8" />
          <line x1="-16" y1="0" x2="-6" y2="0" />
          <line x1="8" y1="0" x2="18" y2="0" />
          <line x1="2" y1="-10" x2="9" y2="-15" stroke="#FF453A" strokeWidth="1.2" />
        </g>
      );
    case 'battery.9v':
      return (
        <g stroke="#F5F5F7" strokeWidth="1.5" fill="none">
          <line x1="0" y1="-16" x2="0" y2="-6" />
          <line x1="-10" y1="-6" x2="10" y2="-6" strokeWidth="2.5" />
          <line x1="-5" y1="-1" x2="5" y2="-1" />
          <line x1="-10" y1="4" x2="10" y2="4" strokeWidth="2.5" />
          <line x1="-5" y1="9" x2="5" y2="9" />
          <line x1="0" y1="9" x2="0" y2="16" />
        </g>
      );
    case 'ground':
      return (
        <g stroke="#F5F5F7" strokeWidth="1.5" fill="none">
          <line x1="0" y1="-10" x2="0" y2="0" />
          <line x1="-10" y1="0" x2="10" y2="0" />
          <line x1="-6" y1="4" x2="6" y2="4" />
          <line x1="-2" y1="8" x2="2" y2="8" />
        </g>
      );
    case 'arduino.uno':
      return (
        <g stroke="#F5F5F7" strokeWidth="1.5" fill="none">
          <rect x="-24" y="-18" width="48" height="36" rx="3" />
          <rect x="-16" y="-12" width="10" height="8" fill="#141A24" stroke="#0071E3" />
          <text x="0" y="6" textAnchor="middle" fill="#0071E3" fontSize="7" fontFamily="monospace">UNO</text>
        </g>
      );
    case 'pushbutton':
    case 'switch.spst':
      return (
        <g stroke="#F5F5F7" strokeWidth="1.5" fill="none">
          <line x1="-16" y1="0" x2="-6" y2="0" />
          <line x1="-6" y1="0" x2="6" y2="-8" />
          <line x1="6" y1="0" x2="16" y2="0" />
        </g>
      );
    default:
      return (
        <rect x="-18" y="-14" width="36" height="28" rx="2" fill="none" stroke="#F5F5F7" strokeWidth="1.5" />
      );
  }
}

function renderProjectMiniWires(project: ProjectData) {
  if (project.components.length < 2) return null;
  return (
    <g fill="none" strokeWidth="2" strokeLinecap="round">
      <path d="M 120,180 L 120,120 L 270,120" stroke="#FF453A" />
      <path d="M 330,120 L 460,120" stroke="#64D2FF" />
      <path d="M 504,120 L 550,120 L 550,320 L 300,320" stroke="#30D158" />
      <path d="M 120,220 L 120,320 L 300,320" stroke="#30D158" />
    </g>
  );
}
