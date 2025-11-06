import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "./pages/HomePage.jsx";
import SignUp from "./pages/SignUp.jsx";
import UserLogin from "./pages/UserLogin.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import EventsPage from "./pages/Events.jsx";
import EventDetails from "./pages/EventDetails.jsx";
import MyTickets from "./pages/MyTickets.jsx";
import AdminEvents from "./pages/admin/AdminEvents.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("enter");

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const displayedPath = `${displayLocation.pathname}${displayLocation.search}${displayLocation.hash}`;
    if (currentPath !== displayedPath) {
      setTransitionStage("exit");
    }
  }, [location, displayLocation]);

  useEffect(() => {
    if (transitionStage === "exit") {
      const timeoutId = window.setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage("enter");
      }, 220);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [transitionStage, location]);

  return (
    <div
      className={`page-transition ${
        transitionStage === "enter" ? "page-transition--enter" : "page-transition--exit"
      }`}
    >
      <Routes location={displayLocation} key={displayLocation.key}>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:slug" element={<EventDetails />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<UserLogin />} />
        <Route
          path="/my-tickets"
          element={
            <PrivateRoute>
              <MyTickets />
            </PrivateRoute>
          }
        />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/events"
          element={
            <AdminRoute>
              <AdminEvents />
            </AdminRoute>
          }
        />
        <Route path="/login/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
