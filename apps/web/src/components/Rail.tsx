import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CircuitMentorLogo } from '@/components/ui/CircuitMentorLogo';

interface RailProps {
  active?: string;
  onSelect?: (item: string) => void;
  libraryOpen?: boolean;
  activeTool?: 'select' | 'pan' | 'wire';
  dockOpen?: boolean;
  onToggleLibrary?: () => void;
  onToggleWireTool?: () => void;
  onOpenProjects?: () => void;
  onOpenLanding?: () => void;
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
  onOpenShortcuts?: () => void;
  onToggleDock?: () => void;
}

export default function Rail({
  active,
  onSelect,
  libraryOpen = false,
  activeTool = 'select',
  dockOpen = true,
  onToggleLibrary,
  onToggleWireTool,
  onOpenProjects,
  onOpenLanding: _onOpenLanding,
  onOpenSettings,
  onOpenPalette,
  onOpenShortcuts,
  onToggleDock,
}: RailProps) {
  const isComponentsActive = libraryOpen || active === 'components';
  const isWireActive = activeTool === 'wire' || active === 'wire';

  return (
    <TooltipProvider delayDuration={200}>
      <nav className="rail" aria-label="Main navigation">
        {/* Logo - click returns to Dashboard route */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="rail-logo cursor-pointer bg-transparent border-0 p-0 text-inherit hover:opacity-80 transition-opacity flex items-center justify-center"
              onClick={() => onOpenProjects ? onOpenProjects() : onSelect?.('project')}
              aria-label="Return to Dashboard"
            >
              <CircuitMentorLogo size={24} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Dashboard
          </TooltipContent>
        </Tooltip>

        {/* Project */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`rail-btn ${active === 'project' ? 'active' : ''}`}
              onClick={() => onOpenProjects ? onOpenProjects() : onSelect?.('project')}
              aria-label="Projects"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Projects Dashboard
          </TooltipContent>
        </Tooltip>

        {/* Components */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`rail-btn ${isComponentsActive ? 'active' : ''}`}
              onClick={() => onToggleLibrary ? onToggleLibrary() : onSelect?.('components')}
              aria-label="Component library"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Component Library (Ctrl+\)
          </TooltipContent>
        </Tooltip>

        {/* Wiring mode */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`rail-btn ${isWireActive ? 'active' : ''}`}
              onClick={() => onToggleWireTool ? onToggleWireTool() : onSelect?.('wire')}
              aria-label="Wiring tool"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20L12 12L20 4" />
                <circle cx="4" cy="20" r="2" />
                <circle cx="20" cy="4" r="2" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Wiring Mode (W)
          </TooltipContent>
        </Tooltip>

        <div className="rail-spacer" />

        {/* Command Palette Trigger */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="rail-btn"
              onClick={() => onOpenPalette?.()}
              aria-label="Command Palette"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Command Palette (⌘K)
          </TooltipContent>
        </Tooltip>

        {/* Keyboard Shortcuts Trigger */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="rail-btn"
              onClick={() => onOpenShortcuts?.()}
              aria-label="Keyboard Shortcuts"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Keyboard Shortcuts (?)
          </TooltipContent>
        </Tooltip>

        {/* Dock Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`rail-btn ${dockOpen ? 'active' : ''}`}
              onClick={() => onToggleDock?.()}
              aria-label="Toggle Dock Panel"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Toggle Panel Dock (⌘B)
          </TooltipContent>
        </Tooltip>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`rail-btn ${active === 'settings' ? 'active' : ''}`}
              onClick={() => onOpenSettings ? onOpenSettings() : onSelect?.('settings')}
              aria-label="Settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Settings & Preferences
          </TooltipContent>
        </Tooltip>
      </nav>
    </TooltipProvider>
  );
}
