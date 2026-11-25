import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { customersApi, predictionsApi } from "../services/api";
import { RiskBadge } from "../components/RiskBadge";
import { useToast } from "../context/ToastContext";

const INITIAL_FORM = {
  customer_id: "",
  gender: "Female",
  senior_citizen: 0,
  partner: "No",
  dependents: "No",
  tenure: 12,
  phone_service: "Yes",
  multiple_lines: "No",
  internet_service: "Fiber optic",
  online_security: "No",
  online_backup: "No",
  device_protection: "No",
  tech_support: "No",
  streaming_tv: "No",
  streaming_movies: "No",
  contract: "Month-to-month",
  paperless_billing: "Yes",
  payment_method: "Electronic check",
  monthly_charges: 75.5,
  total_charges: 906.0,
};

export default function CustomersPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("All");
  const [contractFilter, setContractFilter] = useState("All");
  const [internetFilter, setInternetFilter] = useState("All");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState(null);
  const [scoringBatch, setScoringBatch] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customersApi.list({
        page,
        page_size: 12,
        search: search || undefined,
        risk_category: riskFilter,
        contract: contractFilter,
        internet_service: internetFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setCustomers(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } catch (err) {
      addToast(err.response?.data?.detail || "Failed to load customers.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, riskFilter, contractFilter, internetFilter, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      addToast("Select the IBM Telco CSV file first.", "error");
      return;
    }
    setUploading(true);
    try {
      const res = await customersApi.uploadCsv(csvFile);
      setUploadStats(res.data);
      addToast(res.data.message, "success");
      setCsvFile(null);
      setPage(1);
      await fetchCustomers();
    } catch (err) {
      addToast(err.response?.data?.detail || "CSV upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleBatchScore = async () => {
    setScoringBatch(true);
    try {
      const res = await customersApi.batchScore(200);
      addToast(`Predicted churn & generated SHAP explanations for ${res.data.scored} customers.`, "success");
      await fetchCustomers();
    } catch (err) {
      addToast(err.response?.data?.detail || "Batch scoring failed.", "error");
    } finally {
      setScoringBatch(false);
    }
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormData(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEditModal = (cust) => {
    setEditingCustomer(cust);
    setFormData({
      customer_id: cust.customer_id,
      gender: cust.gender,
      senior_citizen: cust.senior_citizen,
      partner: cust.partner,
      dependents: cust.dependents,
      tenure: cust.tenure,
      phone_service: cust.phone_service,
      multiple_lines: cust.multiple_lines,
      internet_service: cust.internet_service,
      online_security: cust.online_security,
      online_backup: cust.online_backup,
      device_protection: cust.device_protection,
      tech_support: cust.tech_support,
      streaming_tv: cust.streaming_tv,
      streaming_movies: cust.streaming_movies,
      contract: cust.contract,
      paperless_billing: cust.paperless_billing,
      payment_method: cust.payment_method,
      monthly_charges: cust.monthly_charges,
      total_charges: cust.total_charges,
    });
    setModalOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        senior_citizen: Number(formData.senior_citizen),
        tenure: Number(formData.tenure),
        monthly_charges: Number(formData.monthly_charges),
        total_charges: Number(formData.total_charges),
      };
      if (editingCustomer) {
        const { customer_id: _cid, ...updatePayload } = payload;
        await customersApi.update(editingCustomer.id, updatePayload);
        addToast(`Updated customer ${editingCustomer.customer_id}.`, "success");
      } else {
        await customersApi.create(payload);
        addToast(`Created customer ${payload.customer_id}.`, "success");
      }
      setModalOpen(false);
      await fetchCustomers();
    } catch (err) {
      addToast(err.response?.data?.detail || "Failed to save customer.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (cust) => {
    if (!window.confirm(`Delete customer ${cust.customer_id} and all associated predictions?`)) {
      return;
    }
    try {
      await customersApi.remove(cust.id);
      addToast(`Deleted customer ${cust.customer_id}.`, "success");
      await fetchCustomers();
    } catch (err) {
      addToast(err.response?.data?.detail || "Delete failed.", "error");
    }
  };

  const handleQuickPredict = async (cust) => {
    try {
      const res = await predictionsApi.predict({
        customer_db_id: cust.id,
        customer_id: cust.customer_id,
        gender: cust.gender,
        senior_citizen: cust.senior_citizen,
        partner: cust.partner,
        dependents: cust.dependents,
        tenure: cust.tenure,
        phone_service: cust.phone_service,
        multiple_lines: cust.multiple_lines,
        internet_service: cust.internet_service,
        online_security: cust.online_security,
        online_backup: cust.online_backup,
        device_protection: cust.device_protection,
        tech_support: cust.tech_support,
        streaming_tv: cust.streaming_tv,
        streaming_movies: cust.streaming_movies,
        contract: cust.contract,
        paperless_billing: cust.paperless_billing,
        payment_method: cust.payment_method,
        monthly_charges: cust.monthly_charges,
        total_charges: cust.total_charges,
      });
      addToast(
        `${cust.customer_id}: ${res.data.risk_category} Risk (${res.data.churn_probability_pct}%)`,
        "success"
      );
      await fetchCustomers();
    } catch (err) {
      addToast(err.response?.data?.detail || "Prediction failed.", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
            Customer Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Import IBM Telco CSV datasets, manage customer records, and inspect churn risk tiers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleBatchScore}
            disabled={scoringBatch}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-navy-900 text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            {scoringBatch ? "Scoring Batch..." : "Batch Score Unpredicted"}
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* CSV Upload Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
        <form
          onSubmit={handleCsvUpload}
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-navy-900">
                Import IBM Telco Customer Churn CSV
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Validates all required columns, cleans whitespace, resolves blank TotalCharges (tenure = 0), and upserts into MySQL.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-navy-900 hover:file:bg-slate-200 cursor-pointer"
            />
            <button
              type="submit"
              disabled={uploading || !csvFile}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              {uploading ? "Importing..." : "Upload & Import CSV"}
            </button>
          </div>
        </form>

        {uploadStats && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[11px] uppercase font-semibold text-slate-400">Total Rows</p>
              <p className="text-lg font-bold text-navy-900">{uploadStats.total_rows}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3">
              <p className="text-[11px] uppercase font-semibold text-emerald-700">Inserted</p>
              <p className="text-lg font-bold text-emerald-700">{uploadStats.inserted}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-[11px] uppercase font-semibold text-blue-700">Updated</p>
              <p className="text-lg font-bold text-blue-700">{uploadStats.updated}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-[11px] uppercase font-semibold text-amber-700">Blank Charges Fixed</p>
              <p className="text-lg font-bold text-amber-700">{uploadStats.blank_total_charges_fixed}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[11px] uppercase font-semibold text-slate-500">Skipped</p>
              <p className="text-lg font-bold text-slate-700">{uploadStats.skipped}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search customer ID or method..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={riskFilter}
          onChange={(e) => {
            setRiskFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-500"
        >
          <option value="All">All Risk Categories</option>
          <option value="High">High Risk</option>
          <option value="Medium">Medium Risk</option>
          <option value="Low">Low Risk</option>
          <option value="Unscored">Unscored</option>
        </select>

        <select
          value={contractFilter}
          onChange={(e) => {
            setContractFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-500"
        >
          <option value="All">All Contract Types</option>
          <option value="Month-to-month">Month-to-month</option>
          <option value="One year">One year</option>
          <option value="Two year">Two year</option>
        </select>

        <select
          value={internetFilter}
          onChange={(e) => {
            setInternetFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-500"
        >
          <option value="All">All Internet Services</option>
          <option value="Fiber optic">Fiber optic</option>
          <option value="DSL">DSL</option>
          <option value="No">No Internet</option>
        </select>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5">Customer ID</th>
                <th className="px-4 py-3.5">Contract</th>
                <th className="px-4 py-3.5">Internet</th>
                <th className="px-4 py-3.5">
                  <button
                    onClick={() => handleSort("tenure")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-navy-900"
                  >
                    Tenure <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3.5">
                  <button
                    onClick={() => handleSort("monthly_charges")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-navy-900"
                  >
                    Monthly <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3.5">Churn Prob</th>
                <th className="px-4 py-3.5">Risk Tier</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading customer records...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No matching customer records found.
                  </td>
                </tr>
              ) : (
                customers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-navy-900">
                      {cust.customer_id}
                      <span className="block text-[11px] font-normal text-slate-400">
                        {cust.gender} &bull; {cust.payment_method}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{cust.contract}</td>
                    <td className="px-4 py-3.5 text-slate-600">{cust.internet_service}</td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-700">{cust.tenure} mo</td>
                    <td className="px-4 py-3.5 tabular-nums font-medium text-slate-800">
                      ${cust.monthly_charges.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums font-bold text-slate-800">
                      {cust.latest_churn_probability != null
                        ? `${(cust.latest_churn_probability * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <RiskBadge risk={cust.latest_risk_category} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleQuickPredict(cust)}
                          title="Run Live Prediction"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/risk-analysis?customerId=${cust.id}`)}
                          title="View Risk Analysis & SHAP"
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(cust)}
                          title="Edit Customer"
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(cust)}
                          title="Delete Customer"
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing page <strong className="text-navy-900">{page}</strong> of{" "}
            <strong className="text-navy-900">{totalPages}</strong> ({total.toLocaleString()} customers)
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 font-semibold"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 font-semibold"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Create/Edit Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-elevated max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-navy-900">
                {editingCustomer ? `Edit Customer ${editingCustomer.customer_id}` : "Add New Customer"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {!editingCustomer && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Customer ID</label>
                  <input
                    required
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    placeholder="e.g. 9999-ABCDE"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Senior Citizen</label>
                <select
                  value={formData.senior_citizen}
                  onChange={(e) => setFormData({ ...formData, senior_citizen: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value={0}>No (0)</option>
                  <option value={1}>Yes (1)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tenure (Months)</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  required
                  value={formData.tenure}
                  onChange={(e) => setFormData({ ...formData, tenure: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contract</label>
                <select
                  value={formData.contract}
                  onChange={(e) => setFormData({ ...formData, contract: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="Month-to-month">Month-to-month</option>
                  <option value="One year">One year</option>
                  <option value="Two year">Two year</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Internet Service</label>
                <select
                  value={formData.internet_service}
                  onChange={(e) => setFormData({ ...formData, internet_service: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="Fiber optic">Fiber optic</option>
                  <option value="DSL">DSL</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Online Security</label>
                <select
                  value={formData.online_security}
                  onChange={(e) => setFormData({ ...formData, online_security: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="No internet service">No internet service</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tech Support</label>
                <select
                  value={formData.tech_support}
                  onChange={(e) => setFormData({ ...formData, tech_support: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="No internet service">No internet service</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="Electronic check">Electronic check</option>
                  <option value="Mailed check">Mailed check</option>
                  <option value="Bank transfer (automatic)">Bank transfer (automatic)</option>
                  <option value="Credit card (automatic)">Credit card (automatic)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Charges ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={formData.monthly_charges}
                  onChange={(e) => setFormData({ ...formData, monthly_charges: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Total Charges ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={formData.total_charges}
                  onChange={(e) => setFormData({ ...formData, total_charges: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="sm:col-span-3 flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
