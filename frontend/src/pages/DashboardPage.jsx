import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Percent,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { analyticsApi, customersApi } from "../services/api";
import { RiskBadge, StatusBadge } from "../components/RiskBadge";
import { useToast } from "../context/ToastContext";

export default function DashboardPage() {
  const { addToast } = useToast();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await analyticsApi.getSummary();
      setSummary(res.data);
    } catch (err) {
      addToast(
        err.response?.data?.detail || "Failed to load analytics summary.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleBatchScore = async () => {
    setScoring(true);
    try {
      const res = await customersApi.batchScore(200);
      addToast(`Scored ${res.data.scored} customer records using XGBoost + TreeSHAP.`, "success");
      await fetchSummary();
    } catch (err) {
      addToast(err.response?.data?.detail || "Batch scoring failed.", "error");
    } finally {
      setScoring(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading live analytics from MySQL...</p>
        </div>
      </div>
    );
  }

  const data = summary || {
    total_customers: 0,
    predicted_customers: 0,
    predicted_churners: 0,
    low_risk_count: 0,
    medium_risk_count: 0,
    high_risk_count: 0,
    average_churn_probability: 0,
    risk_distribution: [],
    tenure_vs_churn: [],
    contract_vs_churn: [],
    payment_method_analysis: [],
    recent_predictions: [],
    high_priority_actions: [],
  };

  const unscoredCount = Math.max(0, data.total_customers - data.predicted_customers);

  const kpis = [
    {
      label: "Total Customers",
      value: data.total_customers.toLocaleString(),
      sub: `${data.predicted_customers.toLocaleString()} scored`,
      icon: Users,
      accent: "bg-blue-50 text-blue-600",
    },
    {
      label: "Predicted Churners",
      value: data.predicted_churners.toLocaleString(),
      sub: "Probability ≥ 50%",
      icon: TrendingUp,
      accent: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "High-Risk Customers",
      value: data.high_risk_count.toLocaleString(),
      sub: "Probability ≥ 70%",
      icon: ShieldAlert,
      accent: "bg-red-50 text-red-600",
      valueColor: "text-red-600",
    },
    {
      label: "Medium-Risk Customers",
      value: data.medium_risk_count.toLocaleString(),
      sub: "35% – 69.9%",
      icon: AlertTriangle,
      accent: "bg-orange-50 text-orange-600",
      valueColor: "text-orange-600",
    },
    {
      label: "Low-Risk Customers",
      value: data.low_risk_count.toLocaleString(),
      sub: "Below 35%",
      icon: CheckCircle2,
      accent: "bg-emerald-50 text-emerald-600",
      valueColor: "text-emerald-600",
    },
    {
      label: "Avg Churn Probability",
      value: `${(data.average_churn_probability * 100).toFixed(1)}%`,
      sub: "Across scored accounts",
      icon: Percent,
      accent: "bg-slate-100 text-navy-900",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Churn Intelligence Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time customer risk telemetry, cohort churn patterns, and retention priorities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {unscoredCount > 0 && (
            <button
              onClick={handleBatchScore}
              disabled={scoring}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scoring ? "animate-spin" : ""}`} />
              {scoring ? "Scoring..." : `Score Unpredicted (${Math.min(unscoredCount, 200)})`}
            </button>
          )}
          <Link
            to="/customers"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-navy-900 text-xs font-semibold shadow-sm transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            Manage / Upload CSV
          </Link>
          <Link
            to="/predict"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            New Churn Prediction
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {kpi.label}
                </span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${kpi.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className={`text-2xl font-extrabold tabular-nums ${kpi.valueColor || "text-navy-900"}`}>
                  {kpi.value}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{kpi.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 1 Charts: Risk Distribution Donut + Risk Comparison Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-navy-900">Churn Risk Distribution</h2>
            <p className="text-xs text-slate-500">
              Proportion of scored customers across Low, Medium, and High risk tiers
            </p>
          </div>
          {data.predicted_customers === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              No predictions recorded yet. Run a prediction or batch score customers.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.risk_distribution}
                    dataKey="count"
                    nameKey="risk_category"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={95}
                    paddingAngle={4}
                    label={({ risk_category, percentage }) => `${risk_category}: ${percentage}%`}
                  >
                    {data.risk_distribution.map((entry) => (
                      <Cell key={entry.risk_category} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [`${val} customers`, `${name} Risk`]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-navy-900">Customer Risk Comparison</h2>
            <p className="text-xs text-slate-500">
              Headcount comparison by risk tier threshold
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.risk_distribution} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="risk_category" tick={{ fontSize: 12, fill: "#475569" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#475569" }} />
                <Tooltip
                  formatter={(val) => [`${val} customers`, "Count"]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={56}>
                  {data.risk_distribution.map((entry) => (
                    <Cell key={entry.risk_category} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Tenure vs Churn Line + Contract Type vs Churn Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-navy-900">Customer Tenure vs Churn Risk</h2>
            <p className="text-xs text-slate-500">
              Average predicted churn probability (%) across customer tenure cohorts
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.tenure_vs_churn.map((t) => ({
                  ...t,
                  avg_pct: Number((t.avg_churn_probability * 100).toFixed(1)),
                }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="tenure_bucket" tick={{ fontSize: 12, fill: "#475569" }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12, fill: "#475569" }} />
                <Tooltip
                  formatter={(value, name) =>
                    name === "avg_pct" ? [`${value}%`, "Avg Churn Probability"] : [value, "High-Risk Customers"]
                  }
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avg_pct"
                  name="Avg Churn Probability (%)"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#2563eb" }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-navy-900">Contract Type vs Churn Risk</h2>
            <p className="text-xs text-slate-500">
              Risk tier breakdown across Month-to-month, One year, and Two year contracts
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.contract_vs_churn} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#475569" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#475569" }} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }} />
                <Legend />
                <Bar dataKey="high_risk_count" name="High Risk" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="medium_risk_count" name="Medium Risk" stackId="a" fill="#f59e0b" />
                <Bar dataKey="low_risk_count" name="Low Risk" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Payment Method Analysis */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-navy-900">Payment Method Analysis</h2>
          <p className="text-xs text-slate-500">
            Average predicted churn probability (%) and risk concentration by billing method
          </p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.payment_method_analysis.map((p) => ({
                ...p,
                avg_pct: Number((p.avg_churn_probability * 100).toFixed(1)),
              }))}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#475569" }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12, fill: "#475569" }} />
              <Tooltip
                formatter={(val) => [`${val}%`, "Avg Churn Probability"]}
                contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
              />
              <Bar dataKey="avg_pct" name="Avg Churn Probability (%)" fill="#1d4ed8" radius={[8, 8, 0, 0]} barSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Recent Predictions + High-Priority Retention Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Predictions */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-navy-900">Recent Predictions</h2>
              <p className="text-xs text-slate-500">Latest customer scorings saved in MySQL</p>
            </div>
            <Link
              to="/risk-analysis"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              Inspect <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {data.recent_predictions.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No predictions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                    <th className="py-2.5 pr-3">Customer ID</th>
                    <th className="py-2.5 pr-3">Contract</th>
                    <th className="py-2.5 pr-3">Monthly</th>
                    <th className="py-2.5 pr-3">Probability</th>
                    <th className="py-2.5">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent_predictions.map((item) => (
                    <tr key={item.prediction_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 pr-3 font-semibold text-navy-900">
                        <Link
                          to={`/risk-analysis?customerId=${item.customer_db_id}`}
                          className="hover:text-blue-600 underline decoration-slate-300 underline-offset-2"
                        >
                          {item.customer_id}
                        </Link>
                      </td>
                      <td className="py-3 pr-3 text-slate-600 text-xs">{item.contract}</td>
                      <td className="py-3 pr-3 text-slate-700 tabular-nums">
                        ${item.monthly_charges.toFixed(2)}
                      </td>
                      <td className="py-3 pr-3 font-bold tabular-nums text-slate-800">
                        {(item.churn_probability * 100).toFixed(1)}%
                      </td>
                      <td className="py-3">
                        <RiskBadge risk={item.risk_category} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* High-Priority Retention Actions */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-red-500" />
              <div>
                <h2 className="text-base font-bold text-navy-900">
                  High-Priority Retention Actions
                </h2>
                <p className="text-xs text-slate-500">
                  Immediate interventions triggered by SHAP risk drivers
                </p>
              </div>
            </div>
            <Link
              to="/recommendations"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              Action Center <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {data.high_priority_actions.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No high-priority retention actions queued.
            </p>
          ) : (
            <div className="space-y-3">
              {data.high_priority_actions.map((action) => (
                <div
                  key={action.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-white transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Link
                      to={`/risk-analysis?customerId=${action.customer_db_id}`}
                      className="text-sm font-bold text-navy-900 hover:text-blue-600"
                    >
                      {action.customer_id}
                    </Link>
                    <StatusBadge status={action.action_status} />
                  </div>
                  <p className="text-xs font-medium text-red-700 mb-1">
                    Reason: {action.churn_reason}
                  </p>
                  <p className="text-xs text-slate-600">{action.recommended_action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
