import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("retention_ai_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes("/api/auth/login")) {
      localStorage.removeItem("retention_ai_token");
      localStorage.removeItem("retention_ai_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email, password) => api.post("/api/auth/login", { email, password }),
  me: () => api.get("/api/auth/me"),
};

export const analyticsApi = {
  getSummary: () => api.get("/api/analytics/summary"),
};

export const customersApi = {
  list: (params) => api.get("/api/customers", { params }),
  getDetail: (id) => api.get(`/api/customers/${id}`),
  create: (data) => api.post("/api/customers", data),
  update: (id, data) => api.put(`/api/customers/${id}`, data),
  remove: (id) => api.delete(`/api/customers/${id}`),
  uploadCsv: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/api/customers/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  batchScore: (limit = 200) => api.post(`/api/customers/batch-score?limit=${limit}`),
};

export const predictionsApi = {
  predict: (payload) => api.post("/api/predict", payload),
  getById: (id) => api.get(`/api/predictions/${id}`),
};

export const recommendationsApi = {
  list: (params) => api.get("/api/recommendations", { params }),
  updateStatus: (id, action_status) =>
    api.patch(`/api/recommendations/${id}`, { action_status }),
};

export const modelsApi = {
  getPerformance: () => api.get("/api/models/performance"),
};

export default api;
