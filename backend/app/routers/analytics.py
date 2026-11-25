from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user
from app.database import get_db
from app.models.models import (
    ChurnPrediction,
    Customer,
    RetentionRecommendation,
    User,
)
from app.schemas.schemas import (
    AnalyticsSummaryResponse,
    CategoryChurnItem,
    RecentPredictionSummary,
    RecommendationOut,
    RiskDistributionItem,
    TenureChurnItem,
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def _get_latest_predictions_with_customers(db: Session) -> List[ChurnPrediction]:
    subq = (
        db.query(
            ChurnPrediction.customer_id,
            func.max(ChurnPrediction.id).label("max_id"),
        )
        .group_by(ChurnPrediction.customer_id)
        .subquery()
    )
    return (
        db.query(ChurnPrediction)
        .options(joinedload(ChurnPrediction.customer))
        .join(subq, ChurnPrediction.id == subq.c.max_id)
        .all()
    )


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> AnalyticsSummaryResponse:
    """Compute real-time customer churn analytics, distributions, and priority actions from MySQL."""
    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    latest_preds = _get_latest_predictions_with_customers(db)
    predicted_customers = len(latest_preds)

    low_count = sum(1 for p in latest_preds if p.risk_category == "Low")
    med_count = sum(1 for p in latest_preds if p.risk_category == "Medium")
    high_count = sum(1 for p in latest_preds if p.risk_category == "High")

    # Predicted churners defined as probability >= 0.50 (standard classifier decision threshold)
    predicted_churners = sum(1 for p in latest_preds if p.churn_probability >= 0.50)

    avg_prob = (
        round(sum(p.churn_probability for p in latest_preds) / predicted_customers, 4)
        if predicted_customers > 0
        else 0.0
    )

    denom = max(predicted_customers, 1)
    risk_distribution = [
        RiskDistributionItem(
            risk_category="Low",
            count=low_count,
            percentage=round((low_count / denom) * 100.0, 2) if predicted_customers else 0.0,
            color="#10b981",
        ),
        RiskDistributionItem(
            risk_category="Medium",
            count=med_count,
            percentage=round((med_count / denom) * 100.0, 2) if predicted_customers else 0.0,
            color="#f59e0b",
        ),
        RiskDistributionItem(
            risk_category="High",
            count=high_count,
            percentage=round((high_count / denom) * 100.0, 2) if predicted_customers else 0.0,
            color="#ef4444",
        ),
    ]

    # Tenure vs Churn buckets
    tenure_buckets_order = ["0-6m", "7-12m", "13-24m", "25-48m", "49m+"]
    tenure_map: Dict[str, List[ChurnPrediction]] = {b: [] for b in tenure_buckets_order}
    for p in latest_preds:
        t = p.customer.tenure
        if t <= 6:
            tenure_map["0-6m"].append(p)
        elif t <= 12:
            tenure_map["7-12m"].append(p)
        elif t <= 24:
            tenure_map["13-24m"].append(p)
        elif t <= 48:
            tenure_map["25-48m"].append(p)
        else:
            tenure_map["49m+"].append(p)

    tenure_vs_churn: List[TenureChurnItem] = []
    for bucket in tenure_buckets_order:
        items = tenure_map[bucket]
        cnt = len(items)
        tenure_vs_churn.append(
            TenureChurnItem(
                tenure_bucket=bucket,
                total_customers=cnt,
                avg_churn_probability=round(sum(x.churn_probability for x in items) / cnt, 4) if cnt else 0.0,
                high_risk_count=sum(1 for x in items if x.risk_category == "High"),
            )
        )

    # Contract vs Churn
    contract_groups: Dict[str, List[ChurnPrediction]] = defaultdict(list)
    payment_groups: Dict[str, List[ChurnPrediction]] = defaultdict(list)
    for p in latest_preds:
        contract_groups[p.customer.contract].append(p)
        payment_groups[p.customer.payment_method].append(p)

    contract_order = ["Month-to-month", "One year", "Two year"]
    contract_vs_churn = []
    for cat in contract_order + [k for k in contract_groups.keys() if k not in contract_order]:
        items = contract_groups.get(cat, [])
        cnt = len(items)
        contract_vs_churn.append(
            CategoryChurnItem(
                category=cat,
                total_customers=cnt,
                avg_churn_probability=round(sum(x.churn_probability for x in items) / cnt, 4) if cnt else 0.0,
                high_risk_count=sum(1 for x in items if x.risk_category == "High"),
                medium_risk_count=sum(1 for x in items if x.risk_category == "Medium"),
                low_risk_count=sum(1 for x in items if x.risk_category == "Low"),
            )
        )

    payment_order = [
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    ]
    payment_method_analysis = []
    for cat in payment_order + [k for k in payment_groups.keys() if k not in payment_order]:
        items = payment_groups.get(cat, [])
        cnt = len(items)
        payment_method_analysis.append(
            CategoryChurnItem(
                category=cat,
                total_customers=cnt,
                avg_churn_probability=round(sum(x.churn_probability for x in items) / cnt, 4) if cnt else 0.0,
                high_risk_count=sum(1 for x in items if x.risk_category == "High"),
                medium_risk_count=sum(1 for x in items if x.risk_category == "Medium"),
                low_risk_count=sum(1 for x in items if x.risk_category == "Low"),
            )
        )

    # Recent predictions (top 8)
    recent_rows = (
        db.query(ChurnPrediction)
        .options(joinedload(ChurnPrediction.customer))
        .order_by(desc(ChurnPrediction.prediction_date), desc(ChurnPrediction.id))
        .limit(8)
        .all()
    )
    recent_predictions = [
        RecentPredictionSummary(
            prediction_id=r.id,
            customer_db_id=r.customer.id,
            customer_id=r.customer.customer_id,
            contract=r.customer.contract,
            monthly_charges=r.customer.monthly_charges,
            churn_probability=r.churn_probability,
            risk_category=r.risk_category,
            prediction_date=r.prediction_date,
        )
        for r in recent_rows
    ]

    # High-priority retention actions (top 6 pending High/Medium)
    high_actions_rows = (
        db.query(RetentionRecommendation)
        .options(
            joinedload(RetentionRecommendation.customer),
            joinedload(RetentionRecommendation.prediction),
        )
        .filter(RetentionRecommendation.priority == "High")
        .order_by(desc(RetentionRecommendation.created_at), desc(RetentionRecommendation.id))
        .limit(6)
        .all()
    )
    high_priority_actions = [
        RecommendationOut(
            id=rec.id,
            prediction_id=rec.prediction_id,
            customer_db_id=rec.customer.id,
            customer_id=rec.customer.customer_id,
            risk_category=rec.prediction.risk_category,
            churn_reason=rec.churn_reason,
            recommended_action=rec.recommended_action,
            priority=rec.priority,
            action_status=rec.action_status,
            created_at=rec.created_at,
        )
        for rec in high_actions_rows
    ]

    return AnalyticsSummaryResponse(
        total_customers=total_customers,
        predicted_customers=predicted_customers,
        predicted_churners=predicted_churners,
        low_risk_count=low_count,
        medium_risk_count=med_count,
        high_risk_count=high_count,
        average_churn_probability=avg_prob,
        risk_distribution=risk_distribution,
        tenure_vs_churn=tenure_vs_churn,
        contract_vs_churn=contract_vs_churn,
        payment_method_analysis=payment_method_analysis,
        recent_predictions=recent_predictions,
        high_priority_actions=high_priority_actions,
    )
