import { useEffect, useState } from "react";
import { getMe, changeEmail, changePassword, type Me } from "./api";
import { clearTokens, deleteAccount } from "./auth";

interface ProfilePageProps {
  onLoggedOut: () => void;
}

const inputClass =
  "border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
const primaryButton =
  "bg-blue-600 text-white rounded-lg py-2 px-4 font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const dangerButton =
  "bg-red-600 text-white rounded-lg py-2 px-4 font-medium hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function EmailSection({ onChanged }: { onChanged: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const updated = await changeEmail(email, password);
      onChanged(updated);
      setEmail("");
      setPassword("");
      setMessage("Email updated.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        Change email
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          placeholder="New email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={inputClass}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}
        <button type="submit" disabled={submitting} className={primaryButton}>
          {submitting ? "Saving..." : "Update email"}
        </button>
      </form>
    </section>
  );
}

function PasswordSection({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      // The server has revoked every refresh token, so this session is over.
      clearTokens();
      setMessage("Password changed. Logging you out...");
      setTimeout(onChanged, 1500);
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        Change password
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={inputClass}
        />
        <input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className={inputClass}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}
        <button type="submit" disabled={submitting} className={primaryButton}>
          {submitting ? "Saving..." : "Change password"}
        </button>
      </form>
    </section>
  );
}

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-md p-6 border border-red-200">
      <h3 className="text-lg font-semibold text-red-700 mb-2">
        Delete account
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        This permanently deletes your account and every board you own. It cannot
        be undone.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className={dangerButton}>
          Delete my account...
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Enter your password to confirm"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputClass}
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={dangerButton}
            >
              {submitting ? "Deleting..." : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword("");
                setError(null);
              }}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ProfilePage({ onLoggedOut }: ProfilePageProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch((err) => setLoadError(errorText(err)));
  }, []);

  if (loadError) {
    return <p className="text-red-600 text-sm text-center">{loadError}</p>;
  }
  if (!me) {
    return <p className="text-slate-500 text-sm text-center">Loading...</p>;
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-slate-800">Your profile</h2>

      <section className="bg-white rounded-xl shadow-md p-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Username</dt>
          <dd className="text-slate-800">{me.username}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-800">{me.email || "Not set"}</dd>
          <dt className="text-slate-500">Joined</dt>
          <dd className="text-slate-800">
            {new Date(me.date_joined).toLocaleDateString()}
          </dd>
          <dt className="text-slate-500">Boards owned</dt>
          <dd className="text-slate-800">{me.boards_owned}</dd>
        </dl>
      </section>

      <EmailSection onChanged={(email) => setMe({ ...me, email })} />
      <PasswordSection onChanged={onLoggedOut} />
      <DeleteSection onDeleted={onLoggedOut} />
    </div>
  );
}

export default ProfilePage;
