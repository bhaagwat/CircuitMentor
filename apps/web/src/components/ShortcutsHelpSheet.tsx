import { useState, useMemo } from 'react';
import { SHORTCUTS, isMac, type ShortcutItem } from '@/lib/shortcuts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Keyboard } from 'lucide-react';

interface ShortcutsHelpSheetProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = ['Palette', 'Tools', 'Quick-Place', 'Editing', 'View', 'Actions'] as const;

export default function ShortcutsHelpSheet({ open, onClose }: ShortcutsHelpSheetProps) {
  const [search, setSearch] = useState('');

  const filteredShortcuts = useMemo(() => {
    if (!search.trim()) return SHORTCUTS;
    const q = search.toLowerCase().trim();
    return SHORTCUTS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.keys.mac.toLowerCase().includes(q) ||
        s.keys.win.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ShortcutItem[]>();
    for (const cat of CATEGORIES) {
      const items = filteredShortcuts.filter((s) => s.category === cat);
      if (items.length > 0) {
        map.set(cat, items);
      }
    }
    return map;
  }, [filteredShortcuts]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-xl bg-[#0C1017] border-white/10 text-[#F5F5F7] p-0 overflow-hidden shadow-2xl rounded-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-white/[0.08] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 text-white flex items-center justify-center shrink-0">
                <Keyboard className="w-4 h-4 text-[#64D2FF]" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">Keyboard Shortcuts</DialogTitle>
                <DialogDescription className="text-xs text-[#86868B] mt-0.5">
                  Navigate and build without touching the mouse
                </DialogDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5 border-white/10 text-[#86868B] bg-white/[0.03]">
              {isMac ? 'macOS (⌘)' : 'Win / Linux (Ctrl)'}
            </Badge>
          </div>

          <div className="relative pt-1">
            <Search className="w-3.5 h-3.5 text-[#6E6E73] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none mt-0.5" />
            <Input
              type="search"
              placeholder="Filter shortcuts by key or action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-[#141A24] border-white/10 text-white placeholder:text-[#6E6E73] rounded-xl focus-visible:ring-0 focus-visible:border-white/20"
              autoFocus
            />
          </div>
        </DialogHeader>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {grouped.size === 0 ? (
            <div className="text-center py-12 text-xs text-[#86868B]">
              No shortcuts matching &quot;{search}&quot;
            </div>
          ) : (
            Array.from(grouped.entries()).map(([cat, items]) => (
              <div key={cat} className="space-y-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E73] font-mono">
                  {cat}
                </h3>
                <div className="grid grid-cols-1 gap-1.5">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#141A24]/60 hover:bg-[#141A24] border border-white/[0.06] transition-colors"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-white">{item.label}</span>
                        <span className="text-[11px] text-[#86868B]">{item.description}</span>
                      </div>
                      <kbd className="px-2 py-1 text-[11px] font-mono font-medium rounded-lg bg-[#0C1017] border border-white/10 text-white shadow-xs shrink-0 ml-3">
                        {isMac ? item.keys.mac : item.keys.win}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#0A0B0E] flex items-center justify-between text-xs text-[#6E6E73] shrink-0">
          <span>Press <kbd className="px-1.5 py-0.5 font-mono text-[10px] rounded bg-[#141A24] border border-white/10 text-[#86868B]">Esc</kbd> anytime to close</span>
          <span className="font-mono text-[10px]">{filteredShortcuts.length} shortcuts available</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
