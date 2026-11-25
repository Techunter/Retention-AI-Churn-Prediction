from dataclasses import dataclass
from typing import Literal

RiskCategory = Literal["Low", "Medium", "High"]
RiskColor = Literal["green", "orange", "red"]
PriorityLevel = Literal["Low", "Medium", "High"]


@dataclass(frozen=True)
class RiskClassification:
    """Risk classification result derived from predicted churn probability."""

    churn_probability: float
    churn_probability_pct: float
    risk_category: RiskCategory
    risk_color: RiskColor
    priority_level: PriorityLevel


def classify_churn_risk(probability: float) -> RiskClassification:
    """
    Classify churn probability into exact report-defined risk tiers:
    - LOW RISK: probability < 0.35 (Green)
    - MEDIUM RISK: 0.35 <= probability < 0.70 (Orange)
    - HIGH RISK: probability >= 0.70 (Red)
    """
    if probability < 0.0 or probability > 1.0:
        raise ValueError(f"Churn probability must be between 0.0 and 1.0, got {probability}")

    prob_rounded = round(float(probability), 6)
    pct = round(prob_rounded * 100.0, 2)

    if prob_rounded < 0.35:
        return RiskClassification(
            churn_probability=prob_rounded,
            churn_probability_pct=pct,
            risk_category="Low",
            risk_color="green",
            priority_level="Low",
        )
    if prob_rounded < 0.70:
        return RiskClassification(
            churn_probability=prob_rounded,
            churn_probability_pct=pct,
            risk_category="Medium",
            risk_color="orange",
            priority_level="Medium",
        )
    return RiskClassification(
        churn_probability=prob_rounded,
        churn_probability_pct=pct,
        risk_category="High",
        risk_color="red",
        priority_level="High",
    )
