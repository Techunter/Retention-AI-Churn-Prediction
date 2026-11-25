import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award, CheckCircle2, Cpu, Database } from "lucide-react";
import { modelsApi } from "../services/api";
import { useToast } from "../context/ToastContext";

const MODEL_COLORS = {
  logistic_regression: "#64748b",
  random_forest: "#0ea5e9",
  xgboost: "#2563eb",
  pytorch_mlp: "#8b5cf6",
};

export default function ModelPerformancePage() {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [selectedKey, setSelectedKey] = useState("xgboost");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPerformance = async () => {
      try {
        const res = await modelsApi.getPerformance();
        setData(res.data);
      } catch (err) {
        addToast(
          err.response?.data?.detail || "Failed to load trained model performance metrics.",
          "error"
        );
      } finally {
        setLoading(false);
      }
    };
    loadPerformance();
  }, [addToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-sm text-slate-500">
        Loading benchmark metrics from trained artifacts...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
        Model evaluation artifacts were not found. Run the training script first.
      </div>
    );
  }

  const { dataset_summary: ds, models } = data;
  const selectedModel = models.find((m) => m.model_key === selectedKey) || models[0];
  const cm = selectedModel?.confusion_matrix || [
    [0, 0],
    [0, 0],
  ];
  const totalCm = cm[0][0] + cm[0][1] + cm[1][0] + cm[1][1] || 1;

  // Prepare comparison chart data (Validation Metrics %)
  const comparisonData = models.map((m) => ({
    name: m.model_name,
    Accuracy: Number((m.validation_metrics.accuracy * 100).toFixed(2)),
    Precision: Number((m.validation_metrics.precision * 100).toFixed(2)),
    Recall: Number((m.validation_metrics.recall * 100).toFixed(2)),
    "F1-Score": Number((m.validation_metrics.f1_score * 100).toFixed(2)),
    "ROC-AUC": Number((m.validation_metrics.roc_auc * 100).toFixed(2)),
  }));

  // Build unified ROC curve points for Recharts LineChart
  const rocSeriesData = (selectedModel?.roc_curve || []).map((pt) => ({
    fpr: pt.fpr,
    tpr: pt.tpr,
    baseline: pt.fpr,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            ML Model Benchmarking & Evaluation
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Actual metrics computed on stratified validation and held-out test splits of the IBM Telco dataset.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold">
          <Award className="w-4 h-4 text-blue-600" />
          Production Model: {data.production_model}
        </div>
      </div>

      {/* Dataset Split Summary Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Dataset Records</p>
          <p className="text-xl font-extrabold text-navy-900 mt-1">
            {ds.total_records.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Input Features</p>
          <p className="text-xl font-extrabold text-navy-900 mt-1">
            {ds.predictive_features}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Train Split (70%)</p>
          <p className="text-xl font-extrabold text-blue-600 mt-1">
            {ds.splits.train.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Validation (15%)</p>
          <p className="text-xl font-extrabold text-indigo-600 mt-1">
            {ds.splits.validation.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Test Split (15%)</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">
            {ds.splits.test.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Base Churn Rate</p>
          <p className="text-xl font-extrabold text-navy-900 mt-1">{ds.churn_rate_pct}%</p>
        </div>
      </div>

      {/* Model Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-navy-900">
              Four-Model Validation & Test Comparison
            </h2>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Database className="w-3.5 h-3.5" /> {ds.dataset_file}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="px-6 py-3.5">Model Architecture</th>
                <th className="px-4 py-3.5">Split</th>
                <th className="px-4 py-3.5">Accuracy</th>
                <th className="px-4 py-3.5">Precision</th>
                <th className="px-4 py-3.5">Recall</th>
                <th className="px-4 py-3.5">F1-Score</th>
                <th className="px-4 py-3.5">ROC-AUC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {models.map((m) => (
                <React.Fragment key={m.model_key}>
                  <tr
                    className={`hover:bg-slate-50/80 cursor-pointer ${
                      m.is_production ? "bg-blue-50/30" : ""
                    }`}
                    onClick={() => setSelectedKey(m.model_key)}
                  >
                    <td className="px-6 py-3.5 font-bold text-navy-900">
                      <div className="flex items-center gap-2">
                        <span>{m.model_name}</span>
                        {m.is_production && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase">
                            <CheckCircle2 className="w-3 h-3" /> Production
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-500">Validation</td>
                    <td className="px-4 py-3.5 tabular-nums font-medium">
                      {(m.validation_metrics.accuracy * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-medium">
                      {(m.validation_metrics.precision * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-semibold text-blue-700">
                      {(m.validation_metrics.recall * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-semibold text-indigo-700">
                      {(m.validation_metrics.f1_score * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-bold text-navy-900">
                      {m.validation_metrics.roc_auc.toFixed(4)}
                    </td>
                  </tr>
                  {m.test_metrics && (
                    <tr
                      className={`text-xs text-slate-600 ${
                        m.is_production ? "bg-blue-50/15" : "bg-slate-50/30"
                      }`}
                      onClick={() => setSelectedKey(m.model_key)}
                    >
                      <td className="px-6 py-2.5 pl-10 text-slate-400">↳ Held-Out Test Evaluation</td>
                      <td className="px-4 py-2.5 font-semibold text-emerald-700">Test</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {(m.test_metrics.accuracy * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {(m.test_metrics.precision * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">
                        {(m.test_metrics.recall * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">
                        {(m.test_metrics.f1_score * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-bold text-navy-900">
                        {m.test_metrics.roc_auc.toFixed(4)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Comparison Bar Chart */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-navy-900">
            Validation Metric Comparison Across Models (%)
          </h2>
          <p className="text-xs text-slate-500">
            Comparison of Accuracy, Precision, Recall, F1-Score, and ROC-AUC on the stratified validation set
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#334155", fontWeight: 600 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              <Legend />
              <Bar dataKey="Accuracy" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Precision" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Recall" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F1-Score" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ROC-AUC" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Selector Tabs for Confusion Matrix & ROC Curve */}
      <div className="flex flex-wrap items-center gap-2">
        {models.map((m) => (
          <button
            key={m.model_key}
            onClick={() => setSelectedKey(m.model_key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
              selectedKey === m.model_key
                ? "bg-navy-900 text-white border-navy-900 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {m.model_name} {m.is_production ? "(Production)" : ""}
          </button>
        ))}
      </div>

      {/* Confusion Matrix + ROC Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="mb-5">
            <h2 className="text-base font-bold text-navy-900">
              Confusion Matrix — {selectedModel.model_name} (Test Set)
            </h2>
            <p className="text-xs text-slate-500">
              Evaluated on {ds.splits.test.toLocaleString()} held-out customer records (threshold = 0.50)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center">
              <p className="text-xs font-bold uppercase text-emerald-700">True Negative (TN)</p>
              <p className="text-3xl font-extrabold text-emerald-800 mt-1 tabular-nums">{cm[0][0]}</p>
              <p className="text-xs text-emerald-600 mt-1">
                {((cm[0][0] / totalCm) * 100).toFixed(1)}% &bull; Actual No / Pred No
              </p>
            </div>
            <div className="rounded-2xl bg-orange-50 border border-orange-200 p-5 text-center">
              <p className="text-xs font-bold uppercase text-orange-700">False Positive (FP)</p>
              <p className="text-3xl font-extrabold text-orange-700 mt-1 tabular-nums">{cm[0][1]}</p>
              <p className="text-xs text-orange-600 mt-1">
                {((cm[0][1] / totalCm) * 100).toFixed(1)}% &bull; Actual No / Pred Yes
              </p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center">
              <p className="text-xs font-bold uppercase text-red-700">False Negative (FN)</p>
              <p className="text-3xl font-extrabold text-red-700 mt-1 tabular-nums">{cm[1][0]}</p>
              <p className="text-xs text-red-600 mt-1">
                {((cm[1][0] / totalCm) * 100).toFixed(1)}% &bull; Actual Yes / Pred No
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 text-center">
              <p className="text-xs font-bold uppercase text-blue-700">True Positive (TP)</p>
              <p className="text-3xl font-extrabold text-blue-800 mt-1 tabular-nums">{cm[1][1]}</p>
              <p className="text-xs text-blue-600 mt-1">
                {((cm[1][1] / totalCm) * 100).toFixed(1)}% &bull; Actual Yes / Pred Yes
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-navy-900">
              ROC Curve — {selectedModel.model_name} (Test AUC: {selectedModel.test_metrics?.roc_auc?.toFixed(4)})
            </h2>
            <p className="text-xs text-slate-500">
              True Positive Rate vs. False Positive Rate across classification thresholds
            </p>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rocSeriesData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="fpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  label={{ value: "False Positive Rate", position: "insideBottom", offset: -3, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  label={{ value: "True Positive Rate", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(val, name) => [Number(val).toFixed(4), name]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="tpr"
                  name={`${selectedModel.model_name} ROC`}
                  stroke={MODEL_COLORS[selectedModel.model_key] || "#2563eb"}
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="linear"
                  dataKey="baseline"
                  name="Random Baseline (0.50)"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
