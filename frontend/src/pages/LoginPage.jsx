import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter both your email address and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmedEmail, password);
      addToast("Signed in to Retention AI successfully.", "success");
      navigate("/", { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        "Unable to sign in. Please verify your credentials and backend connection.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail("admin@retentionai.com");
    setPassword("Admin@123");
    setError("");
  };

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col lg:flex-row">
      {/* Left Brand Showcase */}
      <div className="lg:w-1/2 bg-gradient-to-br from-navy-900 via-navy-950 to-indigo-950 p-8 sm:p-12 lg:p-16 flex flex-col justify-between text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Retention AI</h1>
            <p className="text-xs text-blue-300 font-medium">
              Enterprise Telecom Churn Intelligence
            </p>
          </div>
        </div>

        <div className="relative z-10 my-12 lg:my-0 space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            XGBoost + TreeSHAP Explainable AI
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            Predict customer churn before it happens. Retain revenue with explainable precision.
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Built on the IBM Telco Customer Churn benchmark with calibrated risk tiers,
            TreeSHAP feature attribution, automated retention playbooks, and MySQL persistence.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
              <p className="text-xs text-slate-400">ML Models</p>
              <p className="text-lg font-bold text-white mt-0.5">4 Benchmarked</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
              <p className="text-xs text-slate-400">Explainability</p>
              <p className="text-lg font-bold text-white mt-0.5">TreeSHAP</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
              <p className="text-xs text-slate-400">Database</p>
              <p className="text-lg font-bold text-white mt-0.5">MySQL 8.0</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          Retention AI Platform &bull; B.Tech CSE (Data Science) Final-Year Capstone
        </p>
      </div>

      {/* Right Login Card */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-elevated p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-navy-900">Sign in to your account</h2>
            <p className="text-sm text-slate-500 mt-1">
              Access churn analytics, live predictions, and the retention action queue.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@retentionai.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-navy-900 hover:bg-navy-800 disabled:opacity-60 text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In to Retention AI"
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Demo Administrator Account
                </p>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  admin@retentionai.com / Admin@123
                </p>
              </div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-navy-900 transition-colors shrink-0"
              >
                Use Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
