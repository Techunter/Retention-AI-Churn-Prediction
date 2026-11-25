# Retention AI — AI-Powered Customer Churn Prediction & Retention Platform

Retention AI is an end-to-end, full-stack Customer Churn Intelligence and Retention Platform built for the telecommunications industry as a B.Tech Computer Science (Data Science) capstone project. It integrates a React + Tailwind CSS + Recharts SaaS frontend, a modular FastAPI backend, four benchmarked Machine Learning / Deep Learning models (with XGBoost in production), TreeSHAP feature explainability, a rule-based retention recommendation engine, JWT authentication, and MySQL 8.0 persistence.

---

## 1. Project Overview

Telecom operators face substantial revenue loss from customer attrition. Retention AI operationalizes the complete predictive retention workflow:

```
Customer Data → Data Preprocessing → XGBoost ML Prediction → Risk Classification → TreeSHAP Explainability → Retention Recommendation → MySQL 8.0 Storage → Interactive Analytics Dashboard
```

---

## 2. Key Features

- **JWT-Protected Multi-Page SaaS Dashboard**: Dark-navy & crisp light enterprise UI with protected routes, Axios token interceptors, loading states, form validation, and toast notifications.
- **Real-Time Analytics Dashboard**: Live KPI cards and Recharts visualizations (Risk Distribution Donut, Risk Comparison Bar, Tenure vs. Churn Line, Contract Type vs. Churn Stacked Bar, Payment Method Analysis, Recent Predictions, and High-Priority Retention Queue).
- **Customer Management & CSV Bulk Import**: Search, filter (risk tier, contract, internet service), sort (tenure, monthly charges), paginate, CRUD operations, and IBM Telco CSV upload with automated data cleaning (`TotalCharges` numeric conversion & blank handling for `tenure = 0`).
- **Live Churn Prediction & TreeSHAP Explainability**: Interactive 19-attribute prediction form (or existing customer prefill), real-time XGBoost inference, exact TreeSHAP feature attributions aggregated back to original Telco attributes, top 5 positive risk drivers, protective factors, and horizontal SHAP contribution chart.
- **Personalized Retention Action Center**: Dynamic rule-based + SHAP-driven recommendations prioritized by risk tier (`Low`, `Medium`, `High`) with persistent workflow tracking (`Pending` → `Applied` → `Retained`).
- **Four-Model Benchmarking Suite**: Reproducible training & evaluation comparing **Logistic Regression**, **Random Forest**, **XGBoost (Production)**, and **PyTorch MLP** across Accuracy, Precision, Recall, F1-Score, ROC-AUC, Confusion Matrix, and ROC curves.

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React.js, Vite, JavaScript, Tailwind CSS, Recharts, Axios, React Router, Lucide Icons |
| **Backend** | Python 3.10+, FastAPI, Pydantic v2, Uvicorn, SQLAlchemy 2.0 |
| **Machine Learning** | Pandas, NumPy, Scikit-learn, XGBoost, PyTorch, SHAP (`TreeExplainer`), Joblib |
| **Database** | MySQL 8.0+, PyMySQL, SQLAlchemy ORM |
| **Security** | JWT (`PyJWT`), Passlib (`pbkdf2_sha256`) password hashing, Bearer protected routes |
| **Testing** | Pytest, FastAPI `TestClient` |

---

## 4. System Architecture & Project Structure

```
retention-ai/
├── backend/
│   ├── app/
│   │   ├── main.py                         # FastAPI app, CORS, router registration
│   │   ├── database.py                     # SQLAlchemy 2.0 engine & session lifecycle
│   │   ├── core/
│   │   │   ├── config.py                   # Environment settings (.env)
│   │   │   └── security.py                 # JWT tokens, Passlib hashing, auth guard
│   │   ├── models/
│   │   │   └── models.py                   # 5 normalized MySQL ORM tables
│   │   ├── schemas/
│   │   │   └── schemas.py                  # Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py                     # /api/auth/login, /api/auth/me
│   │   │   ├── customers.py                # CRUD, search/filter, CSV upload, batch-score
│   │   │   ├── predictions.py              # /api/predict, /api/predictions/{id}
│   │   │   ├── analytics.py                # /api/analytics/summary
│   │   │   ├── recommendations.py          # /api/recommendations, status PATCH
│   │   │   └── models.py                   # /api/models/performance
│   │   ├── services/
│   │   │   ├── ml_service.py               # XGBoost inference + TreeSHAP attribution
│   │   │   ├── risk_engine.py              # Report risk thresholds (<0.35, 0.35-0.70, >=0.70)
│   │   │   ├── recommendation_engine.py    # Rule + SHAP retention decision matrix
│   │   │   └── prediction_persistence.py   # Transactional DB persistence
│   │   └── ml/
│   │       ├── preprocessing.py            # Cleaning + ColumnTransformer pipeline
│   │       └── mlp_model.py                # PyTorch ChurnMLP neural network
│   ├── training/
│   │   └── train_models.py                 # Reproducible 4-model training & evaluation
│   ├── artifacts/                          # Saved preprocessor, models, and metrics JSON
│   ├── scripts/
│   │   └── init_db.py                      # MySQL schema creation & demo/sample seeding
│   ├── tests/
│   │   └── test_retention_ai.py            # Pytest unit & integration tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/                     # RiskBadge, ShapExplanationPanel
│   │   ├── context/                        # AuthContext, ToastContext
│   │   ├── layouts/                        # DashboardLayout (dark navy sidebar)
│   │   ├── pages/                          # Login, Dashboard, Customers, Predict, RiskAnalysis, ActionCenter, ModelPerformance
│   │   └── services/                       # Centralized Axios client & JWT interceptors
│   ├── package.json
│   └── vite.config.js
├── dataset/
│   └── WA_Fn-UseC_-Telco-Customer-Churn.csv
└── README.md
```

---

## 5. MySQL Database Schema

Five normalized relational tables with foreign-key constraints and indexes:

1. `users` (`id`, `name`, `email`, `hashed_password`, `created_at`)
2. `customers` (`id`, `customer_id`, demographic/service/billing attributes, `created_at`)
3. `churn_predictions` (`id`, `customer_id` FK → `customers.id`, `churn_probability`, `risk_category`, `model_name`, `prediction_date`)
4. `shap_explanations` (`id`, `prediction_id` FK → `churn_predictions.id`, `feature_name`, `shap_value`, `impact_type`, `feature_rank`)
5. `retention_recommendations` (`id`, `prediction_id` FK → `churn_predictions.id`, `customer_id` FK → `customers.id`, `churn_reason`, `recommended_action`, `priority`, `action_status`, `created_at`)

---

## 6. Dataset & Machine Learning Methodology

- **Dataset**: IBM Telco Customer Churn (`dataset/WA_Fn-UseC_-Telco-Customer-Churn.csv`) — **7,043** records, **21** original columns (`customerID` excluded from training; **19** predictive features; target `Churn`).
- **Preprocessing**:
  - Whitespace cleaning across column names and string fields.
  - Numeric coercion of `TotalCharges`; blank `TotalCharges` for `tenure = 0` resolved to `0.0`.
  - Stratified split: **70% Training (4,930)**, **15% Validation (1,056)**, **15% Testing (1,057)**.
  - Scikit-learn `ColumnTransformer` (`StandardScaler` for numeric features, `OneHotEncoder(handle_unknown="ignore")` for categorical features) fitted **only on training data** to prevent target leakage.
- **Four Benchmarked Models**:
  1. **Logistic Regression**: L2 regularization, balanced class weights (baseline).
  2. **Random Forest**: 250–350 trees, tuned depth/leaf parameters, balanced subsample weights.
  3. **XGBoost (Production Model)**: Tuned learning rate, tree depth, subsampling, L1/L2 regularization, and `scale_pos_weight` for class imbalance.
  4. **PyTorch MLP**: Feed-forward network (`Linear → BatchNorm1d → ReLU → Dropout`) trained with `BCEWithLogitsLoss` (`pos_weight`) and AdamW.

---

## 7. Risk Classification & SHAP Explainability

- **Risk Thresholds**:
  - **Low Risk (Green)**: `probability < 0.35`
  - **Medium Risk (Orange)**: `0.35 ≤ probability < 0.70`
  - **High Risk (Red)**: `probability ≥ 0.70`
- **TreeSHAP Explainability**:
  - Computes exact log-odds SHAP values on the production XGBoost model.
  - Aggregates one-hot encoded column contributions back into the 19 original human-readable attributes.
  - Positive SHAP values indicate factors increasing churn risk; negative SHAP values indicate protective factors.
- **Retention Decision Matrix**:
  - Combines the risk category and the highest-magnitude positive SHAP driver to select the targeted retention playbook.

---

## 8. Installation & Setup (Windows)

### Prerequisites
- Python 3.10+ (tested on Python 3.14)
- Node.js 18+ and npm
- MySQL Server 8.0+ running locally on port `3306`

### Step 1: Configure MySQL & Environment Variables

1. Ensure MySQL 8.0 service (`MySQL80`) is running on Windows.
2. Copy the environment template inside `backend/`:
   ```powershell
   cd backend
   copy .env.example .env
   ```
3. Edit `backend\.env` and set your MySQL credentials (`MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE=retention_ai`) and a secure `JWT_SECRET_KEY`.

### Step 2: Backend Setup & Model Training

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Train & evaluate all 4 ML models (generates artifacts in backend/artifacts/)
python -m training.train_models

# Create MySQL database, tables, seed demo admin, and seed initial Telco predictions
python -m scripts.init_db
```

### Step 3: Start the FastAPI Backend

```powershell
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload
```
Backend API & interactive Swagger docs will be available at:
- API Base URL: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`

### Step 4: Start the React Frontend

Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 9. Demo Login Credentials

Seeded automatically by `python -m scripts.init_db`:
- **Email**: `admin@retentionai.com`
- **Password**: `Admin@123`

---

## 10. Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user and issue JWT token |
| `GET` | `/api/auth/me` | Get authenticated user profile |
| `GET` | `/api/customers` | Paginated customer list with search, filters, sorting, and latest risk |
| `GET` | `/api/customers/{id}` | Customer profile, prediction history, and latest SHAP analysis |
| `POST` | `/api/customers` | Create customer |
| `PUT` | `/api/customers/{id}` | Update customer |
| `DELETE` | `/api/customers/{id}` | Delete customer |
| `POST` | `/api/customers/upload` | Upload & import IBM Telco CSV into MySQL |
| `POST` | `/api/customers/batch-score` | Score unscored customers in MySQL |
| `POST` | `/api/predict` | Predict churn (XGBoost), compute TreeSHAP, generate recommendation, persist |
| `GET` | `/api/predictions/{id}` | Retrieve saved prediction, SHAP drivers, and recommendation |
| `GET` | `/api/analytics/summary` | Live dashboard KPIs & chart aggregations |
| `GET` | `/api/recommendations` | Retention action queue |
| `PATCH` | `/api/recommendations/{id}` | Update action status (`Pending`, `Applied`, `Retained`) |
| `GET` | `/api/models/performance` | Actual validation/test metrics, confusion matrices, and ROC curves |

---

## 11. Running Tests

```powershell
cd backend
venv\Scripts\activate
pytest -v
```

---

## 12. Troubleshooting

- **`Access denied for user 'root'@'localhost'`**: Verify `MYSQL_USER` and `MYSQL_PASSWORD` in `backend\.env` match your local MySQL 8.0 installation.
- **`Model artifacts are missing`**: Run `python -m training.train_models` inside `backend/` before starting Uvicorn or running `init_db.py`.
- **CORS errors in browser**: Ensure `CORS_ORIGINS` in `backend\.env` includes `http://localhost:5173`.
- **Port already in use**: Change backend port (`uvicorn app.main:app --port 8001`) and update `frontend/vite.config.js` proxy target accordingly.
