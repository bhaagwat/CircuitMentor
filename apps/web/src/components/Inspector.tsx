import { useState, useMemo } from 'react';
import type { PlacedComponent } from '../App';
import type { WireConnection } from './Canvas';
import type { SimulationResult } from '../lib/sim/dcSim';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface InspectorProps {
  component: PlacedComponent | null;
  wires?: WireConnection[];
  allComponents?: PlacedComponent[];
  onUpdateComponent?: (id: string, updates: Partial<PlacedComponent>) => void;
  selectedWire?: WireConnection | null;
  onDeleteWire?: (wireId: string) => void;
  simResult?: SimulationResult | null;
  isSimulating?: boolean;
}

interface PinInfo {
  number: string;
  name: string;
  role: string;
  netType: 'vcc' | 'gnd' | 'signal';
}

function getComponentPins(partId: string): PinInfo[] {
  switch (partId) {
    case 'resistor.axial':
      return [
        { number: '1', name: 'Terminal 1', role: 'Terminal 1', netType: 'signal' },
        { number: '2', name: 'Terminal 2', role: 'Terminal 2', netType: 'signal' },
      ];
    case 'led.5mm.red':
      return [
        { number: '1', name: 'Anode (+)', role: 'Anode (+)', netType: 'signal' },
        { number: '2', name: 'Cathode (−)', role: 'Cathode (−)', netType: 'gnd' },
      ];
    case 'battery.9v':
      return [
        { number: '1', name: 'Positive (+)', role: 'Positive · 9V', netType: 'vcc' },
        { number: '2', name: 'Negative (−)', role: 'Negative · 0V', netType: 'gnd' },
      ];
    case 'ground':
      return [
        { number: '1', name: 'Earth Terminal', role: 'Ground · 0V', netType: 'gnd' },
      ];
    case 'arduino.uno':
      return [
        { number: '5V', name: '5V Supply', role: 'Power · 5V', netType: 'vcc' },
        { number: 'GND', name: 'GND Rail', role: 'Ground · 0V', netType: 'gnd' },
        { number: 'D13', name: 'Digital 13', role: 'Signal · SCK', netType: 'signal' },
        { number: 'A0', name: 'Analog In 0', role: 'Analog · Sense', netType: 'signal' },
      ];
    default:
      return [
        { number: '1', name: 'Pin 1', role: 'Pin 1', netType: 'signal' },
        { number: '2', name: 'Pin 2', role: 'Pin 2', netType: 'signal' },
      ];
  }
}

function parseValueAndUnit(raw: string): { val: string; unit: string } {
  const match = raw.match(/^([0-9.]+)\s*(.*)$/);
  if (match) {
    return { val: match[1] ?? raw, unit: match[2] ?? '' };
  }
  return { val: raw, unit: '' };
}

function getUnitAlternatives(unit: string): string[] {
  if (['Ω', 'kΩ', 'MΩ', 'ohm', 'kohm'].includes(unit)) return ['Ω', 'kΩ', 'MΩ'];
  if (['V', 'mV', 'kV'].includes(unit)) return ['mV', 'V', 'kV'];
  if (['mA', 'A', 'µA', 'uA'].includes(unit)) return ['µA', 'mA', 'A'];
  if (['pF', 'nF', 'µF', 'uF', 'mF'].includes(unit)) return ['pF', 'nF', 'µF'];
  if (['Hz', 'kHz', 'MHz'].includes(unit)) return ['Hz', 'kHz', 'MHz'];
  if (['W', 'mW'].includes(unit)) return ['mW', 'W'];
  if (['%', 'percent'].includes(unit)) return ['1%', '5%', '10%', '20%'];
  return [unit];
}

export default function Inspector({
  component,
  wires = [],
  allComponents = [],
  onUpdateComponent,
  selectedWire = null,
  onDeleteWire,
  simResult = null,
  isSimulating = false,
}: InspectorProps) {
  const [snapUnit, setSnapUnit] = useState('2.54 mm');
  const [selectedUnits, setSelectedUnits] = useState<Record<string, string>>({});

  const pins = useMemo(() => {
    if (!component) return [];
    const basePins = getComponentPins(component.partId);

    return basePins.map((pin, pinIdx) => {
      const connectedWire = wires.find(
        (w) =>
          (w.fromId === component.id && w.fromPin === pinIdx) ||
          (w.toId === component.id && w.toPin === pinIdx)
      );

      if (!connectedWire) {
        return {
          ...pin,
          role: 'Unconnected · Open',
        };
      }

      const otherId = connectedWire.fromId === component.id ? connectedWire.toId : connectedWire.fromId;
      const otherPinIdx = connectedWire.fromId === component.id ? connectedWire.toPin : connectedWire.fromPin;
      const otherComp = allComponents.find((c) => c.id === otherId);
      const otherName = otherComp ? `${otherComp.designator}:P${otherPinIdx + 1}` : 'Net';

      return {
        ...pin,
        netType: connectedWire.netType,
        role: `Connected · ${otherName}`,
      };
    });
  }, [component, wires, allComponents]);

  if (!component && selectedWire) {
    const fromComp = allComponents.find((c) => c.id === selectedWire.fromId);
    const toComp = allComponents.find((c) => c.id === selectedWire.toId);
    const fromName = fromComp ? `${fromComp.designator} (Pin ${selectedWire.fromPin + 1})` : `Node ${selectedWire.fromId}`;
    const toName = toComp ? `${toComp.designator} (Pin ${selectedWire.toPin + 1})` : `Node ${selectedWire.toId}`;

    return (
      <div className="inspector" key={selectedWire.id}>
        <div className="inspector-header">
          <div className="inspector-header-left">
            <span className="inspector-designator">WIRE</span>
            <h2 className="inspector-name">Net Connection</h2>
          </div>
          <span className={`inspector-status-badge dot-${selectedWire.netType}`}>
            {selectedWire.netType.toUpperCase()}
          </span>
        </div>

        <div className="inspector-card">
          <div className="inspector-card-header">Connected Terminals</div>
          <div className="inspector-pin-table">
            <div className="inspector-pin-row">
              <span className="inspector-pin-name">Source (From)</span>
              <span className="inspector-meta-mono">{fromName}</span>
            </div>
            <div className="inspector-pin-row">
              <span className="inspector-pin-name">Target (To)</span>
              <span className="inspector-meta-mono">{toName}</span>
            </div>
          </div>
        </div>

        <div className="inspector-card">
          <div className="inspector-card-header">Net Specification</div>
          <div className="inspector-card-body">
            <div className="inspector-meta-row">
              <span className="inspector-meta-label">Wire ID</span>
              <span className="inspector-meta-mono">{selectedWire.id}</span>
            </div>
            <div className="inspector-meta-row">
              <span className="inspector-meta-label">Classification</span>
              <span className="inspector-meta-mono">{selectedWire.netType}</span>
            </div>
          </div>
        </div>

        {isSimulating && simResult && (
          <div className="inspector-card border-l-2 border-l-[#64D2FF]">
            <div className="inspector-card-header flex items-center justify-between">
              <span>Live Wire Telemetry</span>
              <span className="text-[10px] text-[#64D2FF] font-mono">SPICE DC</span>
            </div>
            <div className="inspector-card-body">
              <div className="inspector-meta-row">
                <span className="inspector-meta-label">Conducted Current</span>
                <span className="inspector-meta-mono text-[#64D2FF] font-bold">
                  {simResult.wireCurrents[selectedWire.id] !== undefined
                    ? `${simResult.wireCurrents[selectedWire.id]?.toFixed(1)} mA`
                    : '0.0 mA'}
                </span>
              </div>
              <div className="inspector-meta-row">
                <span className="inspector-meta-label">Status</span>
                <span className="inspector-meta-mono text-emerald-400">
                  {simResult.activeWireIds.includes(selectedWire.id) ? 'Energized' : 'Idle'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="p-3">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[var(--error)] bg-[rgba(255,69,58,0.1)] border border-[rgba(255,69,58,0.25)] rounded-md hover:bg-[rgba(255,69,58,0.2)] transition-colors cursor-pointer"
            onClick={() => onDeleteWire?.(selectedWire.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete Wire (⌫)
          </button>
        </div>
      </div>
    );
  }

  if (!component) {
    return (
      <div className="inspector-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="inspector-empty-text">
          Select a component on the canvas to inspect its properties and electrical parameters.
        </p>
      </div>
    );
  }

  const commitGeometry = (field: 'x' | 'y' | 'rotation', raw: string) => {
    if (!component || !onUpdateComponent) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const nextVal = field === 'rotation' ? ((Math.round(parsed) % 360) + 360) % 360 : Math.round(parsed);
    if (component[field] !== nextVal) {
      onUpdateComponent(component.id, { [field]: nextVal });
    }
  };

  const commitParam = (key: string, valStr: string, unitStr: string) => {
    if (!component || !onUpdateComponent) return;
    const trimmed = valStr.trim();
    if (!trimmed) return;
    const nextRaw = unitStr ? `${trimmed} ${unitStr}` : trimmed;
    if (component.params[key] !== nextRaw) {
      onUpdateComponent(component.id, {
        params: { ...component.params, [key]: nextRaw },
      });
    }
  };

  const telemetry = isSimulating && simResult ? simResult.componentTelemetry[component.id] : null;

  return (
    <div className="inspector" key={component.id}>
      {/* Component Title Header: Designator in 12px mono --text-3, Name in 14px 600 --text-1 */}
      <div className="inspector-header">
        <div className="inspector-header-left">
          <span className="inspector-designator">{component.designator}</span>
          <h2 className="inspector-name">{component.name}</h2>
        </div>
        {/* Neutral status badge in --raised + --text-2 */}
        <span className="inspector-status-badge">Placed</span>
      </div>

      {/* Live Simulation Physics Measurements */}
      {telemetry && (
        <div className="inspector-card border-l-2 border-l-[#64D2FF]">
          <div className="inspector-card-header flex items-center justify-between">
            <span>Live Physics Telemetry</span>
            <span className="text-[10px] text-[#64D2FF] font-mono">SPICE DC</span>
          </div>
          <div className="inspector-card-body space-y-2">
            <div className="inspector-meta-row">
              <span className="inspector-meta-label">Branch Current</span>
              <span className="inspector-meta-mono text-[#64D2FF] font-bold">
                {telemetry.currentMa.toFixed(1)} mA
              </span>
            </div>
            <div className="inspector-meta-row">
              <span className="inspector-meta-label">Voltage Drop</span>
              <span className="inspector-meta-mono text-white">
                {telemetry.voltageDrop.toFixed(2)} V
              </span>
            </div>
            <div className="inspector-meta-row">
              <span className="inspector-meta-label">Power Dissipated</span>
              <span className="inspector-meta-mono text-amber-400">
                {telemetry.powerMw.toFixed(1)} mW
              </span>
            </div>
            <div className="inspector-meta-row">
              <span className="inspector-meta-label">State</span>
              <span className="inspector-meta-mono text-xs">
                {telemetry.stateText}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Geometry & position */}
      <div className="inspector-card">
        <div className="inspector-card-header">Geometry & position</div>
        <div className="inspector-card-body">
          {/* Figma Pattern #1: Collapsed X / Y pair on ONE row */}
          <div className="dimension-pair-row">
            <div className="dimension-compact-box">
              <span className="dimension-prefix">X</span>
              <input
                key={`x-${component.id}-${component.x}`}
                className="dimension-input"
                defaultValue={component.x}
                onBlur={(e) => commitGeometry('x', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitGeometry('x', (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="X position in pixels"
              />
              <span className="dimension-unit">px</span>
            </div>

            <div className="dimension-compact-box">
              <span className="dimension-prefix">Y</span>
              <input
                key={`y-${component.id}-${component.y}`}
                className="dimension-input"
                defaultValue={component.y}
                onBlur={(e) => commitGeometry('y', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitGeometry('y', (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="Y position in pixels"
              />
              <span className="dimension-unit">px</span>
            </div>
          </div>

          {/* Collapsed Rotation / Grid snap row */}
          <div className="dimension-pair-row">
            <div className="dimension-compact-box">
              <span className="dimension-prefix">R</span>
              <input
                key={`rot-${component.id}-${component.rotation}`}
                className="dimension-input"
                defaultValue={component.rotation}
                onBlur={(e) => commitGeometry('rotation', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitGeometry('rotation', (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="Rotation degrees"
              />
              <span className="dimension-unit">deg</span>
            </div>

            <div className="dimension-compact-box">
              <span className="dimension-prefix">Snap</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="dimension-static-val cursor-pointer bg-transparent border-0 hover:text-[var(--text-1)] flex items-center gap-1 transition-colors"
                    aria-label="Change grid snap"
                  >
                    <span>{snapUnit}</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuLabel>Grid Snap</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setSnapUnit('2.54 mm')}>2.54 mm (0.1")</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSnapUnit('1.27 mm')}>1.27 mm (0.05")</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSnapUnit('5.08 mm')}>5.08 mm (0.2")</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Electrical parameters */}
      {Object.keys(component.params).length > 0 && (
        <div className="inspector-card">
          <div className="inspector-card-header">Electrical parameters</div>
          <div className="inspector-card-body">
            {Object.entries(component.params).map(([key, rawValue]) => {
              const { val, unit } = parseValueAndUnit(rawValue);
              const label = key.replace(/_/g, ' ');
              const alternatives = getUnitAlternatives(unit);
              const activeUnit = selectedUnits[key] || unit;

              return (
                <div className="inspector-field-row" key={key}>
                  <label htmlFor={`param-${key}`} className="inspector-field-label">{label}</label>
                  <div className="inspector-field-box">
                    <input
                      key={`param-${component.id}-${key}-${rawValue}`}
                      id={`param-${key}`}
                      className="inspector-field-input"
                      defaultValue={val}
                      onBlur={(e) => commitParam(key, e.target.value, activeUnit)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitParam(key, (e.target as HTMLInputElement).value, activeUnit);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    {unit && (
                      alternatives.length > 1 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inspector-field-unit cursor-pointer bg-transparent border-0 hover:text-[var(--text-1)] flex items-center gap-0.5 transition-colors"
                              aria-label={`Change unit for ${label}`}
                            >
                              <span>{activeUnit}</span>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-24">
                            <DropdownMenuLabel>Unit</DropdownMenuLabel>
                            {alternatives.map((u) => (
                              <DropdownMenuItem
                                key={u}
                                onClick={() => {
                                  setSelectedUnits((prev) => ({ ...prev, [key]: u }));
                                  commitParam(key, val, u);
                                }}
                                className={activeUnit === u ? 'text-[var(--cm-blue)] font-semibold' : ''}
                              >
                                {u}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="inspector-field-unit">{unit}</span>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {/* Interactive Potentiometer Wiper Slider */}
            {component.partId === 'potentiometer' && (
              <div className="inspector-field-row flex-col items-start gap-1.5 mt-2 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between w-full">
                  <span className="inspector-field-key">Wiper Ratio</span>
                  <span className="inspector-field-unit font-mono text-[var(--cm-blue)]">
                    {Number(component.params.wiper ?? 50)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Number(component.params.wiper ?? 50)}
                  onChange={(e) => {
                    onUpdateComponent?.(component.id, {
                      params: { ...component.params, wiper: e.target.value },
                    });
                  }}
                  className="w-full h-1.5 bg-[var(--raised)] rounded-lg appearance-none cursor-pointer accent-[var(--cm-blue)]"
                  aria-label="Potentiometer wiper position"
                />
              </div>
            )}

            {/* Interactive Switch State Toggle */}
            {(component.partId === 'switch.spst' || component.partId === 'pushbutton') && (
              <div className="inspector-field-row flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                <span className="inspector-field-key">Contact State</span>
                <button
                  type="button"
                  onClick={() => {
                    const cur = (component.params.state ?? 'closed') === 'closed' ? 'open' : 'closed';
                    onUpdateComponent?.(component.id, {
                      params: { ...component.params, state: cur },
                    });
                  }}
                  className={`px-3 py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${
                    (component.params.state ?? 'closed') === 'closed'
                      ? 'bg-[rgba(50,215,75,0.15)] border-[rgba(50,215,75,0.4)] text-[var(--success)]'
                      : 'bg-[var(--raised)] border-[var(--border)] text-[var(--text-3)]'
                  }`}
                  aria-label="Toggle contact state"
                >
                  {(component.params.state ?? 'closed').toUpperCase()}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminals & nets with Fill × Hug style Constraint Chips */}
      <div className="inspector-card">
        <div className="inspector-card-header">Terminals & nets ({pins.length})</div>
        <div className="inspector-pin-table">
          {pins.map((pin) => (
            <div className="inspector-pin-row" key={pin.number}>
              <div className="pin-identity">
                <span className="inspector-pin-num">{pin.number}</span>
                <span className="inspector-pin-name">{pin.name}</span>
              </div>
              <div className="pin-role-chip" title={`Connected net: ${pin.role}`}>
                <span className={`role-chip-dot dot-${pin.netType}`} />
                <span className="role-chip-text">{pin.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Package specification */}
      <div className="inspector-card">
        <div className="inspector-card-header">Package specification</div>
        <div className="inspector-card-body">
          <div className="inspector-meta-row">
            <span className="inspector-meta-label">Catalog ID</span>
            <span className="inspector-meta-mono">{component.partId}</span>
          </div>
          <div className="inspector-meta-row">
            <span className="inspector-meta-label">Instance ID</span>
            <span className="inspector-meta-mono">{component.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
