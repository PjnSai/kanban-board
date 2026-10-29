import { useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import AuthForm from "./AuthForm";
import { isLoggedIn, logout } from "./auth";
import Dashboard from "./Dashboard";
import BoardView from "./BoardView";
import ResetPasswordPage from "./ResetPasswordPage";
import ProfilePage from "./ProfilePage";

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  if (!loggedIn) {
    return (
      <Routes>
        <Route
          path="/reset-password/:uid/:token"
          element={<ResetPasswordPage />}
        />
        <Route
          path="*"
          element={<AuthForm onSuccess={() => setLoggedIn(true)} />}
        />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <Link
          to="/"
          className="text-xl font-semibold text-slate-800 hover:text-blue-600"
        >
          My Boards
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/profile"
            className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
          >
            Profile
          </Link>
          <button
            onClick={async () => {
              await logout();
              setLoggedIn(false);
            }}
            className="text-sm text-slate-500 hover:text-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/boards/:id" element={<BoardView />} />
          <Route
            path="/profile"
            element={<ProfilePage onLoggedOut={() => setLoggedIn(false)} />}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
