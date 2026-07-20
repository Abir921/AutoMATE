import { Navigate, Route, Routes, Link, useLocation, useNavigate } from "react-router-dom";
import { getToken, clearToken } from "./api";
import ThemeToggle from "./components/ThemeToggle";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import MyApis from "./pages/MyApis";
import Review from "./pages/Review";
import AutomationDetail from "./pages/AutomationDetail";
import NewEmailAutomation from "./pages/NewEmailAutomation";
import EmailAutomationDetail from "./pages/EmailAutomationDetail";
import Marketplace from "./pages/Marketplace";
import NewListing from "./pages/NewListing";
import Plans from "./pages/Plans";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link to={to} className={active ? "active" : ""}>
      {children}
    </Link>
  );
}

function Topbar() {
  const navigate = useNavigate();
  const loggedIn = !!getToken();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        FormAutomator
      </Link>
      <div className="row">
        <NavLink to="/">Home</NavLink>
        {loggedIn && (
          <>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/my-apis">My APIs</NavLink>
            <NavLink to="/marketplace">Marketplace</NavLink>
            <NavLink to="/payment">Plans</NavLink>
          </>
        )}
        <ThemeToggle />
        {loggedIn ? (
          <button
            className="secondary"
            onClick={() => {
              clearToken();
              navigate("/login");
            }}
          >
            Log out
          </button>
        ) : (
          <Link to="/login">
            <button className="secondary">Log in</button>
          </Link>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Topbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/review/:draftId"
            element={
              <RequireAuth>
                <Review />
              </RequireAuth>
            }
          />
          <Route
            path="/automations/:id"
            element={
              <RequireAuth>
                <AutomationDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/my-apis"
            element={
              <RequireAuth>
                <MyApis />
              </RequireAuth>
            }
          />
          <Route
            path="/email-automations/new"
            element={
              <RequireAuth>
                <NewEmailAutomation />
              </RequireAuth>
            }
          />
          <Route
            path="/email-automations/:id"
            element={
              <RequireAuth>
                <EmailAutomationDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/marketplace"
            element={
              <RequireAuth>
                <Marketplace />
              </RequireAuth>
            }
          />
          <Route
            path="/marketplace/new"
            element={
              <RequireAuth>
                <NewListing />
              </RequireAuth>
            }
          />
          <Route
            path="/payment"
            element={
              <RequireAuth>
                <Plans />
              </RequireAuth>
            }
          />
        </Routes>
      </div>
    </>
  );
}
