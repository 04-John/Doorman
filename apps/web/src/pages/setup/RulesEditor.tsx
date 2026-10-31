// "Your rules, in plain English": the merchant writes, AI proposes settings,
// the merchant reviews each card and saves. Used by setup step 3 and the Rules page.
import { useEffect, useRef, useState } from "react";
import { api, type CompiledRules, type Policy, type Rules } from "../../lib/api";
import { Skeleton, Spinner } from "../../ui/bits";
import { Icon } from "../../ui/status";
import { useToast } from "../../ui/toast";
import { Notice, Switch } from "./parts";
import { ALL_ON, RULE_KEYS, cardFor, compileErrorText, errorText, mergePolicy, ruleIcon, type RuleKey, type RuleToggles } from "./rules";

type Review = CompiledRules & { text: string };

const ghostButton = { height: 46, padding: "0 16px", fontWeight: 500 } as const;

export function RulesEditor({
  saved,
  onBack,
  onSaved,
  autoFocus = false,
}: {
  saved: Rules;
  onBack: () => void;
  onSaved: (rules: Rules) => void;
  autoFocus?: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState(saved.rulesText);
  const [converting, setConverting] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [on, setOn] = useState<RuleToggles>(ALL_ON);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  const trimmed = text.trim();
  const stale = review !== null && trimmed !== review.text;

  async function convert() {
    if (converting || saving) return;
    if (!trimmed) {
      setCompileError("Write at least one rule first.");
      return;
    }
    setConverting(true);
    setCompileError(null);
    setSaveError(null);
    setReview(null);
    try {
      const result = await api.compileRules(trimmed);
      setReview({ ...result, text: trimmed });
      setOn(ALL_ON);
    } catch (err) {
      setCompileError(compileErrorText(err));
    } finally {
      setConverting(false);
    }
  }

  async function save() {
    if (!review || stale || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await api.saveRules(mergePolicy(saved.policy, review.policy, on), review.text);
      toast("Rules saved");
      onSaved(next);
    } catch (err) {
      setSaveError(`Couldn't save your rules. ${errorText(err)}`);
      setSaving(false);
    }
  }

  const unsupported = review?.unsupported.filter((u) => u.trim()) ?? [];
  const hint = converting
    ? "Reading your text"
    : stale
      ? "You changed the text. Turn it into rules again to update the cards."
      : review
        ? `${review.cards.length} rules found${unsupported.length ? ` · ${unsupported.length} couldn't be applied` : ""}`
        : "AI reads your text, you review the result";

  return (
    <div>
      <h2 id="su-rules-heading" tabIndex={-1} style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
        Your rules, in plain English
      </h2>
      <p id="su-rules-desc" style={{ fontSize: 15.5, color: "#4A4D55", margin: "6px 0 0", lineHeight: 1.5 }}>
        Write how you want agents treated. Doorman turns it into rules you can check before saving.
      </p>
      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        aria-labelledby="su-rules-heading"
        aria-describedby="su-rules-desc"
        style={{
          display: "block",
          width: "100%",
          marginTop: 18,
          padding: "16px 18px",
          border: "1.5px solid #D3D0C8",
          borderRadius: 12,
          fontFamily: "inherit",
          fontSize: 16.5,
          lineHeight: 1.6,
          color: "#15171C",
          background: "#FAF9F6",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px", marginTop: 14 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={convert}
          aria-disabled={converting || saving}
          style={{ opacity: converting ? 0.75 : 1 }}
        >
          {converting && <Spinner light size={16} />}
          {converting ? "Turning into rules…" : review ? "Turn into rules again" : "Turn into rules"}
        </button>
        <span aria-live="polite" style={{ fontSize: 14, color: stale ? "#8A5300" : "#6B6E76" }}>
          {hint}
        </span>
      </div>

      {compileError && (
        <div style={{ marginTop: 18 }}>
          <Notice tone="error" title="Couldn't turn that into rules">
            {compileError}
          </Notice>
        </div>
      )}

      {converting && (
        <div className="su-grid2" aria-busy="true" style={{ gap: 12, marginTop: 22 }}>
          <span className="sr-only">Turning your text into rules</span>
          {RULE_KEYS.map((k) => (
            <Skeleton key={k} width="100%" height={112} radius={12} />
          ))}
        </div>
      )}

      {review && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 16px", margin: "26px 0 12px" }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Check these {review.cards.length} rules</h3>
            <span style={{ fontSize: 14, color: "#6B6E76" }}>Toggle off anything that's wrong</span>
          </div>
          <div className="su-grid2" style={{ gap: 12 }}>
            {RULE_KEYS.map((key, i) => (
              <ReviewCard
                key={key}
                index={i}
                ruleKey={key}
                proposed={review}
                saved={saved}
                on={on[key]}
                onToggle={(value) => {
                  setOn((prev) => ({ ...prev, [key]: value }));
                  setSaveError(null);
                }}
              />
            ))}
          </div>
          {unsupported.length > 0 && (
            <div className="su-reveal" style={{ marginTop: 12, animationDelay: `${RULE_KEYS.length * 90}ms` }}>
              <Notice tone="warning" title="Not applied">
                <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {unsupported.map((u, i) => (
                    <li key={i}>
                      Couldn't apply “{u.replace(/^["“']+|["”']+$/g, "")}”. <span style={{ color: "#4A4D55" }}>Doorman doesn't support that yet.</span>
                    </li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
        </>
      )}

      {saveError && (
        <div style={{ marginTop: 18 }}>
          <Notice tone="error">{saveError}</Notice>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 24 }}>
        <button type="button" className="btn btn-ghost" onClick={onBack} style={ghostButton}>
          Back
        </button>
        {review && (
          <button type="button" className="btn btn-primary" onClick={save} disabled={stale} aria-disabled={saving} style={{ padding: "0 20px" }}>
            {saving && <Spinner light size={16} />}
            {saving ? "Saving…" : "Save rules"}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  ruleKey,
  index,
  proposed,
  saved,
  on,
  onToggle,
}: {
  ruleKey: RuleKey;
  index: number;
  proposed: { policy: Policy; cards: Rules["cards"] };
  saved: Rules;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const card = cardFor(proposed.cards, ruleKey, proposed.policy);
  const current = cardFor(saved.cards, ruleKey, saved.policy).setting;
  const changed = proposed.policy[ruleKey] !== saved.policy[ruleKey];
  const note = !on ? `Not applied. Keeps: ${current}` : changed ? `Replaces: ${current}` : "Same as your current rule";

  return (
    <div
      className="su-reveal"
      style={{
        animationDelay: `${index * 90}ms`,
        border: "1px solid #E4E2DC",
        borderRadius: 12,
        padding: 16,
        background: on ? "#FFFFFF" : "#FAF9F6",
        opacity: on ? 1 : 0.6,
        transition: "opacity .2s, background .2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: on ? "#F1F0EC" : "#F4F3EF", display: "grid", placeItems: "center" }}>
          <Icon d={ruleIcon(ruleKey)} color={on ? "#15171C" : "#A3A6AD"} size={17} width={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15.5, fontWeight: 600, margin: 0 }}>{card.title}</h4>
          <div
            className="mono"
            style={{ display: "inline-flex", marginTop: 6, padding: "4px 9px", borderRadius: 7, background: "#F1F0EC", fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}
          >
            {card.setting}
          </div>
        </div>
        <Switch on={on} onChange={onToggle} label={`Apply ${card.title}: ${card.setting}`} />
      </div>
      <div style={{ fontSize: 13.5, color: changed && on ? "#4A4D55" : "#6B6E76", marginTop: 12, lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}
