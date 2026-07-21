import { useRef, useState } from "react";
import type { ParameterDef } from "@automate/shared";
import { api } from "../api";

const SUGGEST_DEBOUNCE_MS = 600;
const SUGGEST_MIN_CHARS = 2;

/**
 * Text input with live destination suggestions fetched from the automation's
 * own target site - typing the exact place name the site expects (matching
 * its naming/spelling) is the hardest part of reusing a travel automation.
 */
export default function LocationField({
  automationId,
  param,
  value,
  onChange,
}: {
  automationId: string;
  param: ParameterDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  function handleChange(next: string) {
    onChange(next);
    setOpen(true);
    window.clearTimeout(debounceRef.current);

    if (next.trim().length < SUGGEST_MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { suggestions } = await api.suggestLocations(automationId, param.key, next);
        setSuggestions(suggestions);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, SUGGEST_DEBOUNCE_MS);
  }

  return (
    <div className="location-field">
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && value.trim().length >= SUGGEST_MIN_CHARS && (loading || suggestions.length > 0) && (
        <div className="location-dropdown">
          {loading && <div className="location-dropdown-status">Searching {param.label.toLowerCase()}...</div>}
          {!loading &&
            suggestions.map((s, i) => (
              <button
                type="button"
                key={i}
                className="location-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            ))}
          {!loading && suggestions.length === 0 && (
            <div className="location-dropdown-status">No matches found - your typed value will still be used.</div>
          )}
        </div>
      )}
    </div>
  );
}
