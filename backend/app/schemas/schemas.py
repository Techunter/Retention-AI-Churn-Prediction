from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# --- Authentication Schemas ---


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Customer Schemas ---


class CustomerAttributes(BaseModel):
    gender: Literal["Male", "Female"]
    senior_citizen: int = Field(..., ge=0, le=1)
    partner: Literal["Yes", "No"]
    dependents: Literal["Yes", "No"]
    tenure: int = Field(..., ge=0, le=120)
    phone_service: Literal["Yes", "No"]
    multiple_lines: Literal["Yes", "No", "No phone service"]
    internet_service: Literal["DSL", "Fiber optic", "No"]
    online_security: Literal["Yes", "No", "No internet service"]
    online_backup: Literal["Yes", "No", "No internet service"]
    device_protection: Literal["Yes", "No", "No internet service"]
    tech_support: Literal["Yes", "No", "No internet service"]
    streaming_tv: Literal["Yes", "No", "No internet service"]
    streaming_movies: Literal["Yes", "No", "No internet service"]
    contract: Literal["Month-to-month", "One year", "Two year"]
    paperless_billing: Literal["Yes", "No"]
    payment_method: Literal[
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    ]
    monthly_charges: float = Field(..., ge=0.0, le=1000.0)
    total_charges: float = Field(..., ge=0.0, le=100000.0)

    @field_validator("tenure", mode="before")
    @classmethod
    def validate_tenure(cls, v: Any) -> int:
        if isinstance(v, bool):
            raise ValueError("tenure must be an integer")
        return int(v)


class CustomerCreate(CustomerAttributes):
    customer_id: str = Field(..., min_length=2, max_length=64)


class CustomerUpdate(BaseModel):
    gender: Optional[Literal["Male", "Female"]] = None
    senior_citizen: Optional[int] = Field(default=None, ge=0, le=1)
    partner: Optional[Literal["Yes", "No"]] = None
    dependents: Optional[Literal["Yes", "No"]] = None
    tenure: Optional[int] = Field(default=None, ge=0, le=120)
    phone_service: Optional[Literal["Yes", "No"]] = None
    multiple_lines: Optional[Literal["Yes", "No", "No phone service"]] = None
    internet_service: Optional[Literal["DSL", "Fiber optic", "No"]] = None
    online_security: Optional[Literal["Yes", "No", "No internet service"]] = None
    online_backup: Optional[Literal["Yes", "No", "No internet service"]] = None
    device_protection: Optional[Literal["Yes", "No", "No internet service"]] = None
    tech_support: Optional[Literal["Yes", "No", "No internet service"]] = None
    streaming_tv: Optional[Literal["Yes", "No", "No internet service"]] = None
    streaming_movies: Optional[Literal["Yes", "No", "No internet service"]] = None
    contract: Optional[Literal["Month-to-month", "One year", "Two year"]] = None
    paperless_billing: Optional[Literal["Yes", "No"]] = None
    payment_method: Optional[
        Literal[
            "Electronic check",
            "Mailed check",
            "Bank transfer (automatic)",
            "Credit card (automatic)",
        ]
    ] = None
    monthly_charges: Optional[float] = Field(default=None, ge=0.0, le=1000.0)
    total_charges: Optional[float] = Field(default=None, ge=0.0, le=100000.0)


class CustomerOut(CustomerAttributes):
    id: int
    customer_id: str
    created_at: datetime
    latest_churn_probability: Optional[float] = None
    latest_risk_category: Optional[str] = None
    latest_prediction_id: Optional[int] = None
    latest_prediction_date: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerListResponse(BaseModel):
    items: List[CustomerOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class CustomerUploadResponse(BaseModel):
    total_rows: int
    inserted: int
    updated: int
    skipped: int
    blank_total_charges_fixed: int
    message: str


# --- Prediction, SHAP & Recommendation Schemas ---


class PredictionInput(CustomerAttributes):
    customer_id: Optional[str] = Field(default=None, max_length=64)
    customer_db_id: Optional[int] = Field(default=None, ge=1)


class ShapDriverOut(BaseModel):
    id: Optional[int] = None
    feature_name: str
    feature_label: str
    feature_value: Optional[str] = None
    shap_value: float
    impact_type: Literal["positive", "negative"]
    feature_rank: int


class RecommendationOut(BaseModel):
    id: int
    prediction_id: int
    customer_db_id: int
    customer_id: str
    risk_category: str
    churn_reason: str
    recommended_action: str
    priority: Literal["High", "Medium", "Low"]
    action_status: Literal["Pending", "Applied", "Retained"]
    created_at: datetime


class PredictionResponse(BaseModel):
    prediction_id: int
    customer_db_id: int
    customer_id: str
    churn_probability: float
    churn_probability_pct: float
    risk_category: Literal["Low", "Medium", "High"]
    risk_color: Literal["green", "orange", "red"]
    priority_level: Literal["Low", "Medium", "High"]
    model_name: str
    prediction_date: datetime
    base_value: float
    explanation_summary: str
    top_risk_drivers: List[ShapDriverOut]
    protective_factors: List[ShapDriverOut]
    all_shap_contributions: List[ShapDriverOut]
    recommendation: RecommendationOut


class PredictionHistoryItem(BaseModel):
    id: int
    churn_probability: float
    churn_probability_pct: float
    risk_category: str
    model_name: str
    prediction_date: datetime


class CustomerDetailResponse(BaseModel):
    customer: CustomerOut
    predictions: List[PredictionHistoryItem]
    latest_prediction: Optional[PredictionResponse] = None


# --- Analytics Schemas ---


class RiskDistributionItem(BaseModel):
    risk_category: str
    count: int
    percentage: float
    color: str


class TenureChurnItem(BaseModel):
    tenure_bucket: str
    total_customers: int
    avg_churn_probability: float
    high_risk_count: int


class CategoryChurnItem(BaseModel):
    category: str
    total_customers: int
    avg_churn_probability: float
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int


class RecentPredictionSummary(BaseModel):
    prediction_id: int
    customer_db_id: int
    customer_id: str
    contract: str
    monthly_charges: float
    churn_probability: float
    risk_category: str
    prediction_date: datetime


class AnalyticsSummaryResponse(BaseModel):
    total_customers: int
    predicted_customers: int
    predicted_churners: int
    low_risk_count: int
    medium_risk_count: int
    high_risk_count: int
    average_churn_probability: float
    risk_distribution: List[RiskDistributionItem]
    tenure_vs_churn: List[TenureChurnItem]
    contract_vs_churn: List[CategoryChurnItem]
    payment_method_analysis: List[CategoryChurnItem]
    recent_predictions: List[RecentPredictionSummary]
    high_priority_actions: List[RecommendationOut]


# --- Recommendation Queue Schemas ---


class RecommendationQueueItem(RecommendationOut):
    churn_probability: float
    tenure: int
    contract: str
    monthly_charges: float
    internet_service: str
    payment_method: str


class RecommendationListResponse(BaseModel):
    items: List[RecommendationQueueItem]
    total: int
    counts_by_priority: Dict[str, int]
    counts_by_status: Dict[str, int]


class RecommendationStatusUpdate(BaseModel):
    action_status: Literal["Pending", "Applied", "Retained"]


# --- Model Performance Schemas ---


class ModelComparisonItem(BaseModel):
    model_key: str
    model_name: str
    is_production: bool
    validation_metrics: Dict[str, float]
    test_metrics: Optional[Dict[str, float]] = None
    confusion_matrix: Optional[List[List[int]]] = None
    roc_curve: Optional[List[Dict[str, float]]] = None


class ModelPerformanceResponse(BaseModel):
    production_model: str
    dataset_summary: Dict[str, Any]
    models: List[ModelComparisonItem]
