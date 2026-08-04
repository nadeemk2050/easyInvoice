import { useState } from "react";
import { auth } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";

const inputStyle = {
  display: "block", width: "100%", marginTop: 4, marginBottom: 14,
  padding: "10px 12px", fontSize: 14, border: "1px solid #d4d4d4",
  borderRadius: 6, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      onLogin();
    } catch (err) {
      setError(err.message.replace("Firebase: ", "").replace(/\(auth\/.*\)/, "").trim() || "Something went wrong");
    }
    setBusy(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f4f4f2", fontFamily: "Arial, Helvetica, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 32, width: 380,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, textAlign: "center", marginBottom: 4 }}>
          easyInvoice
        </div>
        <div style={{ fontSize: 13, color: "#888", textAlign: "center", marginBottom: 24 }}>
          {mode === "login" ? "Sign in to your account" : "Create a new account"}
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={inputStyle} placeholder="you@company.com" required />

          <label style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>Password</label>
          <div style={{ position: "relative" }}>
            <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              style={inputStyle} placeholder="At least 6 characters" required minLength={6} />
            <span onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 10, top: 10, cursor: "pointer", fontSize: 18, userSelect: "none" }}>
              {showPw ? "👁️" : "👁️‍🗨️"}
            </span>
          </div>

          {error && <div style={{ fontSize: 12, color: "#b3261e", marginBottom: 12 }}>{error}</div>}

          <button type="submit" disabled={busy} style={{
            width: "100%", padding: "11px", fontSize: 14, fontWeight: 700,
            border: "none", borderRadius: 7, background: busy ? "#8a8a8a" : "#1c1c1c",
            color: "#fff", cursor: "pointer", marginBottom: 14,
          }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", fontSize: 13 }}>
          {mode === "login" ? (
            <>Don't have an account?{" "}
              <button onClick={() => { setMode("signup"); setError(""); }}
                style={{ background: "none", border: "none", color: "#1a4fa0", cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" }}>
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(""); }}
                style={{ background: "none", border: "none", color: "#1a4fa0", cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
