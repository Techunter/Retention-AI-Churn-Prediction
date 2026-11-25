import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import shap

from app.ml.preprocessing import (
    ALL_MODEL_FEATURES,
    API_TO_TELCO_MAP,
    FEATURE_DISPLAY_LABELS,
    api_dict_to_model_dataframe,
    get_transformed_feature_parent_mapping,
)
from app.services.risk_engine import RiskClassification, classify_churn_risk

BACKEND_DIR = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"


def _format_feature_value(feature_name: str, raw_val: Any) -> str:
    if feature_name == "SeniorCitizen":
        return "Yes" if int(raw_val) == 1 else "No"
    if feature_name == "tenure":
        months = int(raw_val)
        return f"{months} month" if months == 1 else f"{months} months"
    if feature_name in ("MonthlyCharges", "TotalCharges"):
        return f"${float(raw_val):,.2f}"
    return str(raw_val)


class ChurnPredictionService:
    """Loads production XGBoost + preprocessing pipeline and computes TreeSHAP explanations."""

    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR) -> None:
        self.artifacts_dir = artifacts_dir
        preprocessor_path = artifacts_dir / "preprocessor.joblib"
        model_path = artifacts_dir / "xgboost_model.joblib"

        if not preprocessor_path.exists() or not model_path.exists():
            raise RuntimeError(
                "ML model artifacts are missing. Run `python -m training.train_models` from backend/ first."
            )

        self.preprocessor = joblib.load(preprocessor_path)
        self.model = joblib.load(model_path)
        self.explainer = shap.TreeExplainer(self.model)
        self.feature_mapping = get_transformed_feature_parent_mapping(self.preprocessor)

        expected = self.explainer.expected_value
        if isinstance(expected, (list, np.ndarray)):
            expected_arr = np.asarray(expected).flatten()
            self.base_value = float(expected_arr[-1])
        else:
            self.base_value = float(expected)

    def predict_and_explain(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run preprocessing, XGBoost churn probability prediction, risk classification,
        and TreeSHAP feature attribution aggregated to the 19 original Telco attributes.
        """
        df = api_dict_to_model_dataframe(customer_data)
        X_proc = self.preprocessor.transform(df)

        prob = float(self.model.predict_proba(X_proc)[0, 1])
        prob = min(max(prob, 0.0), 1.0)
        risk: RiskClassification = classify_churn_risk(prob)

        raw_shap = self.explainer.shap_values(X_proc)
        if isinstance(raw_shap, list):
            shap_vec = np.asarray(raw_shap[-1])[0]
        else:
            shap_arr = np.asarray(raw_shap)
            if shap_arr.ndim == 3:
                shap_vec = shap_arr[0, :, -1]
            elif shap_arr.ndim == 2:
                shap_vec = shap_arr[0]
            else:
                shap_vec = shap_arr.flatten()

        # Aggregate one-hot encoded column contributions back to original parent features
        grouped_shap: Dict[str, float] = {feat: 0.0 for feat in ALL_MODEL_FEATURES}
        for idx, (_encoded_name, parent_feature) in enumerate(self.feature_mapping):
            grouped_shap[parent_feature] += float(shap_vec[idx])

        # Build structured list sorted by absolute contribution magnitude
        telco_values = {telco_col: df.iloc[0][telco_col] for telco_col in ALL_MODEL_FEATURES}
        sorted_items = sorted(
            grouped_shap.items(),
            key=lambda kv: abs(kv[1]),
            reverse=True,
        )

        all_contributions: List[Dict[str, Any]] = []
        for rank, (feat_name, val) in enumerate(sorted_items, start=1):
            impact_type = "positive" if val >= 0 else "negative"
            all_contributions.append(
                {
                    "feature_name": feat_name,
                    "feature_label": FEATURE_DISPLAY_LABELS.get(feat_name, feat_name),
                    "feature_value": _format_feature_value(feat_name, telco_values[feat_name]),
                    "shap_value": round(float(val), 5),
                    "impact_type": impact_type,
                    "feature_rank": rank,
                }
            )

        positive_drivers = sorted(
            [item for item in all_contributions if item["shap_value"] > 0],
            key=lambda x: x["shap_value"],
            reverse=True,
        )
        top_risk_drivers = positive_drivers[:5]

        protective_factors = sorted(
            [item for item in all_contributions if item["shap_value"] < 0],
            key=lambda x: x["shap_value"],
        )[:5]

        explanation_summary = self._build_summary(
            risk=risk,
            top_risk_drivers=top_risk_drivers,
            protective_factors=protective_factors,
        )

        return {
            "churn_probability": risk.churn_probability,
            "churn_probability_pct": risk.churn_probability_pct,
            "risk_category": risk.risk_category,
            "risk_color": risk.risk_color,
            "priority_level": risk.priority_level,
            "model_name": "XGBoost",
            "base_value": round(self.base_value, 5),
            "explanation_summary": explanation_summary,
            "top_risk_drivers": top_risk_drivers,
            "protective_factors": protective_factors,
            "all_shap_contributions": all_contributions,
        }

    @staticmethod
    def _build_summary(
        risk: RiskClassification,
        top_risk_drivers: List[Dict[str, Any]],
        protective_factors: List[Dict[str, Any]],
    ) -> str:
        risk_phrases = [
            f"{d['feature_label']} ({d['feature_value']}, {d['shap_value']:+.3f})"
            for d in top_risk_drivers[:3]
        ]
        prot_phrases = [
            f"{d['feature_label']} ({d['feature_value']}, {d['shap_value']:+.3f})"
            for d in protective_factors[:2]
        ]

        summary = (
            f"Customer is classified as {risk.risk_category} Risk with a "
            f"{risk.churn_probability_pct:.1f}% predicted churn probability."
        )
        if risk_phrases:
            summary += f" Primary risk drivers increasing churn likelihood: {', '.join(risk_phrases)}."
        if prot_phrases:
            summary += f" Key protective factors offsetting risk: {', '.join(prot_phrases)}."
        return summary


@lru_cache
def get_prediction_service() -> ChurnPredictionService:
    """Return cached singleton ChurnPredictionService."""
    return ChurnPredictionService()


def load_model_evaluation_results(artifacts_dir: Path = ARTIFACTS_DIR) -> Dict[str, Any]:
    """Load saved ML training and evaluation metrics JSON."""
    metrics_path = artifacts_dir / "model_evaluation_results.json"
    if not metrics_path.exists():
        raise FileNotFoundError(
            "Model evaluation results not found. Run `python -m training.train_models` from backend/ first."
        )
    with open(metrics_path, "r", encoding="utf-8") as f:
        return json.load(f)
