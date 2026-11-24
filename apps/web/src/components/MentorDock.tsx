import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { PlacedComponent } from '../App';
import type { WireConnection } from './Canvas';
import type { ErcFindingWithHints } from '../lib/erc/types';
import type {
  ActiveHint,
  FindingHintState,
  MentorMessage,
} from '../lib/mentor/useMentor';

export interface MentorDockProps {
  selectedComponent: PlacedComponent | null;
  selectedCount?: number;
  components: PlacedComponent[];
  wires: WireConnection[];
  findings: ErcFindingWithHints[];
  activeHint: ActiveHint | null;
  activeFinding: ErcFindingWithHints | null;
  activeFindingState: FindingHintState | null;
  activeUnlockedLevel: 1 | 2 | 3 | 4;
  isStreaming: boolean;
  streamError: string | null;
  includeCircuitContext?: boolean;
  onToggleCircuitContext?: () => void;
  messages: MentorMessage[];
  onWhatsWrong: () => void;
  onHint: () => void;
  onConceptQuestion: (question: string) => void;
  onRetryConcept: () => void;
  onHighlightComponent: (id: string) => void;
  onHighlightFinding: (finding: ErcFindingWithHints) => void;
  onClearHintOverlay: () => void;
}

const HINT_LEVEL_META: Record<number, string> = {
  1: 'Hint level 1 of 4 · Observation',
  2: 'Hint level 2 of 4 · Principle',
  3: 'Hint level 3 of 4 · Inspect',
  4: 'Reveal · Worked example',
};

export default function MentorDock({
  selectedComponent,
  selectedCount = selectedComponent ? 1 : 0,
  components,
  wires,
  findings,
  activeHint,
  activeFinding,
  activeFindingState,
  activeUnlockedLevel,
  isStreaming,
  streamError,
  includeCircuitContext = true,
  onToggleCircuitContext,
  messages,
  onWhatsWrong,
  onHint,
  onConceptQuestion,
  onRetryConcept,
  onHighlightComponent,
  onHighlightFinding,
  onClearHintOverlay,
}: MentorDockProps) {
  const [input, setInput] = useState('');
  const [conceptOpen, setConceptOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, conceptOpen, scrollToBottom]);

  const activeFindingCount = findings.length;
  const activeCompCount = components.length;
  const activeWireCount = wires.length;

  const shownLevel = activeFindingState?.shownLevel ?? 0;
  const isL2Locked =
    Boolean(activeFinding) && shownLevel === 1 && activeUnlockedLevel < 2;

  const hintButtonLabel =
    shownLevel === 3
      ? 'Reveal fix'
      : isL2Locked
      ? 'Hint (L2 locked)'
      : shownLevel > 0 && shownLevel < 4
      ? `Hint (L${Math.min(4, shownLevel + 1)})`
      : 'Hint';

  const handleSendConcept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onConceptQuestion(input.trim());
    setInput('');
  };

  return (
    <div className="mentor">
      {/* Mentor Header — derived strictly from live isStreaming / activeHint */}
      <div className="mentor-header">
        <div className={`mentor-dot ${isStreaming ? 'pulse' : ''}`} />
        <span className="mentor-title">AI Mentor</span>
        <span className="mentor-role-badge">
          {isStreaming
            ? 'Thinking…'
            : activeHint
            ? `Visual Guide · L${activeHint.hint.level}`
            : 'Socratic Mode'}
        </span>
        {activeHint && !isStreaming && (
          <button
            type="button"
            className="mentor-clear-overlay-btn"
            onClick={onClearHintOverlay}
            title="Hide canvas hint overlay"
            aria-label="Hide canvas hint overlay"
          >
            Hide guide
          </button>
        )}
      </div>

      {/* Scrollable Diagnostic Thread */}
      <div className="mentor-scroll-area" ref={scrollAreaRef}>
        {/* Section A: Diagnostic Thread */}
        <div className="mentor-flat-section">
          <div className="mentor-section-heading">Diagnostic Thread</div>
          <div className="mentor-messages">
            {messages.map((msg) => (
              <div key={msg.id} className="mentor-msg-wrapper">
                <div
                  className={`mentor-msg ${msg.role} ${
                    msg.isError ? 'msg-error' : ''
                  } ${msg.role === 'success' ? 'msg-success' : ''}`}
                  style={
                    msg.isError
                      ? { borderLeft: '2px solid var(--error)' }
                      : msg.role === 'success'
                      ? {
                          borderLeft: '2px solid var(--success)',
                          background: 'rgba(48, 209, 88, 0.08)',
                        }
                      : undefined
                  }
                >
                  <span style={{ whiteSpace: 'pre-line' }}>
                    {msg.text ||
                      (isStreaming && msg.role === 'assistant' ? 'Thinking…' : '')}
                  </span>
                  {msg.role === 'assistant' &&
                    isStreaming &&
                    msg.id === messages[messages.length - 1]?.id && (
                      <span className="mentor-caret inline-block w-1.5 h-3 ml-1 bg-blue-400 align-middle animate-pulse" />
                    )}
                </div>

                {/* Hint level badge — >= 4.5:1 contrast */}
                {msg.hintLevel !== undefined &&
                  msg.role === 'assistant' &&
                  !msg.isError && (
                    <div className="hint-level-meta">
                      {HINT_LEVEL_META[msg.hintLevel] ?? `Hint level ${msg.hintLevel}`}
                    </div>
                  )}
              </div>
            ))}

            {/* Inline Error & Retry (concept mode only) */}
            {streamError && !isStreaming && (
              <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded bg-red-950/30 border border-red-900/50 text-xs text-red-200">
                <span>{streamError}</span>
                <button
                  type="button"
                  onClick={onRetryConcept}
                  className="px-2 py-1 rounded bg-red-900/50 hover:bg-red-900/80 text-white font-medium transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Section B: Pinned Clickable Circuit Context Chips */}
      <div className="mentor-context-strip">
        <div className="mentor-section-heading">Circuit Context</div>
        <div className="mentor-context-chips">
          <span className="context-chip">
            <span className="context-chip-dot" />
            {activeCompCount} {activeCompCount === 1 ? 'part' : 'parts'}
          </span>
          <span className="context-chip">
            <span className="context-chip-dot" />
            {activeWireCount} {activeWireCount === 1 ? 'wire' : 'wires'}
          </span>
          <button
            type="button"
            className={`context-chip context-chip-btn ${
              activeFindingCount > 0 ? 'has-findings' : ''
            }`}
            onClick={() => {
              const target = activeFinding ?? findings[0];
              if (target) onHighlightFinding(target);
            }}
            disabled={activeFindingCount === 0}
            aria-label={
              activeFindingCount > 0
                ? `${activeFindingCount} findings — click to highlight on canvas`
                : '0 findings'
            }
          >
            <span
              className="context-chip-dot"
              style={
                activeFindingCount > 0
                  ? { background: 'var(--error)' }
                  : undefined
              }
            />
            {activeFindingCount}{' '}
            {activeFindingCount === 1 ? 'finding' : 'findings'}
          </button>
          {selectedComponent && (
            <button
              type="button"
              className="context-chip context-chip-btn"
              onClick={() => onHighlightComponent(selectedComponent.id)}
              aria-label={`Selected: ${selectedComponent.designator} — click to highlight on canvas`}
            >
              <span
                className="context-chip-dot"
                style={{ background: 'var(--mentor)' }}
              />
              Selected: {selectedComponent.designator}
            </button>
          )}
        </div>
      </div>

      {/* Section C: Three Mode Buttons + Optional Concept Input */}
      <div className="mentor-input-area">
        <div className="mentor-mode-buttons" role="group" aria-label="Mentor modes">
          <button
            type="button"
            className="mentor-mode-btn"
            onClick={onWhatsWrong}
            disabled={isStreaming}
            title="Inspect the current ERC issue (instant, deterministic)"
          >
            What&apos;s wrong?
          </button>
          <button
            type="button"
            className={`mentor-mode-btn mentor-mode-btn--hint ${
              isL2Locked ? 'mentor-mode-btn--locked' : ''
            }`}
            onClick={onHint}
            disabled={isStreaming}
            title={
              isL2Locked
                ? 'Locked until you make at least 1 circuit edit while this finding persists'
                : 'Show next visual hint on canvas (instant, deterministic)'
            }
          >
            {hintButtonLabel}
          </button>
          <button
            type="button"
            className={`mentor-mode-btn ${
              conceptOpen ? 'mentor-mode-btn--active' : ''
            }`}
            onClick={() => setConceptOpen((prev) => !prev)}
            title="Ask a free-form electronics concept question"
          >
            Explain concept
          </button>
        </div>

        {isL2Locked && (
          <div className="mentor-lock-note" role="status">
            Edit the circuit once while this finding persists to unlock Hint level 2.
          </div>
        )}

        {conceptOpen && (
          <div className="mentor-chat-compose">
            <div className="mentor-attach-row">
              <button
                type="button"
                className={`context-chip context-chip-btn mentor-attach-chip ${
                  includeCircuitContext ? 'is-attached' : 'is-detached'
                }`}
                onClick={onToggleCircuitContext}
                title={
                  includeCircuitContext
                    ? 'Live circuit state attached — click to detach'
                    : 'Circuit state detached — click to attach'
                }
                aria-pressed={includeCircuitContext}
              >
                <span
                  className="context-chip-dot"
                  style={
                    includeCircuitContext
                      ? { background: 'var(--mentor)' }
                      : { background: 'var(--text-3)' }
                  }
                />
                {includeCircuitContext ? (
                  <span>
                    Context: {activeCompCount}{' '}
                    {activeCompCount === 1 ? 'component' : 'components'}
                    {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
                  </span>
                ) : (
                  <span>Context: detached (click to attach)</span>
                )}
              </button>
            </div>
            <form className="mentor-input-wrapper" onSubmit={handleSendConcept}>
              <input
                className="mentor-input"
                placeholder="Ask about Ohm's law, LED polarity, decoupling..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isStreaming}
                aria-label="Ask a concept question"
              />
              <button
                type="submit"
                className="mentor-send"
                disabled={isStreaming || !input.trim()}
                aria-label="Send message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
