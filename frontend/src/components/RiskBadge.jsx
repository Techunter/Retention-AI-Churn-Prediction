import React from "react";

const RISK_STYLES = {
  Low: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-600",
    label: "Low Risk",
  },
  Medium: {
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    bar: "bg-orange-500",
    text: "text-orange-600",
    label: "Medium Risk",
  },
  High: {
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    bar: "bg-red-500",
    text: "text-red-600",
    label: "High Risk",
  },
};

export function RiskBadge({ risk, showDot = true, size = "sm" }) {
  if (!risk) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
        Unscored
      </span>
    );
  }
  const style = RISK_STYLES[risk] || RISK_STYLES.Low;
  const padding = size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${style.badge} ${padding}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {style.label}
    </span>
  );
}

export function StatusBadge({ status }) {
  const styles = {
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Applied: "bg-blue-50 text-blue-700 border-blue-200",
    Retained: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[status] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {status}
    </span>
  );
}

export function getRiskColorHex(risk) {
  if (risk === "High") return "#ef4444";
  if (risk === "Medium") return "#f59e0b";
  return "#10b981";
}
