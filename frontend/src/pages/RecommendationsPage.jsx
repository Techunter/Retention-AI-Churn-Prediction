import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Filter, Search, ShieldAlert } from "lucide-react";
import { recommendationsApi } from "../services/api";
import { RiskBadge, StatusBadge } from "../components/RiskBadge";
import { useToast } from "../context/ToastContext";

export default function RecommendationsPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [countsByPriority, setCountsByPriority] = useState({ High: 0, Medium: 0, Low: 0 });
  const [countsByStatus, setCountsByStatus] = useState({ Pending: 0, Applied: 0, Retained: 0 });
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recommendationsApi.list({
        priority: priorityFilter,
        action_status: statusFilter,
        search: search || undefined,
      });
      setItems(res.data.items || []);
      setCountsByPriority(res.data.counts_by_priority || { High: 0, Medium: 0, Low: 0 });
      setCountsByStatus(res.data.counts_by_status || { Pending: 0, Applied: 0, Retained: 0 });
    } catch (err) {
      addToast(err.response?.data?.detail || "Failed to load recommendation queue.", "error");
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, statusFilter, search, addToast]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleUpdateStatus = async (recId, nextStatus) => {
    setUpdatingId(recId);
    try {
      await recommendationsApi.updateStatus(recId, nextStatus);
      addToast(`Recommendation #${recId} marked as ${nextStatus}.`, "success");
      await fetchQueue();
    } catch (err) {
      addToast(err.response?.data?.detail || "Status update failed.", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
          Retention Action Center
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Execute driver-specific retention interventions prioritized by risk tier and track customer outcomes in MySQL.
        </p>
      </div>

      {/* Priority & Status KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-2xl border border-red-200/80 p-4 shadow-card">
          <p className="text-xs font-semibold text-red-600 uppercase">High Priority</p>
          <p className="text-2xl font-extrabold text-red-600 mt-1">{countsByPriority.High}</p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-200/80 p-4 shadow-card">
          <p className="text-xs font-semibold text-orange-600 uppercase">Medium Priority</p>
          <p className="text-2xl font-extrabold text-orange-500 mt-1">{countsByPriority.Medium}</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-card">
          <p className="text-xs font-semibold text-emerald-600 uppercase">Low Priority</p>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{countsByPriority.Low}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
          <p className="text-xs font-semibold text-amber-600 uppercase">Pending</p>
          <p className="text-2xl font-extrabold text-navy-900 mt-1">{countsByStatus.Pending}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
          <p className="text-xs font-semibold text-blue-600 uppercase">Applied</p>
          <p className="text-2xl font-extrabold text-navy-900 mt-1">{countsByStatus.Applied}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
          <p className="text-xs font-semibold text-emerald-600 uppercase">Retained</p>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{countsByStatus.Retained}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 mr-1" />
          {["All", "High", "Medium", "Low"].map((prio) => (
            <button
              key={prio}
              onClick={() => setPriorityFilter(prio)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                priorityFilter === prio
                  ? "bg-navy-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {prio === "All" ? "All Priorities" : `${prio} Priority`}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Applied">Applied</option>
            <option value="Retained">Retained</option>
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter customer or action..."
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Recommendations Queue */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            Loading retention queue...
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            No retention recommendations match your active filters.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    to={`/risk-analysis?customerId=${item.customer_db_id}`}
                    className="text-base font-bold text-navy-900 hover:text-blue-600 underline decoration-slate-300 underline-offset-2"
                  >
                    {item.customer_id}
                  </Link>
                  <RiskBadge risk={item.risk_category} />
                  <span className="text-xs font-bold tabular-nums text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {(item.churn_probability * 100).toFixed(1)}% Churn Prob
                  </span>
                  <StatusBadge status={item.action_status} />
                </div>

                <p className="text-sm font-bold text-navy-900 flex items-start gap-2">
                  {item.priority === "High" ? (
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  ) : item.priority === "Medium" ? (
                    <ClipboardCheck className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  )}
                  <span>{item.recommended_action}</span>
                </p>

                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Identified Reason:</span>{" "}
                  {item.churn_reason}
                </p>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                  <span>Contract: <strong className="text-slate-700">{item.contract}</strong></span>
                  <span>Tenure: <strong className="text-slate-700">{item.tenure} mo</strong></span>
                  <span>Monthly: <strong className="text-slate-700">${item.monthly_charges.toFixed(2)}</strong></span>
                  <span>Internet: <strong className="text-slate-700">{item.internet_service}</strong></span>
                  <span>Payment: <strong className="text-slate-700">{item.payment_method}</strong></span>
                </div>
              </div>

              {/* Action Status Buttons */}
              <div className="flex items-center gap-2 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                {["Pending", "Applied", "Retained"].map((statusOption) => {
                  const active = item.action_status === statusOption;
                  return (
                    <button
                      key={statusOption}
                      disabled={updatingId === item.id || active}
                      onClick={() => handleUpdateStatus(item.id, statusOption)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        active
                          ? statusOption === "Retained"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : statusOption === "Applied"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      } disabled:opacity-80`}
                    >
                      {statusOption}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
