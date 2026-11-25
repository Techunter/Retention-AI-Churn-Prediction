import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, Clock, RefreshCw, Sparkles, UserCheck } from "lucide-react";
import { customersApi, predictionsApi, recommendationsApi } from "../services/api";
import { RiskBadge, StatusBadge } from "../components/RiskBadge";
import ShapExplanationPanel from "../components/ShapExplanationPanel";
import { useToast } from "../context/ToastContext";

export default function CustomerRiskAnalysisPage() {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("customerId");

  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(initialId ? Number(initialId) : "");
  const [detail, setDetail] = useState(null);
  const [activePrediction, setActivePrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const res = await customersApi.list({ page: 1, page_size: 100 });
        const list = res.data.items || [];
        setCustomers(list);
        if (!initialId && list.length > 0) {
          const withPred = list.find((c) => c.latest_prediction_id) || list[0];
          setSelectedId(withPred.id);
        }
      } catch (err) {
        addToast("Failed to load customer directory.", "error");
      }
    };
    loadCustomers();
  }, [initialId, addToast]);

  const fetchCustomerDetail = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await customersApi.getDetail(id);
      setDetail(res.data);
      setActivePrediction(res.data.latest_prediction || null);
    } catch (err) {
      addToast(err.response?.data?.detail || "Failed to load customer detail.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) {
      fetchCustomerDetail(selectedId);
    }
  }, [selectedId]);

  const handleSelectCustomer = (e) => {
    const val = Number(e.target.value);
    setSelectedId(val);
    if (val) {
      setSearchParams({ customerId: String(val) });
    }
  };

  const handleLoadHistoricalPrediction = async (predId) => {
    try {
      const res = await predictionsApi.getById(predId);
      setActivePrediction(res.data);
    } catch (err) {
      addToast("Failed to load prediction snapshot.", "error");
    }
  };

  const handleRescoreCustomer = async () => {
    if (!detail?.customer) return;
    const c = detail.customer;
    setRescoring(true);
    try {
      await predictionsApi.predict({
        customer_db_id: c.id,
        customer_id: c.customer_id,
        gender: c.gender,
        senior_citizen: c.senior_citizen,
        partner: c.partner,
        dependents: c.dependents,
        tenure: c.tenure,
        phone_service: c.phone_service,
        multiple_lines: c.multiple_lines,
        internet_service: c.internet_service,
        online_security: c.online_security,
        online_backup: c.online_backup,
        device_protection: c.device_protection,
        tech_support: c.tech_support,
        streaming_tv: c.streaming_tv,
        streaming_movies: c.streaming_movies,
        contract: c.contract,
        paperless_billing: c.paperless_billing,
        payment_method: c.payment_method,
        monthly_charges: c.monthly_charges,
        total_charges: c.total_charges,
      });
      addToast(`Generated fresh prediction for ${c.customer_id}.`, "success");
      await fetchCustomerDetail(c.id);
    } catch (err) {
      addToast(err.response?.data?.detail || "Rescoring failed.", "error");
    } finally {
      setRescoring(false);
    }
  };

  const handleStatusChange = async (recId, newStatus) => {
    try {
      await recommendationsApi.updateStatus(recId, newStatus);
      addToast(`Action status updated to ${newStatus}.`, "success");
      await fetchCustomerDetail(selectedId);
    } catch (err) {
      addToast("Failed to update action status.", "error");
    }
  };

  const cust = detail?.customer;

  return (
    <div className="space-y-6">
      {/* Header & Selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Customer Risk Analysis
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Deep inspection of individual customer attributes, prediction history, SHAP drivers, and retention playbooks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedId}
            onChange={handleSelectCustomer}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-navy-900 shadow-sm focus:outline-none focus:border-blue-500 min-w-[260px]"
          >
            <option value="">Select a customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_id} — {c.latest_risk_category ? `${c.latest_risk_category} Risk` : "Unscored"}
              </option>
            ))}
          </select>

          {cust && (
            <button
              onClick={handleRescoreCustomer}
              disabled={rescoring}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rescoring ? "animate-spin" : ""}`} />
              {rescoring ? "Scoring..." : "Run Fresh Prediction"}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          Loading customer risk analysis...
        </div>
      )}

      {!loading && cust && (
        <>
          {/* Top Overview: Profile + Prediction History */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer Profile Card */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-navy-900 text-white flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-navy-900">
                      Customer {cust.customer_id}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {cust.gender} &bull; {cust.senior_citizen ? "Senior Citizen" : "Non-Senior"} &bull;{" "}
                      Partner: {cust.partner} &bull; Dependents: {cust.dependents}
                    </p>
                  </div>
                </div>
                <RiskBadge risk={activePrediction?.risk_category || cust.latest_risk_category} size="lg" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Tenure</p>
                  <p className="font-bold text-navy-900">{cust.tenure} months</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Contract</p>
                  <p className="font-bold text-navy-900">{cust.contract}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Monthly Charges</p>
                  <p className="font-bold text-navy-900">${cust.monthly_charges.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Total Charges</p>
                  <p className="font-bold text-navy-900">${cust.total_charges.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Internet Service</p>
                  <p className="font-semibold text-slate-700">{cust.internet_service}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Payment Method</p>
                  <p className="font-semibold text-slate-700">{cust.payment_method}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Online Security</p>
                  <p className="font-semibold text-slate-700">{cust.online_security}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Tech Support</p>
                  <p className="font-semibold text-slate-700">{cust.tech_support}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Online Backup</p>
                  <p className="font-semibold text-slate-700">{cust.online_backup}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Device Protection</p>
                  <p className="font-semibold text-slate-700">{cust.device_protection}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Streaming TV / Movies</p>
                  <p className="font-semibold text-slate-700">
                    {cust.streaming_tv} / {cust.streaming_movies}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Paperless Billing</p>
                  <p className="font-semibold text-slate-700">{cust.paperless_billing}</p>
                </div>
              </div>
            </div>

            {/* Historical Predictions Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-navy-900">Prediction History</h3>
              </div>
              {detail.predictions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-slate-400 text-sm">
                  <p>No prediction history recorded for this customer yet.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                  {detail.predictions.map((pred) => {
                    const isActive = activePrediction?.prediction_id === pred.id;
                    return (
                      <button
                        key={pred.id}
                        onClick={() => handleLoadHistoricalPrediction(pred.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          isActive
                            ? "border-blue-500 bg-blue-50/70 shadow-sm"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-navy-900 tabular-nums">
                            {pred.churn_probability_pct.toFixed(1)}%
                          </span>
                          <RiskBadge risk={pred.risk_category} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(pred.prediction_date).toLocaleString()}
                          </span>
                          <span>#{pred.id}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Active Prediction SHAP & Recommendation */}
          {activePrediction ? (
            <>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                        Recommended Retention Playbook
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-navy-900">
                      {activePrediction.recommendation.recommended_action}
                    </h3>
                    <p className="text-sm text-slate-600">
                      Driver: {activePrediction.recommendation.churn_reason}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={activePrediction.recommendation.action_status} />
                    <select
                      value={activePrediction.recommendation.action_status}
                      onChange={(e) =>
                        handleStatusChange(activePrediction.recommendation.id, e.target.value)
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Applied">Applied</option>
                      <option value="Retained">Retained</option>
                    </select>
                  </div>
                </div>
              </div>

              <ShapExplanationPanel prediction={activePrediction} />
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center space-y-3">
              <p className="text-slate-600 font-medium">
                This customer has not been scored yet.
              </p>
              <button
                onClick={handleRescoreCustomer}
                className="px-5 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-semibold"
              >
                Run XGBoost + TreeSHAP Analysis Now
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
