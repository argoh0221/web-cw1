import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./SignUp.module.css";
import Header from "../components/Header.jsx";

function SignUp() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [status, setStatus] = useState({ type: null, message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ type: null, message: "" });

    const email = form.email.trim();
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (!email) {
      setStatus({ type: "error", message: "Email is required." });
      return;
    }

    if (password.length < 8) {
      setStatus({
        type: "error",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Registration failed.");
      }

      setStatus({
        type: "success",
        message: "Account created successfully. You can head back to the home page.",
      });
      setForm({ email: "", password: "", confirmPassword: "" });

      setTimeout(() => {
        navigate("/login");
      }, 1000);

    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>

          <Header/>
    <div className={styles.container}>
      
      
      <form className={styles.form} onSubmit={handleSubmit}>
        
        <h1 className={styles.title}>Join As Attendee</h1>

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
            disabled={isSubmitting}
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
            autoComplete="new-password"
            value={form.password}
            onChange={handleChange}
            disabled={isSubmitting}
            required
          />
        </label>

        <label className={styles.field} htmlFor="confirmPassword">
          <span className={styles.label}>Confirm password</span>
          <input
            className={styles.input}
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={handleChange}
            disabled={isSubmitting}
            required
          />
        </label>

        {status.message && (
          <div
            role="alert"
            className={`${styles.status} ${
              status.type === "error" ? styles.statusError : styles.statusSuccess
            }`}
          >
            {status.message}
          </div>
        )}

        <div className={styles.buttonRow}>
          <button className={styles.button} type="submit" disabled={isSubmitting}
          >
            {isSubmitting ? "Signing up..." : "Sign Up"
            }
          </button>
          <button
            className={`${styles.button} ${styles.secondaryButton}`}
            type="button"
            onClick={() => navigate("/")}
            disabled={isSubmitting}
          >
            Back
          </button>
        </div>
      </form>
    </div>
    </div>
  );
}

export default SignUp;
