import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Keyboard, RotateCcw, Sliders } from 'lucide-react';

export interface EditorSettings {
  gridSnap: 1 | 5 | 10 | 20;
  autoRouteWires: boolean;
  showPinLabels: boolean;
  showGrid: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  gridSnap: 10,
  autoRouteWires: true,
  showPinLabels: true,
  showGrid: true,
};

interface SettingsModalProps {
  open: boolean;
  settings: EditorSettings;
  onUpdateSettings: (next: EditorSettings) => void;
  onClose: () => void;
  onOpenShortcuts: () => void;
}

export default function SettingsModal({
  open,
  settings,
  onUpdateSettings,
  onClose,
  onOpenShortcuts,
}: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg bg-[var(--cm-panel)] border-[var(--cm-line-strong)] text-[var(--cm-text)] p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--cm-line)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--cm-blue)]/15 border border-[var(--cm-blue)]/30 text-[var(--cm-blue)] flex items-center justify-center shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-[var(--cm-text)]">Settings &amp; Preferences</DialogTitle>
              <DialogDescription className="text-xs text-[var(--cm-text-secondary)] mt-0.5">
                Configure schematic canvas, routing, and grid behavior
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Grid Snap Pitch */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-[var(--cm-text)]">Snap Grid Pitch</label>
              <p className="text-xs text-[var(--cm-text-secondary)]">Step resolution when placing or moving components</p>
            </div>
            <ToggleGroup
              type="single"
              value={settings.gridSnap.toString()}
              onValueChange={(val) => {
                if (val) {
                  onUpdateSettings({ ...settings, gridSnap: Number(val) as 1 | 5 | 10 | 20 });
                }
              }}
              className="bg-[var(--cm-raised)] p-0.5 rounded-lg border border-[var(--cm-line)]"
            >
              {[
                { val: '1', label: 'Free' },
                { val: '5', label: '5 px' },
                { val: '10', label: '10 px' },
                { val: '20', label: '20 px' },
              ].map((opt) => (
                <ToggleGroupItem
                  key={opt.val}
                  value={opt.val}
                  size="sm"
                  className="text-xs px-2.5 h-7 data-[state=on]:bg-[var(--cm-blue)] data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md transition-all font-mono"
                >
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Separator className="bg-[var(--cm-line)]" />

          {/* Orthogonal Auto-Router */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-[var(--cm-text)]">Auto-Route Schematic Wires</label>
              <p className="text-xs text-[var(--cm-text-secondary)]">
                Orthogonal Manhattan routing around parts with collision-free lanes
              </p>
            </div>
            <Switch
              checked={settings.autoRouteWires}
              onCheckedChange={(checked) =>
                onUpdateSettings({ ...settings, autoRouteWires: checked })
              }
            />
          </div>

          <Separator className="bg-[var(--cm-line)]" />

          {/* Show Pin Labels */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-[var(--cm-text)]">Pin Callouts</label>
              <p className="text-xs text-[var(--cm-text-secondary)]">
                Display terminal roles (+, −, Anode, Cathode, Wiper) on hover &amp; wire mode
              </p>
            </div>
            <Switch
              checked={settings.showPinLabels}
              onCheckedChange={(checked) =>
                onUpdateSettings({ ...settings, showPinLabels: checked })
              }
            />
          </div>

          <Separator className="bg-[var(--cm-line)]" />

          {/* Show Canvas Dot Grid */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-[var(--cm-text)]">Dot Matrix Grid</label>
              <p className="text-xs text-[var(--cm-text-secondary)]">Major and minor alignment dots across the canvas</p>
            </div>
            <Switch
              checked={settings.showGrid}
              onCheckedChange={(checked) =>
                onUpdateSettings({ ...settings, showGrid: checked })
              }
            />
          </div>

          <Separator className="bg-[var(--cm-line)]" />

          {/* Shortcuts Quick Link */}
          <div className="flex items-center justify-between gap-4 bg-[var(--cm-raised)]/60 p-3 rounded-lg border border-[var(--cm-line)]">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--cm-text)]">
                <Keyboard className="w-3.5 h-3.5 text-[var(--cm-blue)]" />
                <span>Keyboard Shortcuts</span>
              </div>
              <p className="text-xs text-[var(--cm-text-secondary)]">Quickly navigate the editor with single-key shortcuts</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 border-[var(--cm-line)]"
              onClick={() => {
                onClose();
                onOpenShortcuts();
              }}
            >
              View Shortcuts (?)
            </Button>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 bg-[var(--cm-raised)]/40 border-t border-[var(--cm-line)] flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5 text-[var(--cm-text-secondary)] hover:text-[var(--cm-text)]"
            onClick={() => onUpdateSettings(DEFAULT_EDITOR_SETTINGS)}
          >
            <RotateCcw className="w-3 h-3" />
            Reset Defaults
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="text-xs px-4"
            onClick={onClose}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
