import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Automation, PricingMode } from "@formautomator/shared";
import { api } from "../api";

const PRICING_OPTIONS: { value: PricingMode; label: string; hint: string }[] = [
  { value: "single", label: "Per single use", hint: "Buyer pays once per run" },
  { value: "bulk100", label: "Per 100 uses", hint: "A bulk pack - buyer gets 100 runs" },
  { value: "subscription", label: "Monthly subscription", hint: "Unlimited runs for 30 days" },
];

export default function NewListing() {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [sourceAutomationId, setSourceAutomationId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingMode, setPricingMode] = useState<PricingMode>("single");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listAutomations().then((list) => {
      setAutomations(list);
      if (list.length > 0) {
        setSourceAutomationId(list[0].id);
        setName(list[0].name);
      }
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const priceNum = Number(price);
    if (!sourceAutomationId || !priceNum || priceNum <= 0) {
      setError("Please choose an automation and set a price greater than 0.");
      return;
    }
    setBusy(true);
    try {
      await api.createListing({ sourceAutomationId, name, description, pricingMode, price: priceNum });
      navigate("/marketplace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (!automations) return <p>Loading...</p>;

  if (automations.length === 0) {
    return (
      <div>
        <h2>List an automation for sale</h2>
        <div className="card">
          <p className="muted">
            You don't have any browser automations yet - record one with the extension first, then come back here to
            sell it. (Email automations can't be listed since they'd share your Gmail app password with the buyer.)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>List an automation for sale</h2>

      <form onSubmit={submit}>
        <div className="card">
          <div className="field">
            <label>Which automation?</label>
            <select
              value={sourceAutomationId}
              onChange={(e) => {
                setSourceAutomationId(e.target.value);
                const a = automations.find((a) => a.id === e.target.value);
                if (a) setName(a.name);
              }}
            >
              {automations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Listing name</label>
            <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this automation do?" />
          </div>
        </div>

        <div className="card">
          <h3>Pricing</h3>
          {PRICING_OPTIONS.map((opt) => (
            <div key={opt.value} className="field">
              <label>
                <input
                  type="radio"
                  name="pricingMode"
                  checked={pricingMode === opt.value}
                  onChange={() => setPricingMode(opt.value)}
                />{" "}
                {opt.label} <span className="muted">- {opt.hint}</span>
              </label>
            </div>
          ))}
          <div className="field">
            <label>Price (BDT)</label>
            <input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 500" />
          </div>
          <p className="muted">
            The platform takes a cut that shrinks as the price grows: 20% under 500 BDT, 15% from 500-2000, 10% from
            2000-10000, 7% above 10000.
          </p>
        </div>

        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Publishing..." : "Publish listing"}
        </button>
      </form>
    </div>
  );
}
