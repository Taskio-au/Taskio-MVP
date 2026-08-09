import React, { useEffect, useMemo, useState } from "react";
import { getAuth, applyActionCode } from "firebase/auth";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import BrandLogo from "../design/components/BrandLogo";

export default function AuthActionPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    const mode = params.get("mode");
    const oobCode = params.get("oobCode");

    if (!mode || !oobCode) {
      setStatus("invalid");
      setDetail("This link is missing required parameters. Please request a new verification email and try again.");
      return;
    }

    const auth = getAuth();

    if (mode === "verifyEmail") {
      applyActionCode(auth, oobCode)
        .then(() => {
          setStatus("success");
          setDetail("Your email address has been verified. You can now sign in to Taskio.");
          setTimeout(() => navigate("/login"), 2200);
        })
        .catch((err) => {
          setStatus("error");
          // Firebase common cases: auth/invalid-action-code, auth/expired-action-code, auth/user-disabled
          const code = err?.code;
          if (code === "auth/expired-action-code") {
            setDetail("This verification link has expired. Please request a new one and try again.");
          } else if (code === "auth/invalid-action-code") {
            setDetail("This verification link is invalid or has already been used. Please request a new one.");
          } else {
            setDetail("We couldn't verify your email at this time. Please try again or contact support if the issue persists.");
          }
        });
    } else {
      setStatus("unsupported");
      setDetail("This link type isn’t supported in Taskio yet. Please return to sign in.");
    }
  }, [params, navigate]);

  const content = useMemo(() => {
    switch (status) {
      case "loading":
        return {
          tone: "neutral",
          title: "Verifying your email",
          subtitle: "Please wait a moment. This usually takes just a few seconds.",
          showSpinner: true,
          primary: null,
          secondary: null,
        };
      case "success":
        return {
          tone: "success",
          title: "Email verified",
          subtitle: detail || "Your email address has been verified successfully.",
          showSpinner: false,
          primary: { label: "Continue to login", to: "/login" },
          secondary: { label: "Back to home", to: "/" },
        };
      case "error":
        return {
          tone: "error",
          title: "Verification failed",
          subtitle: detail || "We couldn’t verify your email. Please try again.",
          showSpinner: false,
          primary: { label: "Go to login", to: "/login" },
          secondary: { label: "Back to home", to: "/" },
        };
      case "invalid":
        return {
          tone: "warning",
          title: "Invalid link",
          subtitle: detail || "This verification link is invalid. Please request a new one.",
          showSpinner: false,
          primary: { label: "Go to login", to: "/login" },
          secondary: { label: "Back to home", to: "/" },
        };
      default:
        return {
          tone: "neutral",
          title: "Unsupported action",
          subtitle: detail || "This action isn’t supported.",
          showSpinner: false,
          primary: { label: "Go to login", to: "/login" },
          secondary: { label: "Back to home", to: "/" },
        };
    }
  }, [status, detail]);

  const toneStyles = {
    success: { bg: "#F0FDF4", border: "#86EFAC", fg: "#16A34A", icon: "check" },
    error: { bg: "#FEF2F2", border: "#FCA5A5", fg: "#DC2626", icon: "error" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", fg: "#B45309", icon: "warn" },
    neutral: { bg: "#F9FAFB", border: "#E5E7EB", fg: "#374151", icon: "info" },
  };
  const tone = toneStyles[content.tone] || toneStyles.neutral;

  const Icon = () => {
    if (content.showSpinner) return <Spinner />;
    switch (tone.icon) {
      case "check":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" stroke={tone.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case "error":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 9v4" stroke={tone.fg} strokeWidth="2" strokeLinecap="round" />
            <path d="M12 17h.01" stroke={tone.fg} strokeWidth="3" strokeLinecap="round" />
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke={tone.fg}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "warn":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke={tone.fg}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M12 9v4" stroke={tone.fg} strokeWidth="2" strokeLinecap="round" />
            <path d="M12 17h.01" stroke={tone.fg} strokeWidth="3" strokeLinecap="round" />
          </svg>
        );
      default:
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 16v-4" stroke={tone.fg} strokeWidth="2" strokeLinecap="round" />
            <path d="M12 8h.01" stroke={tone.fg} strokeWidth="3" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke={tone.fg} strokeWidth="2" />
          </svg>
        );
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <BrandLogo to="/" style={styles.logoLink} />
      </header>

      <main style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.banner, backgroundColor: tone.bg, borderColor: tone.border }}>
            <div style={{ ...styles.bannerIconWrap, backgroundColor: "#FFFFFF" }}>
              <Icon />
            </div>
            <div style={styles.bannerText}>
              <div style={styles.bannerTitle}>{content.title}</div>
              <div style={styles.bannerSubtitle}>{content.subtitle}</div>
            </div>
          </div>

          <div style={styles.actions}>
            {content.primary ? (
              <Link to={content.primary.to} style={styles.primaryBtn}>
                {content.primary.label}
              </Link>
            ) : (
              <button type="button" style={{ ...styles.primaryBtn, ...styles.primaryBtnDisabled }} disabled>
                Please wait…
              </button>
            )}

            {content.secondary ? (
              <Link to={content.secondary.to} style={styles.secondaryBtn}>
                {content.secondary.label}
              </Link>
            ) : null}
          </div>

          {status === "error" ? (
            <div style={styles.helpRow}>
              Need help?{" "}
              <Link to="/support" style={styles.helpLink}>
                Contact support
              </Link>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#D1D5DB" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#14C5C5" strokeWidth="2" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

const styles = {
  page: {
    fontFamily: "Inter, sans-serif",
    minHeight: "100vh",
    backgroundColor: "#F7F9FA",
  },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    padding: "16px 32px",
  },
  logoLink: {
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
  },
  logo: {
    height: "45px",
    width: "auto",
  },
  container: {
    display: "flex",
    justifyContent: "center",
    padding: "72px 24px",
  },
  card: {
    width: "100%",
    maxWidth: "640px",
    backgroundColor: "#FFFFFF",
    borderRadius: "20px",
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
    padding: "28px",
  },
  banner: {
    display: "flex",
    gap: "14px",
    alignItems: "flex-start",
    padding: "18px",
    borderRadius: "16px",
    border: "1px solid",
  },
  bannerIconWrap: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
    flex: "0 0 auto",
  },
  bannerText: {
    flex: "1 1 auto",
  },
  bannerTitle: {
    fontFamily: "Poppins, sans-serif",
    fontSize: "20px",
    fontWeight: 650,
    color: "#111827",
    marginBottom: "6px",
    lineHeight: 1.2,
  },
  bannerSubtitle: {
    fontSize: "14px",
    color: "#6B7280",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: "12px",
    marginTop: "22px",
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "12px 18px",
    backgroundColor: "#14C5C5",
    color: "#FFFFFF",
    borderRadius: "12px",
    fontWeight: 600,
    fontSize: "14px",
    textDecoration: "none",
    boxShadow: "0 4px 12px rgba(20, 197, 197, 0.22)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
  },
  primaryBtnDisabled: {
    backgroundColor: "#D1D5DB",
    boxShadow: "none",
    cursor: "not-allowed",
  },
  secondaryBtn: {
    padding: "12px 18px",
    backgroundColor: "#FFFFFF",
    color: "#374151",
    borderRadius: "12px",
    fontWeight: 600,
    fontSize: "14px",
    textDecoration: "none",
    border: "1px solid #E5E7EB",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  helpRow: {
    marginTop: "18px",
    fontSize: "13px",
    color: "#6B7280",
  },
  helpLink: {
    color: "#14C5C5",
    textDecoration: "none",
    fontWeight: 600,
  },
};
