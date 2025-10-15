import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function SignUp() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    function handleEmailChange(e) {
        setEmail(e.target.value);
    }

    function handlePasswordChange(e) {
        setPassword(e.target.value);
    }

    function handleSubmit(e) {
        e.preventDefault();
        alert(`Email: ${email}, Password: ${password}`);
        setEmail("");
        setPassword("");
        // After sign up, navigate back to home (or to a welcome/dashboard)
        navigate('/');
    }

    return (
        <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
                <label style={styles.label} htmlFor="email">Email</label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    style={styles.input}
                />
            </div>
            <div style={styles.field}>
                <label style={styles.label} htmlFor="password">Password</label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={handlePasswordChange}
                    style={styles.input}
                />
            </div>

            <div style={styles.buttonRow}>
                <button style={styles.actionButton} type="submit">Sign Up</button>
                <button style={{ ...styles.actionButton, marginLeft: 16 }} type="button" onClick={() => navigate('/')}>Back</button>
            </div>
        </form>
    );
}

export default SignUp;  

const styles = {
    form: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: "20px",
        fontFamily: "Arial, sans-serif",
        gap: 12,
    },
    field: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        width: "100%",
        maxWidth: 520,
    },
    label: {
        marginBottom: 6,
        fontSize: 20,
        color: "#fff",
    },
    input: {
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        fontSize: 16,
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.02)",
        color: "#fff",
    },
    buttonRow: {
        display: "flex",
        justifyContent: "center",
        marginTop: 12,
    },
    actionButton: {
        background: "#111",
        color: "#fff",
        border: "none",
        padding: "14px 36px",
        borderRadius: 12,
        fontSize: 20,
        cursor: "pointer",
    }
};              