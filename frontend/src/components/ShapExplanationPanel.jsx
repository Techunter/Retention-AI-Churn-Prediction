import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

export default function ShapExplanationPanel({ prediction }) {
  if (!prediction) return null;

  const {
    top_risk_drivers = [],
    protective_factors = [],
    all_shap_contributions = [],
    explanation_summary,
    base_value,
  } = prediction;

  // Top 10 features by magnitude for clean horizontal bar chart
  const chartData = [...all_shap_contributions]
    .slice(0, 10)
    .reverse()
    .map((item) => ({
      name: item.feature_label,
      value: item.shap_value,
      featureValue: item.feature_value,
      impact: item.impact_type,
    }));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-navy-900">
            TreeSHAP Explainability Breakdown
          </h3>
          <p className="text-sm text-slate-500">
            Exact feature contributions calculated from the production XGBoost model (base log-odds: {base_value?.toFixed(3)})
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 text-red-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            Increases Churn Risk (+)
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Reduces Churn Risk (-)
          </span>
        </div>
      </div>

      {explanation_summary && (
        <div className="bg-navy-900/5 border border-navy-900/10 rounded-xl p-4 text-sm text-slate-700 leading-relaxed">
          <span className="font-semibold text-navy-900">AI Explanation: </span>
          {explanation_summary}
        </div>
      )}

      {/* Horizontal Feature Contribution Chart */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">
          Top 10 Feature Contributions (Aggregated by Original Attribute)
        </h4>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(v) => v.toFixed(2)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={165}
                tick={{ fontSize: 12, fill: "#1e293b", fontWeight: 500 }}
              />
              <ReferenceLine x={0} stroke="#475569" strokeWidth={1.5} />
              <Tooltip
                formatter={(value) => [
                  `${value >= 0 ? "+" : ""}${Number(value).toFixed(4)}`,
                  "SHAP Impact",
                ]}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  return item?.featureValue ? `${label}: ${item.featureValue}` : label;
                }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={20}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`shap-bar-${idx}`}
                    fill={entry.value >= 0 ? "#ef4444" : "#10b981"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-Column Breakdown: Top Risk Drivers vs Protective Factors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-red-600" />
            <h4 className="text-sm font-bold text-red-900">
              Top 5 Positive Risk Drivers
            </h4>
          </div>
          {top_risk_drivers.length === 0 ? (
            <p className="text-xs text-slate-500">
              No positive risk drivers detected for this profile.
            </p>
          ) : (
            <div className="space-y-2.5">
              {top_risk_drivers.map((driver) => (
                <div
                  key={driver.feature_name}
                  className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-lg border border-red-100 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {driver.feature_label}
                    </p>
                    <p className="text-xs text-slate-500">
                      Value: <span className="font-medium text-slate-700">{driver.feature_value}</span>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-xs font-bold tabular-nums">
                    +{driver.shap_value.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-emerald-900">
              Protective Factors (Reducing Risk)
            </h4>
          </div>
          {protective_factors.length === 0 ? (
            <p className="text-xs text-slate-500">
              No significant protective factors detected for this profile.
            </p>
          ) : (
            <div className="space-y-2.5">
              {protective_factors.map((factor) => (
                <div
                  key={factor.feature_name}
                  className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-lg border border-emerald-100 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {factor.feature_label}
                    </p>
                    <p className="text-xs text-slate-500">
                      Value: <span className="font-medium text-slate-700">{factor.feature_value}</span>
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold tabular-nums">
                    <TrendingDown className="w-3 h-3" />
                    {factor.shap_value.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
