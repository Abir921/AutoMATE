import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MarketplaceListing } from "@formautomator/shared";
import { api } from "../api";

const PRICING_LABELS: Record<string, string> = {
  single: "per use",
  bulk100: "per 100 uses",
  subscription: "per month",
};

export default function Marketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [myEmail, setMyEmail] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listListings(), api.getMe()])
      .then(([listings, me]) => {
        setListings(listings);
        setMyEmail(me.email);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function buy(listing: MarketplaceListing) {
    if (!window.confirm(`Buy "${listing.name}" for ${listing.price} BDT (${PRICING_LABELS[listing.pricingMode]})?`)) {
      return;
    }
    setError("");
    setBusyId(listing.id);
    try {
      const result = await api.purchaseListing(listing.id);
      window.alert(
        `Purchased! You paid ${result.pricePaid} BDT (platform fee ${result.platformFee} BDT, seller received ${result.sellerPayout} BDT). It's now in your My APIs list.`
      );
      navigate(`/automations/${result.automationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusyId(null);
    }
  }

  async function unlist(listing: MarketplaceListing) {
    if (!window.confirm(`Remove "${listing.name}" from the marketplace?`)) return;
    setError("");
    try {
      await api.deleteListing(listing.id);
      setListings((prev) => prev?.filter((l) => l.id !== listing.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove listing");
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Marketplace</h2>
        <Link to="/marketplace/new">
          <button className="secondary">+ List one of my automations</button>
        </Link>
      </div>

      {error && <div className="error">{error}</div>}

      {listings && listings.length === 0 && (
        <div className="empty-state">
          <span className="empty-dot" />
          <h3>Nothing for sale yet</h3>
          <p>Be the first - list one of your automations and set a price.</p>
          <Link to="/marketplace/new">
            <button className="secondary">+ List one of my automations</button>
          </Link>
        </div>
      )}

      <div className="feature-grid">
        {listings?.map((listing, index) => {
          const isMine = listing.sellerEmail === myEmail;
          return (
            <div className={`card ${isMine ? "listing-mine" : "interactive"}`} key={listing.id}>
              <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "nowrap" }}>
                <span className={`listing-icon hue-${index % 3}`}>{listing.name[0]?.toUpperCase() ?? "?"}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: "2px 0 4px" }}>{listing.name}</h3>
                  {isMine && <span className="badge badge-neutral">Your listing</span>}
                </div>
              </div>
              {listing.description && <p className="muted" style={{ marginBottom: 4 }}>{listing.description}</p>}
              <p className="muted" style={{ margin: "4px 0 0" }}>Seller: {listing.sellerEmail}</p>
              <p className="listing-price">
                {listing.price} BDT{" "}
                <span className="muted" style={{ fontSize: 13, fontWeight: 400, letterSpacing: 0 }}>
                  {PRICING_LABELS[listing.pricingMode]}
                </span>
              </p>
              {isMine ? (
                <button className="secondary btn-sm" onClick={() => unlist(listing)}>
                  Remove listing
                </button>
              ) : (
                <button disabled={busyId === listing.id} onClick={() => buy(listing)}>
                  {busyId === listing.id ? "Purchasing..." : "Buy"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
