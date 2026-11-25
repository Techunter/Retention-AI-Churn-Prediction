from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass(frozen=True)
class GeneratedRecommendation:
    """Structured output of the rule-based + SHAP-driven retention engine."""

    churn_reason: str
    recommended_action: str
    priority: str
    action_status: str = "Pending"


def _shap_lookup(shap_drivers: List[Dict[str, Any]]) -> Dict[str, float]:
    """Map canonical feature names to their SHAP contribution values."""
    return {d["feature_name"]: float(d["shap_value"]) for d in shap_drivers}


def generate_retention_recommendation(
    customer_data: Dict[str, Any],
    risk_category: str,
    shap_drivers: List[Dict[str, Any]],
) -> GeneratedRecommendation:
    """
    Generate a personalized retention recommendation using both the risk tier
    and the dominant positive SHAP drivers according to the report's decision matrix.

    When multiple conditions apply, candidates are ranked by the highest positive
    SHAP contribution of the associated driver feature so the most significant
    actionable driver is prioritized.
    """
    shap_map = _shap_lookup(shap_drivers)
    positive_drivers = [d for d in shap_drivers if float(d["shap_value"]) > 0]
    top_driver = positive_drivers[0] if positive_drivers else (shap_drivers[0] if shap_drivers else None)

    contract = customer_data.get("contract", "")
    monthly_charges = float(customer_data.get("monthly_charges", 0.0))
    internet_service = customer_data.get("internet_service", "")
    tech_support = customer_data.get("tech_support", "")
    online_security = customer_data.get("online_security", "")
    payment_method = customer_data.get("payment_method", "")
    tenure = int(customer_data.get("tenure", 0))

    candidates: List[tuple[float, str, str]] = []

    if risk_category == "High":
        if contract == "Month-to-month":
            score = max(shap_map.get("Contract", 0.0), 0.0) + 0.001
            candidates.append(
                (
                    score,
                    f"Month-to-month contract flexibility (SHAP {shap_map.get('Contract', 0.0):+.3f})",
                    "Offer annual contract migration with a 15% loyalty rebate.",
                )
            )
        if monthly_charges >= 70.0 or internet_service == "Fiber optic":
            score = max(
                shap_map.get("MonthlyCharges", 0.0),
                shap_map.get("InternetService", 0.0),
                0.0,
            ) + 0.001
            reason_parts = []
            if internet_service == "Fiber optic":
                reason_parts.append("Fiber optic service")
            if monthly_charges >= 70.0:
                reason_parts.append(f"high MonthlyCharges (${monthly_charges:.2f})")
            reason_detail = " and ".join(reason_parts)
            driver_val = max(
                shap_map.get("MonthlyCharges", 0.0),
                shap_map.get("InternetService", 0.0),
            )
            candidates.append(
                (
                    score,
                    f"Elevated billing / {reason_detail} (SHAP {driver_val:+.3f})",
                    "Provide bundled service credit or temporary rate lock.",
                )
            )
        if tech_support == "No" or online_security == "No":
            score = max(
                shap_map.get("TechSupport", 0.0),
                shap_map.get("OnlineSecurity", 0.0),
                0.0,
            ) + 0.001
            missing = []
            if online_security == "No":
                missing.append("OnlineSecurity")
            if tech_support == "No":
                missing.append("TechSupport")
            driver_val = max(
                shap_map.get("TechSupport", 0.0),
                shap_map.get("OnlineSecurity", 0.0),
            )
            candidates.append(
                (
                    score,
                    f"Missing {' & '.join(missing)} add-on protection (SHAP {driver_val:+.3f})",
                    "Activate complimentary three-month security and priority support.",
                )
            )

        if candidates:
            candidates.sort(key=lambda item: item[0], reverse=True)
            _, reason, action = candidates[0]
            return GeneratedRecommendation(
                churn_reason=reason,
                recommended_action=action,
                priority="High",
            )

        # Fallback if a high-risk customer triggers none of the 3 explicit conditions
        if top_driver:
            return GeneratedRecommendation(
                churn_reason=f"High churn risk driven by {top_driver['feature_label']} (SHAP {top_driver['shap_value']:+.3f})",
                recommended_action="Assign dedicated retention specialist outreach with a personalized plan audit and loyalty credit.",
                priority="High",
            )
        return GeneratedRecommendation(
            churn_reason="Elevated multi-factor churn risk profile",
            recommended_action="Assign dedicated retention specialist outreach with a personalized plan audit and loyalty credit.",
            priority="High",
        )

    if risk_category == "Medium":
        if payment_method == "Electronic check":
            score = max(shap_map.get("PaymentMethod", 0.0), 0.0) + 0.001
            candidates.append(
                (
                    score,
                    f"Electronic check payment friction (SHAP {shap_map.get('PaymentMethod', 0.0):+.3f})",
                    "Incentivize automatic billing enrollment with a bill credit.",
                )
            )
        if tenure < 6:
            score = max(shap_map.get("tenure", 0.0), 0.0) + 0.001
            candidates.append(
                (
                    score,
                    f"Early-lifecycle account tenure ({tenure} months; SHAP {shap_map.get('tenure', 0.0):+.3f})",
                    "Schedule proactive onboarding check-in and provide usage tips.",
                )
            )

        if candidates:
            candidates.sort(key=lambda item: item[0], reverse=True)
            _, reason, action = candidates[0]
            return GeneratedRecommendation(
                churn_reason=reason,
                recommended_action=action,
                priority="Medium",
            )

        # Check secondary actionable drivers for Medium Risk
        if contract == "Month-to-month":
            return GeneratedRecommendation(
                churn_reason=f"Month-to-month contract exposure (SHAP {shap_map.get('Contract', 0.0):+.3f})",
                recommended_action="Offer annual contract migration with a 15% loyalty rebate.",
                priority="Medium",
            )
        if top_driver:
            return GeneratedRecommendation(
                churn_reason=f"Moderate churn risk led by {top_driver['feature_label']} (SHAP {top_driver['shap_value']:+.3f})",
                recommended_action="Send targeted service value check-in and tailored plan optimization offer.",
                priority="Medium",
            )
        return GeneratedRecommendation(
            churn_reason="Moderate multi-factor churn risk",
            recommended_action="Send targeted service value check-in and tailored plan optimization offer.",
            priority="Medium",
        )

    # LOW RISK
    if tenure >= 24 or contract == "Two year":
        return GeneratedRecommendation(
            churn_reason=f"Stable customer profile (tenure {tenure} months, {contract} contract)",
            recommended_action="Maintain standard engagement cadence and invite the customer to referral rewards.",
            priority="Low",
        )
    return GeneratedRecommendation(
        churn_reason="Low predicted churn risk with stable engagement signals",
        recommended_action="Maintain standard engagement cadence and invite the customer to referral rewards.",
        priority="Low",
    )
