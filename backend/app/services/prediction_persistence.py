from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    ChurnPrediction,
    Customer,
    RetentionRecommendation,
    ShapExplanation,
)
from app.schemas.schemas import (
    PredictionInput,
    PredictionResponse,
    RecommendationOut,
    ShapDriverOut,
)
from app.services.ml_service import get_prediction_service
from app.services.recommendation_engine import generate_retention_recommendation
from app.services.risk_engine import classify_churn_risk


def customer_model_to_attr_dict(customer: Customer) -> Dict[str, Any]:
    """Extract the 19 predictive attributes from a Customer ORM instance."""
    return {
        "gender": customer.gender,
        "senior_citizen": customer.senior_citizen,
        "partner": customer.partner,
        "dependents": customer.dependents,
        "tenure": customer.tenure,
        "phone_service": customer.phone_service,
        "multiple_lines": customer.multiple_lines,
        "internet_service": customer.internet_service,
        "online_security": customer.online_security,
        "online_backup": customer.online_backup,
        "device_protection": customer.device_protection,
        "tech_support": customer.tech_support,
        "streaming_tv": customer.streaming_tv,
        "streaming_movies": customer.streaming_movies,
        "contract": customer.contract,
        "paperless_billing": customer.paperless_billing,
        "payment_method": customer.payment_method,
        "monthly_charges": customer.monthly_charges,
        "total_charges": customer.total_charges,
    }


def _generate_unique_customer_id(db: Session) -> str:
    import uuid

    while True:
        candidate = f"RET-{uuid.uuid4().hex[:6].upper()}"
        exists = db.query(Customer.id).filter(Customer.customer_id == candidate).first()
        if not exists:
            return candidate


def resolve_or_upsert_customer(db: Session, payload: PredictionInput) -> Customer:
    """Resolve an existing Customer or create/update one from PredictionInput."""
    attrs = payload.model_dump(exclude={"customer_id", "customer_db_id"})
    customer: Optional[Customer] = None

    if payload.customer_db_id is not None:
        customer = db.query(Customer).filter(Customer.id == payload.customer_db_id).first()
    elif payload.customer_id:
        customer = (
            db.query(Customer)
            .filter(Customer.customer_id == payload.customer_id.strip())
            .first()
        )

    if customer is not None:
        for key, value in attrs.items():
            setattr(customer, key, value)
        db.flush()
        return customer

    cust_code = payload.customer_id.strip() if payload.customer_id else _generate_unique_customer_id(db)
    customer = Customer(customer_id=cust_code, **attrs)
    db.add(customer)
    db.flush()
    return customer


def run_and_persist_prediction(
    db: Session,
    customer: Customer,
    attr_override: Optional[Dict[str, Any]] = None,
) -> PredictionResponse:
    """
    Execute ML prediction, risk classification, TreeSHAP attribution, and
    retention recommendation generation, persisting all entities to MySQL.
    """
    attrs = attr_override if attr_override is not None else customer_model_to_attr_dict(customer)
    ml_service = get_prediction_service()
    ml_result = ml_service.predict_and_explain(attrs)

    prediction = ChurnPrediction(
        customer_id=customer.id,
        churn_probability=ml_result["churn_probability"],
        risk_category=ml_result["risk_category"],
        model_name=ml_result["model_name"],
    )
    db.add(prediction)
    db.flush()

    shap_rows: List[ShapExplanation] = []
    for item in ml_result["all_shap_contributions"]:
        shap_row = ShapExplanation(
            prediction_id=prediction.id,
            feature_name=item["feature_name"],
            shap_value=item["shap_value"],
            impact_type=item["impact_type"],
            feature_rank=item["feature_rank"],
        )
        db.add(shap_row)
        shap_rows.append(shap_row)

    generated_rec = generate_retention_recommendation(
        customer_data=attrs,
        risk_category=ml_result["risk_category"],
        shap_drivers=ml_result["all_shap_contributions"],
    )

    rec_row = RetentionRecommendation(
        prediction_id=prediction.id,
        customer_id=customer.id,
        churn_reason=generated_rec.churn_reason,
        recommended_action=generated_rec.recommended_action,
        priority=generated_rec.priority,
        action_status="Pending",
    )
    db.add(rec_row)
    db.commit()
    db.refresh(prediction)
    db.refresh(rec_row)

    return build_prediction_response(prediction=prediction, customer=customer, ml_result=ml_result, rec_row=rec_row)


def build_prediction_response(
    prediction: ChurnPrediction,
    customer: Customer,
    ml_result: Optional[Dict[str, Any]] = None,
    rec_row: Optional[RetentionRecommendation] = None,
) -> PredictionResponse:
    """Assemble a full PredictionResponse from persisted records (and live SHAP metadata)."""
    risk = classify_churn_risk(prediction.churn_probability)

    if ml_result is None:
        # Recompute display metadata cleanly from persisted SHAP rows + customer attributes
        from app.ml.preprocessing import FEATURE_DISPLAY_LABELS
        from app.services.ml_service import _format_feature_value, get_prediction_service

        attrs = customer_model_to_attr_dict(customer)
        from app.ml.preprocessing import API_TO_TELCO_MAP

        telco_vals = {
            telco_col: attrs[api_key]
            for api_key, telco_col in API_TO_TELCO_MAP.items()
            if telco_col != "customerID"
        }

        all_contribs: List[ShapDriverOut] = []
        for s in sorted(prediction.shap_explanations, key=lambda x: x.feature_rank):
            all_contribs.append(
                ShapDriverOut(
                    id=s.id,
                    feature_name=s.feature_name,
                    feature_label=FEATURE_DISPLAY_LABELS.get(s.feature_name, s.feature_name),
                    feature_value=_format_feature_value(
                        s.feature_name, telco_vals.get(s.feature_name, "")
                    )
                    if s.feature_name in telco_vals
                    else None,
                    shap_value=s.shap_value,
                    impact_type=s.impact_type,
                    feature_rank=s.feature_rank,
                )
            )
        top_risk = sorted(
            [c for c in all_contribs if c.shap_value > 0],
            key=lambda x: x.shap_value,
            reverse=True,
        )[:5]
        protective = sorted(
            [c for c in all_contribs if c.shap_value < 0],
            key=lambda x: x.shap_value,
        )[:5]
        try:
            base_val = round(get_prediction_service().base_value, 5)
        except Exception:
            base_val = 0.0

        risk_phrases = [f"{d.feature_label} ({d.shap_value:+.3f})" for d in top_risk[:3]]
        prot_phrases = [f"{d.feature_label} ({d.shap_value:+.3f})" for d in protective[:2]]
        summary = (
            f"Customer is classified as {risk.risk_category} Risk with a "
            f"{risk.churn_probability_pct:.1f}% predicted churn probability."
        )
        if risk_phrases:
            summary += f" Primary risk drivers: {', '.join(risk_phrases)}."
        if prot_phrases:
            summary += f" Protective factors: {', '.join(prot_phrases)}."
    else:
        all_contribs = [ShapDriverOut(**c) for c in ml_result["all_shap_contributions"]]
        top_risk = [ShapDriverOut(**c) for c in ml_result["top_risk_drivers"]]
        protective = [ShapDriverOut(**c) for c in ml_result["protective_factors"]]
        base_val = ml_result["base_value"]
        summary = ml_result["explanation_summary"]

    if rec_row is None:
        rec_row = prediction.recommendations[0] if prediction.recommendations else None

    if rec_row is None:
        raise RuntimeError(f"Recommendation missing for prediction {prediction.id}")

    rec_out = RecommendationOut(
        id=rec_row.id,
        prediction_id=rec_row.prediction_id,
        customer_db_id=customer.id,
        customer_id=customer.customer_id,
        risk_category=risk.risk_category,
        churn_reason=rec_row.churn_reason,
        recommended_action=rec_row.recommended_action,
        priority=rec_row.priority,
        action_status=rec_row.action_status,
        created_at=rec_row.created_at,
    )

    return PredictionResponse(
        prediction_id=prediction.id,
        customer_db_id=customer.id,
        customer_id=customer.customer_id,
        churn_probability=risk.churn_probability,
        churn_probability_pct=risk.churn_probability_pct,
        risk_category=risk.risk_category,
        risk_color=risk.risk_color,
        priority_level=risk.priority_level,
        model_name=prediction.model_name,
        prediction_date=prediction.prediction_date,
        base_value=base_val,
        explanation_summary=summary,
        top_risk_drivers=top_risk,
        protective_factors=protective,
        all_shap_contributions=all_contribs,
        recommendation=rec_out,
    )


def get_prediction_by_id(db: Session, prediction_id: int) -> Optional[PredictionResponse]:
    """Fetch a saved prediction along with customer, SHAP drivers, and recommendations."""
    prediction = (
        db.query(ChurnPrediction)
        .options(
            joinedload(ChurnPrediction.customer),
            joinedload(ChurnPrediction.shap_explanations),
            joinedload(ChurnPrediction.recommendations),
        )
        .filter(ChurnPrediction.id == prediction_id)
        .first()
    )
    if prediction is None:
        return None
    return build_prediction_response(prediction=prediction, customer=prediction.customer)
