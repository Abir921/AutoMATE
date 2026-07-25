import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearToken } from "../api";

interface Profile {
  email: string;
  name: string | null;
  createdAt: string;
  avatar: string | null;
  automationCount: number;
  balance: number;
  plan: string;
  dailyCreationLimit: number | null;
  creationsToday: number;
}

const MAX_TOPUP = 1_000_000;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("1000");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpError, setTopUpError] = useState("");

  useEffect(() => {
    api.getMe().then(setProfile).catch((err) => setError(err.message));
  }, []);

  function pickPhoto() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("That image is too large - please use something under 2MB.");
      return;
    }

    setError("");
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read that file"));
        reader.readAsDataURL(file);
      });
      const { avatar } = await api.updateAvatar(dataUrl);
      setProfile((prev) => (prev ? { ...prev, avatar } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photo");
    } finally {
      setUploading(false);
    }
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setDeleteConfirmText("");
    setDeleteError("");
  }

  function closeTopUpModal() {
    setShowTopUpModal(false);
    setTopUpAmount("1000");
    setTopUpError("");
  }

  async function topUp() {
    const amount = Math.trunc(Number(topUpAmount));
    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_TOPUP) {
      setTopUpError(`Enter a whole number between 1 and ${MAX_TOPUP.toLocaleString()} BDT.`);
      return;
    }
    setTopUpError("");
    setTopUpBusy(true);
    try {
      const { balance } = await api.topUpWallet(amount);
      setProfile((prev) => (prev ? { ...prev, balance } : prev));
      closeTopUpModal();
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Top up failed");
    } finally {
      setTopUpBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleteError("");
    setDeleting(true);
    try {
      await api.deleteAccount();
      clearToken();
      navigate("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete account");
      setDeleting(false);
    }
  }

  if (error && !profile) return <div className="error">{error}</div>;
  if (!profile) return <p>Loading...</p>;

  const joined = new Date(profile.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <h2>Dashboard</h2>

      <div className="card">
        <div className="row" style={{ alignItems: "center", gap: 20 }}>
          <div className="avatar" onClick={pickPhoto} title="Change profile picture">
            {profile.avatar ? (
              <img src={profile.avatar} alt="Profile" />
            ) : (
              <span>{profile.email[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>{profile.name || profile.email}</h3>
            <button className="secondary btn-sm" onClick={pickPhoto} disabled={uploading}>
              {uploading ? "Uploading..." : profile.avatar ? "Change photo" : "Add profile picture"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileSelected} />
          </div>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="stat-grid">
        <div className="stat-hero">
          <div className="stat-label">Automations created</div>
          <div className="stat-number">{profile.automationCount}</div>
          <div className="muted">
            {profile.dailyCreationLimit === null
              ? "Unlimited creations on your plan"
              : `${profile.creationsToday}/${profile.dailyCreationLimit} created today`}
          </div>
        </div>
        <div className="stat-side">
          <div className="stat-item">
            <div className="stat-label">Email</div>
            <div className="stat-value">{profile.email}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Member since</div>
            <div className="stat-value">{joined}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Plan</div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="badge badge-pro">{profile.plan}</span>
              <Link to="/payment">
                <button className="secondary btn-sm">Manage plan</button>
              </Link>
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Wallet</div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="stat-value">{profile.balance.toLocaleString()} BDT</span>
              <button className="secondary btn-sm" onClick={() => setShowTopUpModal(true)}>
                Top up
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card danger-zone">
        <h3 style={{ margin: "0 0 6px" }}>Danger zone</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          Permanently deletes your account and everything tied to it - automations, email automations, marketplace
          listings and purchase history. This can't be undone.
        </p>
        <button className="danger" onClick={() => setShowDeleteModal(true)}>
          Delete account
        </button>
      </div>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div
            className="modal modal-danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" style={{ marginTop: 0 }}>
              Delete this account?
            </h3>
            <p className="muted">
              This permanently removes <strong>{profile.email}</strong> and every automation, listing, and purchase
              tied to it. There is no way back.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              Type <strong>DELETE</strong> to confirm.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <input
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeDeleteModal();
                }}
                placeholder="DELETE"
                style={{ maxWidth: 160 }}
              />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="secondary" disabled={deleting} onClick={closeDeleteModal}>
                Cancel
              </button>
              <button className="danger" disabled={deleteConfirmText !== "DELETE" || deleting} onClick={deleteAccount}>
                {deleting ? "Deleting..." : "Permanently delete"}
              </button>
            </div>
            {deleteError && <div className="error" style={{ marginTop: 8 }}>{deleteError}</div>}
          </div>
        </div>
      )}

      {showTopUpModal && (
        <div className="modal-overlay" onClick={closeTopUpModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="top-up-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="top-up-title" style={{ marginTop: 0 }}>
              Top up your wallet
            </h3>
            <p className="muted">
              No real money involved - this instantly adds mock BDT to your balance, which you can spend buying
              automations on the Marketplace.
            </p>
            <div className="field">
              <label>Amount (BDT)</label>
              <input
                autoFocus
                type="number"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeTopUpModal();
                }}
                min={1}
                max={MAX_TOPUP}
              />
            </div>
            {topUpError && <div className="error">{topUpError}</div>}
            <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="secondary" disabled={topUpBusy} onClick={closeTopUpModal}>
                Cancel
              </button>
              <button disabled={topUpBusy} onClick={topUp}>
                {topUpBusy ? "Adding..." : "Add funds"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
