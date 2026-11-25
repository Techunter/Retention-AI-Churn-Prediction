import io
import json
from pathlib import Path
from typing import Generator

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.main import app
from app.ml.preprocessing import ALL_MODEL_FEATURES, clean_telco_dataframe
from app.models.models import ChurnPrediction, Customer, RetentionRecommendation, ShapExplanation, User
from app.services.ml_service import get_prediction_service, load_model_evaluation_results
from app.services.recommendation_engine import generate_retention_recommendation
from app.services.risk_engine import classify_churn_risk


# --- Isolated Test Database Setup (SQLite in-memory with StaticPool for FastAPI TestClient) ---
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    Base.metadata.create_all(bind=TEST_ENGINE)
    db = TestingSessionLocal()
    if not db.query(User).filter(User.email == "admin@retentionai.com").first():
        db.add(
            User(
                name="Test Admin",
                email="admin@retentionai.com",
                hashed_password=hash_password("Admin@123"),
            )
        )
        db.commit()
    db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=TEST_ENGINE)


def get_auth_headers(client: TestClient) -> dict[str, str]:
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@retentionai.com", "password": "Admin@123"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# --- 1. Risk Classification Boundary Tests ---


@pytest.mark.parametrize(
    "probability,expected_category,expected_color",
    [
        (0.00, "Low", "green"),
        (0.34, "Low", "green"),
        (0.35, "Medium", "orange"),
        (0.69, "Medium", "orange"),
        (0.70, "High", "red"),
        (1.00, "High", "red"),
    ],
)
def test_risk_classification_boundaries(probability: float, expected_category: str, expected_color: str):
    result = classify_churn_risk(probability)
    assert result.risk_category == expected_category
    assert result.risk_color == expected_color
    assert result.priority_level == expected_category


def test_risk_classification_invalid_probability():
    with pytest.raises(ValueError):
        classify_churn_risk(-0.01)
    with pytest.raises(ValueError):
        classify_churn_risk(1.01)


# --- 2. Data Preprocessing & Cleaning Tests ---


def test_clean_telco_dataframe_handles_blank_total_charges_and_whitespace():
    df = pd.DataFrame(
        [
            {
                "customerID": " 0001-TEST ",
                "gender": " Female ",
                "SeniorCitizen": "0",
                "Partner": "Yes",
                "Dependents": "No",
                "tenure": "0",
                "PhoneService": "No",
                "MultipleLines": "No phone service",
                "InternetService": "DSL",
                "OnlineSecurity": "Yes",
                "OnlineBackup": "No",
                "DeviceProtection": "Yes",
                "TechSupport": "Yes",
                "StreamingTV": "No",
                "StreamingMovies": "No",
                "Contract": " Two year ",
                "PaperlessBilling": "No",
                "PaymentMethod": "Mailed check",
                "MonthlyCharges": "50.25",
                "TotalCharges": "   ",
            }
        ]
    )
    cleaned, fixed = clean_telco_dataframe(df)
    assert fixed == 1
    assert cleaned.loc[0, "customerID"] == "0001-TEST"
    assert cleaned.loc[0, "Contract"] == "Two year"
    assert float(cleaned.loc[0, "TotalCharges"]) == 0.0
    assert len(ALL_MODEL_FEATURES) == 19
    assert "customerID" not in ALL_MODEL_FEATURES


# --- 3. Retention Recommendation Mapping Tests ---


def test_recommendation_high_risk_contract_vs_charges_priority():
    customer = {
        "contract": "Month-to-month",
        "monthly_charges": 95.0,
        "internet_service": "Fiber optic",
        "tech_support": "No",
        "online_security": "No",
        "payment_method": "Electronic check",
        "tenure": 3,
    }
    # Case A: Contract has highest positive SHAP
    shap_a = [
        {"feature_name": "Contract", "feature_label": "Contract Type", "shap_value": 0.72},
        {"feature_name": "MonthlyCharges", "feature_label": "Monthly Charges ($)", "shap_value": 0.30},
        {"feature_name": "TechSupport", "feature_label": "Tech Support", "shap_value": 0.15},
    ]
    rec_a = generate_retention_recommendation(customer, "High", shap_a)
    assert rec_a.priority == "High"
    assert "annual contract migration" in rec_a.recommended_action.lower()

    # Case B: Missing TechSupport/OnlineSecurity has highest positive SHAP
    shap_b = [
        {"feature_name": "OnlineSecurity", "feature_label": "Online Security", "shap_value": 0.85},
        {"feature_name": "Contract", "feature_label": "Contract Type", "shap_value": 0.40},
    ]
    rec_b = generate_retention_recommendation(customer, "High", shap_b)
    assert "three-month security and priority support" in rec_b.recommended_action.lower()

    # Case C: High MonthlyCharges / Fiber optic has highest positive SHAP
    shap_c = [
        {"feature_name": "InternetService", "feature_label": "Internet Service", "shap_value": 0.91},
        {"feature_name": "Contract", "feature_label": "Contract Type", "shap_value": 0.25},
    ]
    rec_c = generate_retention_recommendation(customer, "High", shap_c)
    assert "bundled service credit" in rec_c.recommended_action.lower()


def test_recommendation_medium_and_low_risk_mapping():
    med_cust = {
        "contract": "One year",
        "monthly_charges": 55.0,
        "internet_service": "DSL",
        "tech_support": "Yes",
        "online_security": "Yes",
        "payment_method": "Electronic check",
        "tenure": 2,
    }
    rec_med_echeck = generate_retention_recommendation(
        med_cust,
        "Medium",
        [
            {"feature_name": "PaymentMethod", "feature_label": "Payment Method", "shap_value": 0.45},
            {"feature_name": "tenure", "feature_label": "Account Tenure (Months)", "shap_value": 0.20},
        ],
    )
    assert rec_med_echeck.priority == "Medium"
    assert "automatic billing enrollment" in rec_med_echeck.recommended_action.lower()

    rec_med_tenure = generate_retention_recommendation(
        {**med_cust, "payment_method": "Mailed check"},
        "Medium",
        [{"feature_name": "tenure", "feature_label": "Account Tenure (Months)", "shap_value": 0.50}],
    )
    assert "onboarding check-in" in rec_med_tenure.recommended_action.lower()

    low_cust = {
        "contract": "Two year",
        "monthly_charges": 40.0,
        "internet_service": "DSL",
        "tech_support": "Yes",
        "online_security": "Yes",
        "payment_method": "Bank transfer (automatic)",
        "tenure": 60,
    }
    rec_low = generate_retention_recommendation(low_cust, "Low", [])
    assert rec_low.priority == "Low"
    assert "referral rewards" in rec_low.recommended_action.lower()


# --- 4. ML Artifacts & TreeSHAP Service Tests ---


def test_ml_artifacts_and_treeshap_execution():
    results = load_model_evaluation_results()
    assert results["production_model"] == "XGBoost"
    assert len(results["models"]) == 4
    model_names = {m["model_name"] for m in results["models"]}
    assert model_names == {"Logistic Regression", "Random Forest", "XGBoost", "PyTorch MLP"}

    service = get_prediction_service()
    sample_high_risk = {
        "gender": "Female",
        "senior_citizen": 1,
        "partner": "No",
        "dependents": "No",
        "tenure": 1,
        "phone_service": "Yes",
        "multiple_lines": "No",
        "internet_service": "Fiber optic",
        "online_security": "No",
        "online_backup": "No",
        "device_protection": "No",
        "tech_support": "No",
        "streaming_tv": "Yes",
        "streaming_movies": "Yes",
        "contract": "Month-to-month",
        "paperless_billing": "Yes",
        "payment_method": "Electronic check",
        "monthly_charges": 99.5,
        "total_charges": 99.5,
    }
    out = service.predict_and_explain(sample_high_risk)
    assert 0.0 <= out["churn_probability"] <= 1.0
    assert len(out["all_shap_contributions"]) == 19
    assert len(out["top_risk_drivers"]) <= 5
    # Verify aggregated parent names (no one-hot suffixes)
    returned_names = {item["feature_name"] for item in out["all_shap_contributions"]}
    assert returned_names == set(ALL_MODEL_FEATURES)
    assert all(item["shap_value"] > 0 for item in out["top_risk_drivers"])
    assert all(item["shap_value"] < 0 for item in out["protective_factors"])


# --- 5. FastAPI Endpoints, Auth, Validation & Persistence Tests ---


def test_auth_and_protected_endpoints(client: TestClient):
    # Unauthenticated request must return 401
    unauth = client.get("/api/customers")
    assert unauth.status_code == 401

    # Invalid login must return 401
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "admin@retentionai.com", "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401

    headers = get_auth_headers(client)
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "admin@retentionai.com"


def test_malformed_prediction_returns_422(client: TestClient):
    headers = get_auth_headers(client)
    bad_payload = {"gender": "InvalidGender", "tenure": -5}
    resp = client.post("/api/predict", json=bad_payload, headers=headers)
    assert resp.status_code == 422


def test_end_to_end_csv_upload_predict_analytics_and_recommendation_update(client: TestClient):
    headers = get_auth_headers(client)

    # 1. CSV Upload using real rows from dataset or valid Telco CSV
    csv_content = (
        "customerID,gender,SeniorCitizen,Partner,Dependents,tenure,PhoneService,MultipleLines,"
        "InternetService,OnlineSecurity,OnlineBackup,DeviceProtection,TechSupport,StreamingTV,"
        "StreamingMovies,Contract,PaperlessBilling,PaymentMethod,MonthlyCharges,TotalCharges,Churn\n"
        "7590-VHVEG,Female,0,Yes,No,1,No,No phone service,DSL,No,Yes,No,No,No,No,"
        "Month-to-month,Yes,Electronic check,29.85,29.85,No\n"
        "5575-GNVDE,Male,0,No,No,0,Yes,No,DSL,Yes,No,Yes,No,No,No,"
        "One year,No,Mailed check,56.95, ,No\n"
    )
    upload_resp = client.post(
        "/api/customers/upload",
        files={"file": ("telco_sample.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        headers=headers,
    )
    assert upload_resp.status_code == 200, upload_resp.text
    upload_data = upload_resp.json()
    assert upload_data["total_rows"] == 2
    assert upload_data["inserted"] == 2
    assert upload_data["blank_total_charges_fixed"] == 1

    # 2. Predict churn & persist to DB
    predict_payload = {
        "customer_id": "7590-VHVEG",
        "gender": "Female",
        "senior_citizen": 0,
        "partner": "Yes",
        "dependents": "No",
        "tenure": 1,
        "phone_service": "No",
        "multiple_lines": "No phone service",
        "internet_service": "DSL",
        "online_security": "No",
        "online_backup": "Yes",
        "device_protection": "No",
        "tech_support": "No",
        "streaming_tv": "No",
        "streaming_movies": "No",
        "contract": "Month-to-month",
        "paperless_billing": "Yes",
        "payment_method": "Electronic check",
        "monthly_charges": 29.85,
        "total_charges": 29.85,
    }
    pred_resp = client.post("/api/predict", json=predict_payload, headers=headers)
    assert pred_resp.status_code == 200, pred_resp.text
    pred_data = pred_resp.json()
    assert pred_data["customer_id"] == "7590-VHVEG"
    assert pred_data["risk_category"] in ("Low", "Medium", "High")
    assert len(pred_data["all_shap_contributions"]) == 19
    assert pred_data["recommendation"]["action_status"] == "Pending"

    prediction_id = pred_data["prediction_id"]
    rec_id = pred_data["recommendation"]["id"]

    # 3. Fetch saved prediction via GET /api/predictions/{id}
    get_pred = client.get(f"/api/predictions/{prediction_id}", headers=headers)
    assert get_pred.status_code == 200
    assert get_pred.json()["prediction_id"] == prediction_id

    # 4. Analytics summary reflects persisted customers and predictions
    analytics_resp = client.get("/api/analytics/summary", headers=headers)
    assert analytics_resp.status_code == 200
    analytics_data = analytics_resp.json()
    assert analytics_data["total_customers"] == 2
    assert analytics_data["predicted_customers"] == 1

    # 5. Update recommendation action status and verify persistence
    patch_resp = client.patch(
        f"/api/recommendations/{rec_id}",
        json={"action_status": "Retained"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["action_status"] == "Retained"

    rec_list_resp = client.get("/api/recommendations", headers=headers)
    assert rec_list_resp.status_code == 200
    assert rec_list_resp.json()["counts_by_status"]["Retained"] == 1

    # 6. Model performance endpoint
    perf_resp = client.get("/api/models/performance", headers=headers)
    assert perf_resp.status_code == 200
    assert perf_resp.json()["production_model"] == "XGBoost"
