import { useState } from "react";
import { login, register } from "./auth";
import { requestPasswordReset } from "./api";

interface AuthFormProps {
  onSuccess: () => void;
}

function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "register") {
        await register(username, email, password);
      } else {
        await login(username, password);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    try {
      const data = await requestPasswordReset(username); // reusing the username field as email input for this mode
      setResetMessage(data.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
        <h2 className="text-2xl font-semibold text-slate-800 mb-6 text-center">
          {mode === "register"
            ? "Create an account"
            : mode === "forgot"
              ? "Reset your password"
              : "Welcome back"}
        </h2>

        {mode === "forgot" ? (
          <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Your account email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            {resetMessage && (
              <p className="text-green-600 text-sm">{resetMessage}</p>
            )}
            <button
              type="submit"
              className="bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 transition-colors"
            >
              Send reset link
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {mode === "register" && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              className="bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 transition-colors"
            >
              {mode === "register" ? "Register" : "Login"}
            </button>
          </form>
        )}

        {mode === "login" && (
          <button
            onClick={() => {
              setMode("forgot");
              setError(null);
              setResetMessage(null);
            }}
            className="mt-3 text-sm text-slate-400 hover:text-blue-600 w-full text-center"
          >
            Forgot your password?
          </button>
        )}

        <button
          onClick={() => {
            setMode(
              mode === "register"
                ? "login"
                : mode === "forgot"
                  ? "login"
                  : "register",
            );
            setError(null);
            setResetMessage(null);
          }}
          className="mt-4 text-sm text-slate-500 hover:text-blue-600 w-full text-center"
        >
          {mode === "register"
            ? "Already have an account? Login"
            : mode === "forgot"
              ? "Back to login"
              : "Don't have an account? Register"}
        </button>
      </div>
    </div>
  );
}

export default AuthForm;
