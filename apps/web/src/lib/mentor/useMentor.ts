import { useState, useEffect, useRef, useCallback } from 'react';
import type { ErcFindingWithHints, Hint } from '../erc/types';
import type { PlacedComponent } from '../../App';
import type { WireConnection } from '../../components/Canvas';
import type { SimulationResult } from '../sim/dcSim';
import { api } from '../api';
import { buildCircuitContext } from './buildCircuitContext';

export interface FindingHintState {
  findingId: string;
  shownLevel: 0 | 1 | 2 | 3 | 4;
  changesWhilePersisted: number;
}

export interface MentorMessage {
  id: string;
  role: 'student' | 'assistant' | 'success';
  text: string;
  hintLevel?: 1 | 2 | 3 | 4;
  findingId?: string;
  isError?: boolean;
}

export interface ActiveHint {
  findingId: string;
  hint: Hint;
}

const SEVERITY_RANK: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const CONCEPT_RECAPS: Record<string, string> = {
  LED_NO_RESISTOR:
    "Concept recap: A series resistor limits LED current via Ohm's law (I = (V_supply − V_f) ÷ R) so it stays within its safe 20 mA rating.",
  LED_NO_CURRENT_LIMIT:
    "Concept recap: A series resistor limits LED current via Ohm's law (I = (V_supply − V_f) ÷ R) so it stays within its safe 20 mA rating.",
  LED_REVERSED:
    'Concept recap: Diodes are polarized — current flows only when the anode (+) is more positive than the cathode (−).',
  VCC_GND_SHORT:
    'Concept recap: Always place a load between VCC and Ground; zero resistance causes dangerous short-circuit current.',
  SHORTED_COMPONENT:
    'Concept recap: Both ends of a component must connect to different electrical nets so voltage drops across it instead of bypassing it.',
  OPEN_LOOP_LOAD:
    'Concept recap: Current flows only through a complete closed loop from VCC through the load and back to Ground.',
  NO_GROUND_PATH:
    "Concept recap: Current requires a closed loop back to Ground (Kirchhoff's current law).",
  UNCONNECTED_PIN:
    'Concept recap: Required component pins must belong to a connected net so current and signals have a defined path.',
};

export function getConceptRecap(ruleId: string): string {
  return (
    CONCEPT_RECAPS[ruleId] ??
    'Concept recap: Resolving electrical rule checks keeps your circuit safe and complete.'
  );
}

/**
 * Compute the highest unlocked hint level for a single finding.
 * - Level 1: always unlocked
 * - Level 2: unlocks only after at least 1 circuit edit while the finding persists
 * - Level 3: unlocks after Level 2 has been shown
 * - Level 4 (Reveal): unlocks after Level 3 has been shown
 */
export function getUnlockedLevel(state: FindingHintState): 1 | 2 | 3 | 4 {
  if (state.shownLevel >= 3) return 4;
  if (state.shownLevel >= 2) return 3;
  if (state.changesWhilePersisted >= 1) return 2;
  return 1;
}

/**
 * Determine the next hint step for a finding, or return a locked reason if gated.
 */
export function getNextHintStep(state: FindingHintState): {
  unlockedLevel: 1 | 2 | 3 | 4;
  nextLevel: 1 | 2 | 3 | 4;
  lockedReason: string | null;
} {
  const unlockedLevel = getUnlockedLevel(state);

  if (state.shownLevel === 0) {
    return { unlockedLevel, nextLevel: 1, lockedReason: null };
  }

  if (state.shownLevel >= 4) {
    return { unlockedLevel: 4, nextLevel: 4, lockedReason: null };
  }

  const desired = Math.min(4, state.shownLevel + 1) as 1 | 2 | 3 | 4;
  if (desired > unlockedLevel) {
    return {
      unlockedLevel,
      nextLevel: state.shownLevel as 1 | 2 | 3 | 4,
      lockedReason:
        'Hint level 2 is locked: make at least 1 edit to your circuit while this issue persists to unlock it.',
    };
  }

  return { unlockedLevel, nextLevel: desired, lockedReason: null };
}

/**
 * Pick the most relevant active finding for mentor guidance.
 */
export function pickTargetFinding(
  findings: ErcFindingWithHints[],
  selectedComponentId?: string | null,
  preferredFindingId?: string | null
): ErcFindingWithHints | null {
  if (findings.length === 0) return null;

  if (preferredFindingId) {
    const preferred = findings.find((f) => f.id === preferredFindingId);
    if (preferred) return preferred;
  }

  const sortBySeverity = (list: ErcFindingWithHints[]) =>
    [...list].sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
    );

  if (selectedComponentId) {
    const matching = findings.filter(
      (f) =>
        f.anchorId === selectedComponentId ||
        f.componentIds?.includes(selectedComponentId)
    );
    if (matching.length > 0) {
      return sortBySeverity(matching)[0] ?? null;
    }
  }

  return sortBySeverity(findings)[0] ?? null;
}

const INITIAL_MESSAGE: MentorMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Welcome to CircuitMentor! Pick "What\'s wrong?" to inspect an issue, "Hint" for step-by-step visual guidance on the canvas, or "Explain concept" to ask a question.',
};

export interface MentorCircuitInput {
  projectName: string;
  task?: { title: string; goal: string } | null;
  components: PlacedComponent[];
  wires: WireConnection[];
  selectedComponentIds: string[];
  selectedConnectionIds: string[];
  simulation?: {
    running: boolean;
    result?: SimulationResult | null;
  };
}

export interface UseMentorReturn {
  messages: MentorMessage[];
  activeHint: ActiveHint | null;
  activeFinding: ErcFindingWithHints | null;
  activeFindingState: FindingHintState | null;
  activeUnlockedLevel: 1 | 2 | 3 | 4;
  findingStates: Map<string, FindingHintState>;
  isStreaming: boolean;
  streamError: string | null;
  includeCircuitContext: boolean;
  toggleCircuitContext: () => void;
  handleWhatsWrong: () => void;
  handleHint: () => void;
  handleConceptQuestion: (question: string) => Promise<void>;
  handleRetryConcept: () => void;
  focusFinding: (findingId: string) => void;
  clearHintOverlay: () => void;
}

export function useMentor(
  projectId: string,
  findings: ErcFindingWithHints[],
  circuitChangeCount: number,
  circuitInput: MentorCircuitInput,
  selectedComponentId?: string | null
): UseMentorReturn {
  const [messages, setMessages] = useState<MentorMessage[]>([INITIAL_MESSAGE]);
  const [activeHint, setActiveHint] = useState<ActiveHint | null>(null);
  const [preferredFindingId, setPreferredFindingId] = useState<string | null>(null);
  const [findingStates, setFindingStates] = useState<Map<string, FindingHintState>>(
    () => new Map()
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastConceptQuestion, setLastConceptQuestion] = useState('');
  const [includeCircuitContext, setIncludeCircuitContext] = useState(true);

  const toggleCircuitContext = useCallback(() => {
    setIncludeCircuitContext((prev) => !prev);
  }, []);

  const prevProjectIdRef = useRef(projectId);
  const prevFindingsRef = useRef<Map<string, ErcFindingWithHints>>(
    new Map(findings.map((f) => [f.id, f]))
  );
  const prevChangeCountRef = useRef(circuitChangeCount);
  const skipNextFindingDiffRef = useRef(false);

  // Reset per-finding state, overlays, and load project-scoped chat history when switching projects
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId;
      prevChangeCountRef.current = circuitChangeCount;
      prevFindingsRef.current = new Map(findings.map((f) => [f.id, f]));
      skipNextFindingDiffRef.current = true;

      setFindingStates(
        new Map(
          findings.map((f) => [
            f.id,
            { findingId: f.id, shownLevel: 0, changesWhilePersisted: 0 },
          ])
        )
      );
      setActiveHint(null);
      setPreferredFindingId(null);
      setStreamError(null);
      setLastConceptQuestion('');
      setMessages([INITIAL_MESSAGE]);
    }

    // Load persisted chat messages for backend UUID projects
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId
    );
    if (!isUuid) return;

    let cancelled = false;
    api
      .listMessages(projectId)
      .then((history) => {
        if (cancelled || prevProjectIdRef.current !== projectId) return;
        if (history.length > 0) {
          const mapped: MentorMessage[] = history.map((m) => ({
            id: m.id,
            role: m.role === 'user' ? 'student' : 'assistant',
            text: m.content,
            hintLevel:
              m.hint_level && m.hint_level >= 1 && m.hint_level <= 4
                ? (m.hint_level as 1 | 2 | 3 | 4)
                : undefined,
          }));
          setMessages([INITIAL_MESSAGE, ...mapped]);
        } else {
          setMessages([INITIAL_MESSAGE]);
        }
      })
      .catch(() => {
        // Keep clean initial message if history fetch fails
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Increment changesWhilePersisted for findings that existed before this edit
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) return;
    if (circuitChangeCount > prevChangeCountRef.current) {
      const delta = circuitChangeCount - prevChangeCountRef.current;
      prevChangeCountRef.current = circuitChangeCount;

      const currentIds = new Set(findings.map((f) => f.id));
      setFindingStates((prev) => {
        const next = new Map(prev);
        for (const [id, st] of next) {
          if (currentIds.has(id)) {
            next.set(id, {
              ...st,
              changesWhilePersisted: st.changesWhilePersisted + delta,
            });
          }
        }
        return next;
      });
    } else if (circuitChangeCount !== prevChangeCountRef.current) {
      prevChangeCountRef.current = circuitChangeCount;
    }
  }, [circuitChangeCount, findings, projectId]);

  // Sync finding states: detect cleared findings (success loop) & register new ones
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) return;
    if (skipNextFindingDiffRef.current) {
      skipNextFindingDiffRef.current = false;
      prevFindingsRef.current = new Map(findings.map((f) => [f.id, f]));
      return;
    }

    const currentMap = new Map(findings.map((f) => [f.id, f]));
    const prevMap = prevFindingsRef.current;

    const clearedFindings: ErcFindingWithHints[] = [];
    for (const [id, prevFinding] of prevMap) {
      if (!currentMap.has(id)) {
        clearedFindings.push(prevFinding);
      }
    }

    if (clearedFindings.length > 0) {
      const clearedIds = new Set(clearedFindings.map((f) => f.id));

      setFindingStates((prev) => {
        const next = new Map(prev);
        for (const id of clearedIds) {
          next.delete(id);
        }
        return next;
      });

      setActiveHint((prev) => {
        if (prev && clearedIds.has(prev.findingId)) return null;
        return prev;
      });

      setPreferredFindingId((prev) => (prev && clearedIds.has(prev) ? null : prev));

      const successMsgs: MentorMessage[] = clearedFindings.map((cf, idx) => ({
        id: `success_${cf.id}_${Date.now()}_${idx}`,
        role: 'success',
        findingId: cf.id,
        text: `✓ Fixed: ${cf.title}\n${getConceptRecap(cf.ruleId)}`,
      }));
      setMessages((prev) => [...prev, ...successMsgs]);
    }

    // Ensure every active finding has an initialized entry (resets if it changed)
    setFindingStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const f of findings) {
        if (!next.has(f.id)) {
          next.set(f.id, {
            findingId: f.id,
            shownLevel: 0,
            changesWhilePersisted: 0,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    prevFindingsRef.current = currentMap;
  }, [findings, projectId]);

  const activeFinding = pickTargetFinding(
    findings,
    selectedComponentId,
    preferredFindingId
  );

  const activeFindingState: FindingHintState | null = activeFinding
    ? findingStates.get(activeFinding.id) ?? {
        findingId: activeFinding.id,
        shownLevel: 0,
        changesWhilePersisted: 0,
      }
    : null;

  const activeUnlockedLevel: 1 | 2 | 3 | 4 = activeFindingState
    ? getUnlockedLevel(activeFindingState)
    : 1;

  const handleWhatsWrong = useCallback(() => {
    const target = pickTargetFinding(findings, selectedComponentId, preferredFindingId);
    if (!target) {
      setActiveHint(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `ok_${Date.now()}`,
          role: 'assistant',
          text: 'No ERC issues detected right now. Your wiring passes all deterministic checks.',
        },
      ]);
      return;
    }

    const l1Hint = target.hints[0];
    setPreferredFindingId(target.id);

    setMessages((prev) => [
      ...prev,
      {
        id: `ww_${Date.now()}`,
        role: 'assistant',
        findingId: target.id,
        hintLevel: 1,
        text: l1Hint
          ? `${target.title} — ${target.detail}\n\n${l1Hint.text}`
          : `${target.title} — ${target.detail}`,
      },
    ]);

    if (l1Hint) {
      setActiveHint({ findingId: target.id, hint: l1Hint });
    }

    setFindingStates((prev) => {
      const next = new Map(prev);
      const current = next.get(target.id) ?? {
        findingId: target.id,
        shownLevel: 0,
        changesWhilePersisted: 0,
      };
      next.set(target.id, {
        ...current,
        shownLevel: Math.max(current.shownLevel, 1) as 0 | 1 | 2 | 3 | 4,
      });
      return next;
    });
  }, [findings, selectedComponentId, preferredFindingId]);

  const handleHint = useCallback(() => {
    const target = pickTargetFinding(findings, selectedComponentId, preferredFindingId);
    if (!target) {
      setActiveHint(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `no_hint_${Date.now()}`,
          role: 'assistant',
          text: 'No active findings to hint on. Try adding or wiring components, or switch to "Explain concept" to ask a question.',
        },
      ]);
      return;
    }

    setPreferredFindingId(target.id);
    const currentState: FindingHintState = findingStates.get(target.id) ?? {
      findingId: target.id,
      shownLevel: 0,
      changesWhilePersisted: 0,
    };

    const step = getNextHintStep(currentState);

    if (step.lockedReason) {
      setMessages((prev) => [
        ...prev,
        {
          id: `locked_${Date.now()}`,
          role: 'assistant',
          findingId: target.id,
          text: step.lockedReason!,
        },
      ]);
      return;
    }

    const hint =
      target.hints.find((h) => h.level === step.nextLevel) ?? target.hints[0];
    if (!hint) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `hint_${Date.now()}`,
        role: 'assistant',
        findingId: target.id,
        hintLevel: hint.level,
        text: hint.text,
      },
    ]);

    setActiveHint({ findingId: target.id, hint });

    setFindingStates((prev) => {
      const next = new Map(prev);
      const st = next.get(target.id) ?? currentState;
      next.set(target.id, {
        ...st,
        shownLevel: Math.max(st.shownLevel, hint.level) as 0 | 1 | 2 | 3 | 4,
      });
      return next;
    });
  }, [findings, selectedComponentId, preferredFindingId, findingStates]);

  const handleConceptQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      setStreamError(null);
      setLastConceptQuestion(trimmed);
      setIsStreaming(true);

      const activeProjId = projectId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        activeProjId
      );
      if (isUuid) {
        api.postMessage(activeProjId, { role: 'user', content: trimmed, mode: 'concept' }).catch(() => {});
      }

      const assistantMsgId = `a_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `q_${Date.now()}`, role: 'student', text: trimmed },
        { id: assistantMsgId, role: 'assistant', text: '' },
      ]);

      let fullAssistantText = '';
      try {
        // Capture fresh live canvas state right at send time (including unsaved edits & selection)
        const liveCircuitPayload = includeCircuitContext
          ? buildCircuitContext({
              project: {
                id: activeProjId,
                name: circuitInput.projectName,
                task: circuitInput.task ?? null,
              },
              components: circuitInput.components,
              wires: circuitInput.wires,
              selection: {
                componentIds: circuitInput.selectedComponentIds,
                connectionIds: circuitInput.selectedConnectionIds,
              },
              findings,
              simulation: circuitInput.simulation,
            })
          : null;

        const history = messages
          .filter((m) => m.id !== 'welcome' && !m.isError && m.text.trim().length > 0)
          .slice(-8)
          .map((m) => ({
            role: m.role === 'student' ? 'user' : 'assistant',
            content: m.text.slice(0, 1000),
          }));

        const response = await fetch('/v1/mentor/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message: trimmed,
            history,
            hint_level: 1,
            mode: 'concept',
            circuit: liveCircuitPayload,
            findings: includeCircuitContext
              ? findings.map(({ hints: _hints, ...rest }) => rest)
              : [],
          }),
        });

        if (!response.ok) {
          let errDetail = 'Failed to connect to mentor.';
          try {
            const errJson = await response.json();
            if (errJson.detail) errDetail = errJson.detail;
          } catch {
            // ignore json parse failure
          }
          throw new Error(errDetail);
        }

        if (!response.body) {
          throw new Error('No response body from mentor server.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (prevProjectIdRef.current !== activeProjId) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let isErrorEvent = false;
            for (const line of lines) {
              if (line.startsWith('event: error')) {
                isErrorEvent = true;
              } else if (line.startsWith('data: ')) {
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') break;
                try {
                  const parsed = JSON.parse(payload);
                  if (isErrorEvent) {
                    const errorMsg = parsed.message || 'Mentor error encountered.';
                    setStreamError(errorMsg);
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, text: errorMsg, isError: true }
                          : m
                      )
                    );
                  } else if (parsed.t) {
                    fullAssistantText += parsed.t;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, text: m.text + parsed.t }
                          : m
                      )
                    );
                  }
                } catch {
                  // ignore malformed sse chunk
                }
              }
            }
          }
        }

        if (isUuid && fullAssistantText.trim()) {
          api
            .postMessage(activeProjId, {
              role: 'assistant',
              content: fullAssistantText,
              mode: 'concept',
            })
            .catch(() => {});
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Mentor is unavailable, try again.';
        setStreamError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, text: msg, isError: true } : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, projectId, circuitInput, findings, messages, includeCircuitContext]
  );

  const handleRetryConcept = useCallback(() => {
    if (!lastConceptQuestion || isStreaming) return;
    void handleConceptQuestion(lastConceptQuestion);
  }, [lastConceptQuestion, isStreaming, handleConceptQuestion]);

  const focusFinding = useCallback((findingId: string) => {
    setPreferredFindingId(findingId);
  }, []);

  const clearHintOverlay = useCallback(() => setActiveHint(null), []);

  return {
    messages,
    activeHint,
    activeFinding,
    activeFindingState,
    activeUnlockedLevel,
    findingStates,
    isStreaming,
    streamError,
    includeCircuitContext,
    toggleCircuitContext,
    handleWhatsWrong,
    handleHint,
    handleConceptQuestion,
    handleRetryConcept,
    focusFinding,
    clearHintOverlay,
  };
}

