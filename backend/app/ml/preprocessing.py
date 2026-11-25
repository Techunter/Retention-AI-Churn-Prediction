from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC_FEATURES: List[str] = [
    "SeniorCitizen",
    "tenure",
    "MonthlyCharges",
    "TotalCharges",
]

CATEGORICAL_FEATURES: List[str] = [
    "gender",
    "Partner",
    "Dependents",
    "PhoneService",
    "MultipleLines",
    "InternetService",
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
    "Contract",
    "PaperlessBilling",
    "PaymentMethod",
]

ALL_MODEL_FEATURES: List[str] = NUMERIC_FEATURES + CATEGORICAL_FEATURES

API_TO_TELCO_MAP: Dict[str, str] = {
    "customer_id": "customerID",
    "gender": "gender",
    "senior_citizen": "SeniorCitizen",
    "partner": "Partner",
    "dependents": "Dependents",
    "tenure": "tenure",
    "phone_service": "PhoneService",
    "multiple_lines": "MultipleLines",
    "internet_service": "InternetService",
    "online_security": "OnlineSecurity",
    "online_backup": "OnlineBackup",
    "device_protection": "DeviceProtection",
    "tech_support": "TechSupport",
    "streaming_tv": "StreamingTV",
    "streaming_movies": "StreamingMovies",
    "contract": "Contract",
    "paperless_billing": "PaperlessBilling",
    "payment_method": "PaymentMethod",
    "monthly_charges": "MonthlyCharges",
    "total_charges": "TotalCharges",
}

TELCO_TO_API_MAP: Dict[str, str] = {v: k for k, v in API_TO_TELCO_MAP.items()}

FEATURE_DISPLAY_LABELS: Dict[str, str] = {
    "SeniorCitizen": "Senior Citizen Status",
    "tenure": "Account Tenure (Months)",
    "MonthlyCharges": "Monthly Charges ($)",
    "TotalCharges": "Total Charges ($)",
    "gender": "Gender",
    "Partner": "Partner Status",
    "Dependents": "Dependents",
    "PhoneService": "Phone Service",
    "MultipleLines": "Multiple Lines",
    "InternetService": "Internet Service",
    "OnlineSecurity": "Online Security",
    "OnlineBackup": "Online Backup",
    "DeviceProtection": "Device Protection",
    "TechSupport": "Tech Support",
    "StreamingTV": "Streaming TV",
    "StreamingMovies": "Streaming Movies",
    "Contract": "Contract Type",
    "PaperlessBilling": "Paperless Billing",
    "PaymentMethod": "Payment Method",
}

REQUIRED_TELCO_CSV_COLUMNS: List[str] = ["customerID"] + ALL_MODEL_FEATURES


def clean_telco_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Clean raw IBM Telco Customer Churn dataframe:
    - Strip whitespace from column names and string values
    - Convert TotalCharges to numeric
    - Fill blank TotalCharges where tenure == 0 with 0.0
    - Coerce SeniorCitizen, tenure, MonthlyCharges to numeric types

    Returns:
        Tuple of (cleaned_df, blank_total_charges_fixed_count)
    """
    cleaned = df.copy()
    cleaned.columns = [str(c).strip() for c in cleaned.columns]

    for col in cleaned.select_dtypes(include=["object", "string"]).columns:
        cleaned[col] = cleaned[col].astype(str).str.strip()
        cleaned.loc[cleaned[col].isin(["", "nan", "None", "NULL"]), col] = np.nan

    cleaned["SeniorCitizen"] = pd.to_numeric(cleaned["SeniorCitizen"], errors="coerce").fillna(0).astype(int)
    cleaned["tenure"] = pd.to_numeric(cleaned["tenure"], errors="coerce").fillna(0).astype(int)
    cleaned["MonthlyCharges"] = pd.to_numeric(cleaned["MonthlyCharges"], errors="coerce")

    total_charges_num = pd.to_numeric(cleaned["TotalCharges"], errors="coerce")
    blank_mask = total_charges_num.isna()
    zero_tenure_blank_mask = blank_mask & (cleaned["tenure"] == 0)
    total_charges_num.loc[zero_tenure_blank_mask] = 0.0

    # For any non-zero tenure rows with missing TotalCharges, approximate only after imputation or preserve NaN for SimpleImputer
    other_blank_mask = total_charges_num.isna()
    blank_fixed_count = int(zero_tenure_blank_mask.sum())
    cleaned["TotalCharges"] = total_charges_num

    # If called during CSV import into DB (where TotalCharges cannot be NaN), fill remaining NaN safely
    if other_blank_mask.any():
        cleaned.loc[other_blank_mask, "TotalCharges"] = (
            cleaned.loc[other_blank_mask, "MonthlyCharges"].fillna(0.0)
            * cleaned.loc[other_blank_mask, "tenure"]
        )
        blank_fixed_count += int(other_blank_mask.sum())

    return cleaned, blank_fixed_count


def build_preprocessor() -> ColumnTransformer:
    """
    Build Scikit-learn ColumnTransformer for IBM Telco Customer Churn features.
    Numeric features are imputed (median) and standardized.
    Categorical features are imputed (most_frequent) and one-hot encoded.
    """
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, NUMERIC_FEATURES),
            ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    return preprocessor


def get_transformed_feature_parent_mapping(preprocessor: ColumnTransformer) -> List[Tuple[str, str]]:
    """
    Return a list of (transformed_feature_name, original_parent_feature_name)
    aligned with the output columns of preprocessor.transform(X).
    """
    mapping: List[Tuple[str, str]] = []
    for col in NUMERIC_FEATURES:
        mapping.append((col, col))

    cat_pipeline: Pipeline = preprocessor.named_transformers_["cat"]
    encoder: OneHotEncoder = cat_pipeline.named_steps["encoder"]
    for orig_feature, categories in zip(CATEGORICAL_FEATURES, encoder.categories_):
        for category in categories:
            mapping.append((f"{orig_feature}_{category}", orig_feature))
    return mapping


def api_dict_to_model_dataframe(customer_data: Dict[str, Any]) -> pd.DataFrame:
    """Convert a snake_case customer attribute dictionary into a single-row Telco model DataFrame."""
    row: Dict[str, Any] = {}
    for api_key, telco_col in API_TO_TELCO_MAP.items():
        if telco_col == "customerID":
            continue
        row[telco_col] = customer_data[api_key]
    return pd.DataFrame([row], columns=ALL_MODEL_FEATURES)
