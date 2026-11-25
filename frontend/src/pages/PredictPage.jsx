import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { customersApi, predictionsApi } from "../services/api";
import { RiskBadge, StatusBadge } from "../components/RiskBadge";
import ShapExplanationPanel from "../components/ShapExplanationPanel";
import { useToast } from "../context/ToastContext";

const DEFAULT_INPUT = {
  customer_id: "",
  gender: "Female",
  senior_citizen: 0,
  partner: "No",
  dependents: "No",
  tenure: 2,
  contract: "Month-to-month",
  paperless_billing: "Yes",
  payment_method: "Electronic check",
  phone_service: "Yes",
  multiple_lines: "No",
  internet_service: "Fiber optic",
  online_security: "No",
  online_backup: "No",
  device_protection: "No",
  tech_support: "No",
  streaming_tv: "Yes",
  streaming_movies: "Yes",
  monthly_charges: 94.5,
  total_charges: 189.0,
};

export default function PredictPage() {
  const { addToast } = useToast();
  const [form, setForm] = useState(DEFAULT_INPUT);
  const [selectedDbId, setSelectedDbId] = useState(null);
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const loadSampleCustomers = async () => {
      try {
        const res = await customersApi.list({ page: 1, page_size: 50 });
        setExistingCustomers(res.data.items || []);
      } catch {
        // Optional helper dropdown
      }
    };
    loadSampleCustomers();
  }, []);

  const handleSelectExisting = (e) => {
    const dbId = Number(e.target.value);
    if (!dbId) {
      setSelectedDbId(null);
      return;
    }
    const cust = existingCustomers.find((c) => c.id === dbId);
    if (!cust) return;
    setSelectedDbId(cust.id);
    setForm({
      customer_id: cust.customer_id,
      gender: cust.gender,
      senior_citizen: cust.senior_citizen,
      partner: cust.partner,
      dependents: cust.dependents,
      tenure: cust.tenure,
      contract: cust.contract,
      paperless_billing: cust.paperless_billing,
      payment_method: cust.payment_method,
      phone_service: cust.phone_service,
      multiple_lines: cust.multiple_lines,
      internet_service: cust.internet_service,
      online_security: cust.online_security,
      online_backup: cust.online_backup,
      device_protection: cust.device_protection,
      tech_support: cust.tech_support,
      streaming_tv: cust.streaming_tv,
      streaming_movies: cust.streaming_movies,
      monthly_charges: cust.monthly_charges,
      total_charges: cust.total_charges,
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "phone_service" && value === "No") {
        next.multiple_lines = "No phone service";
      }
      if (field === "internet_service" && value === "No") {
        next.online_security = "No internet service";
        next.online_backup = "No internet service";
        next.device_protection = "No internet service";
        next.tech_support = "No internet service";
        next.streaming_tv = "No internet service";
        next.streaming_movies = "No internet service";
      }
      return next;
    });
  };

  const handleReset = () => {
    setForm(DEFAULT_INPUT);
    setSelectedDbId(null);
    setResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPredicting(true);
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id?.trim() || undefined,
        customer_db_id: selectedDbId || undefined,
        senior_citizen: Number(form.senior_citizen),
        tenure: Number(form.tenure),
        monthly_charges: Number(form.monthly_charges),
        total_charges: Number(form.total_charges),
      };
      const res = await predictionsApi.predict(payload);
      setResult(res.data);
      addToast(
        `Prediction saved for ${res.data.customer_id}: ${res.data.risk_category} Risk (${res.data.churn_probability_pct}%)`,
        "success"
      );
    } catch (err) {
      addToast(
        err.response?.data?.detail || "Prediction failed. Verify inputs and backend status.",
        "error"
      );
    } finally {
      setPredicting(false);
    }
  };

  const renderSelect = (label, field, options) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <select
        value={form[field]}
        onChange={(e) => handleChange(field, e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
    </div>
  );

  const internetDisabled = form.internet_service === "No";
  const phoneDisabled = form.phone_service === "No";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Live Churn Prediction & Explainability
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Score a telecom customer using XGBoost, inspect TreeSHAP drivers, and generate retention actions.
          </p>
        </div>

        {/* Existing Customer Prefill Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedDbId || ""}
            onChange={handleSelectExisting}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Load existing customer from MySQL...</option>
            {existingCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_id} — {c.contract} (${c.monthly_charges}/mo)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Prediction Input Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-6"
      >
        {/* Group 1: Demographic & Account */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 border-b border-slate-100 pb-2">
              Demographic Attributes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Customer ID (Optional)
                </label>
                <input
                  type="text"
                  value={form.customer_id}
                  onChange={(e) => handleChange("customer_id", e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {renderSelect("Gender", "gender", ["Female", "Male"])}
              {renderSelect("Senior Citizen", "senior_citizen", [
                { value: 0, label: "No (0)" },
                { value: 1, label: "Yes (1)" },
              ])}
              {renderSelect("Partner", "partner", ["Yes", "No"])}
              {renderSelect("Dependents", "dependents", ["Yes", "No"])}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 border-b border-slate-100 pb-2">
              Account & Billing Attributes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tenure (Months)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  required
                  value={form.tenure}
                  onChange={(e) => handleChange("tenure", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {renderSelect("Contract Type", "contract", [
                "Month-to-month",
                "One year",
                "Two year",
              ])}
              {renderSelect("Paperless Billing", "paperless_billing", ["Yes", "No"])}
              {renderSelect("Payment Method", "payment_method", [
                "Electronic check",
                "Mailed check",
                "Bank transfer (automatic)",
                "Credit card (automatic)",
              ])}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Monthly Charges ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1000}
                  required
                  value={form.monthly_charges}
                  onChange={(e) => handleChange("monthly_charges", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Total Charges ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100000}
                  required
                  value={form.total_charges}
                  onChange={(e) => handleChange("total_charges", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Group 2: Telecom Services */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 border-b border-slate-100 pb-2">
            Subscribed Services
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {renderSelect("Phone Service", "phone_service", ["Yes", "No"])}
            {renderSelect(
              "Multiple Lines",
              "multiple_lines",
              phoneDisabled ? ["No phone service"] : ["Yes", "No", "No phone service"]
            )}
            {renderSelect("Internet Service", "internet_service", [
              "Fiber optic",
              "DSL",
              "No",
            ])}
            {renderSelect(
              "Online Security",
              "online_security",
              internetDisabled ? ["No internet service"] : ["Yes", "No", "No internet service"]
            )}
            {renderSelect(
              "Online Backup",
              "online_backup",
              internetDisabled ? ["No internet service"] : ["Yes", "No", "No internet service"]
            )}
            {renderSelect(
              "Device Protection",
              "device_protection",
              internetDisabled ? ["No internet service"] : ["Yes", "No", "No internet service"]
            )}
            {renderSelect(
              "Tech Support",
              "tech_support",
              internetDisabled ? ["No internet service"] : ["Yes", "No", "No internet service"]
            )}
            {renderSelect(
              "Streaming TV",
              "streaming_tv",
              internetDisabled ? ["No internet service"] : ["Yes", "No", "No internet service"]
            )}
            {renderSelect(
              "Streaming Movies",
              "streaming_movies",
              internetDisabled ? ["No internet service"] : ["Yes", "No", "No internet service"]
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Form
          </button>
          <button
            type="submit"
            disabled={predicting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-navy-900 to-blue-700 hover:from-navy-800 hover:to-blue-600 text-white text-sm font-bold shadow-md transition-all disabled:opacity-60"
          >
            <BrainCircuit className="w-4 h-4" />
            {predicting ? "Running XGBoost + TreeSHAP..." : "PREDICT CHURN"}
          </button>
        </div>
      </form>

      {/* Prediction Output Section */}
      {result && (
        <div className="space-y-6">
          {/* Risk Score + Retention Recommendation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Churn Probability
                </span>
                <RiskBadge risk={result.risk_category} size="lg" />
              </div>

              <div className="my-5">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-5xl font-extrabold tabular-nums ${
                      result.risk_category === "High"
                        ? "text-red-600"
                        : result.risk_category === "Medium"
                        ? "text-orange-500"
                        : "text-emerald-600"
                    }`}
                  >
                    {result.churn_probability_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mt-3">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      result.risk_category === "High"
                        ? "bg-red-500"
                        : result.risk_category === "Medium"
                        ? "bg-orange-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, result.churn_probability_pct)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
                <span>Customer: <strong className="text-navy-900">{result.customer_id}</strong></span>
                <span>Priority: <strong className="text-navy-900">{result.priority_level}</strong></span>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {result.risk_category === "High" ? (
                      <ShieldAlert className="w-5 h-5 text-red-600" />
                    ) : result.risk_category === "Medium" ? (
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    )}
                    <h3 className="text-lg font-bold text-navy-900">
                      Personalized Retention Recommendation
                    </h3>
                  </div>
                  <StatusBadge status={result.recommendation.action_status} />
                </div>

                <div className="space-y-3 mt-4">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Identified Dominant Churn Reason
                    </p>
                    <p className="text-sm font-semibold text-navy-900 mt-1">
                      {result.recommendation.churn_reason}
                    </p>
                  </div>

                  <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Suggested Retention Action ({result.recommendation.priority} Priority)
                    </p>
                    <p className="text-base font-bold text-navy-900 mt-1">
                      {result.recommendation.recommended_action}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
                <span className="text-slate-500">
                  Persisted in MySQL (Prediction #{result.prediction_id})
                </span>
                <Link
                  to="/recommendations"
                  className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700"
                >
                  Open Retention Action Center <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Interactive SHAP Panel */}
          <ShapExplanationPanel prediction={result} />
        </div>
      )}
    </div>
  );
}
