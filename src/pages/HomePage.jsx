import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "./HomePage.module.css";

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Welcome to the Event Management System</h1>
      <p className={styles.text}>
        This is the main page of the Event Management System. Here you can
        find various events and manage them effectively.
      </p>
      <button
        className={styles.signupButton}
        onClick={() => navigate("/signup")}
        >
        Sign Up
      </button>
    </div>
  );
}
