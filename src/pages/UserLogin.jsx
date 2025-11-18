import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./UserLogin.module.css";
import Header from "../components/Header.jsx";

function UserLogin() {
  const { user, login, authenticating } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const redirectFromState = location.state?.from;

  if (user?.isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (user?.isOrganiser) {
    return <Navigate to="/organiserhome" replace />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    try {
      const loggedInUser = await login(email, password);



      if (redirectFromState) {
        navigate(redirectFromState, { replace: true });
      } else if (loggedInUser?.isAdmin) {
        navigate("/admin", { replace: true });
      } else if (loggedInUser?.isOrganiser) {
        navigate("/organiserhome", { replace: true });
      } 
        else {
        navigate("/", { replace: true });
      }
    } catch (loginError) {
      setError(loginError.message || "Login failed. Please try again.");
    }
  }

  return (
    <div className={styles.page}>
      <Header/>
    <div className={styles.container}>
      
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Sign In</h1>
        <p className={styles.subtitle}>Access your event account.</p>

        <label className={styles.field} htmlFor="email">
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            disabled={authenticating}
            required
          />
        </label>

        <label className={styles.field} htmlFor="password">
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange}
            disabled={authenticating}
            required
          />
        </label>

        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}

        <button className={styles.button} type="submit" disabled={authenticating}>
          {authenticating ? "Signing in..." : "Sign In"}
        </button>

        <p className={styles.helper}>
          Admin user? <Link to="/admin/login">Sign in here</Link>.
        </p>
        <p className={styles.helper}>
          Need an account? <Link to="/signup">Create one</Link>.
        </p>
      </form>
    </div>
    </div>
  );
}

export default UserLogin;
