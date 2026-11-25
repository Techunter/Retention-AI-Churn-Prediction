from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, desc
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user
from app.database import get_db
from app.models.models import RetentionRecommendation, User
from app.schemas.schemas import (
    RecommendationListResponse,
    RecommendationQueueItem,
    RecommendationStatusUpdate,
)

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.get("", response_model=RecommendationListResponse)
def list_recommendations(
    priority: Optional[str] = Query(default=None),
    action_status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> RecommendationListResponse:
    """Return retention recommendation queue ordered by priority and recency."""
    all_rows = (
        db.query(RetentionRecommendation)
        .options(
            joinedload(RetentionRecommendation.customer),
            joinedload(RetentionRecommendation.prediction),
        )
        .order_by(
            case(
                (RetentionRecommendation.priority == "High", 1),
                (RetentionRecommendation.priority == "Medium", 2),
                else_=3,
            ),
            desc(RetentionRecommendation.created_at),
            desc(RetentionRecommendation.id),
        )
        .all()
    )

    counts_by_priority = {"High": 0, "Medium": 0, "Low": 0}
    counts_by_status = {"Pending": 0, "Applied": 0, "Retained": 0}
    for row in all_rows:
        if row.priority in counts_by_priority:
            counts_by_priority[row.priority] += 1
        if row.action_status in counts_by_status:
            counts_by_status[row.action_status] += 1

    filtered = all_rows
    if priority and priority != "All":
        filtered = [r for r in filtered if r.priority == priority]
    if action_status and action_status != "All":
        filtered = [r for r in filtered if r.action_status == action_status]
    if search and search.strip():
        q = search.strip().lower()
        filtered = [
            r
            for r in filtered
            if q in r.customer.customer_id.lower()
            or q in r.churn_reason.lower()
            or q in r.recommended_action.lower()
        ]

    items = [
        RecommendationQueueItem(
            id=r.id,
            prediction_id=r.prediction_id,
            customer_db_id=r.customer.id,
            customer_id=r.customer.customer_id,
            risk_category=r.prediction.risk_category,
            churn_reason=r.churn_reason,
            recommended_action=r.recommended_action,
            priority=r.priority,
            action_status=r.action_status,
            created_at=r.created_at,
            churn_probability=r.prediction.churn_probability,
            tenure=r.customer.tenure,
            contract=r.customer.contract,
            monthly_charges=r.customer.monthly_charges,
            internet_service=r.customer.internet_service,
            payment_method=r.customer.payment_method,
        )
        for r in filtered
    ]

    return RecommendationListResponse(
        items=items,
        total=len(items),
        counts_by_priority=counts_by_priority,
        counts_by_status=counts_by_status,
    )


@router.patch("/{recommendation_id}", response_model=RecommendationQueueItem)
def update_recommendation_status(
    recommendation_id: int,
    payload: RecommendationStatusUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> RecommendationQueueItem:
    """Update retention recommendation action status (Pending, Applied, Retained)."""
    rec = (
        db.query(RetentionRecommendation)
        .options(
            joinedload(RetentionRecommendation.customer),
            joinedload(RetentionRecommendation.prediction),
        )
        .filter(RetentionRecommendation.id == recommendation_id)
        .first()
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recommendation {recommendation_id} not found.",
        )

    rec.action_status = payload.action_status
    db.commit()
    db.refresh(rec)

    return RecommendationQueueItem(
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
        churn_probability=rec.prediction.churn_probability,
        tenure=rec.customer.tenure,
        contract=rec.customer.contract,
        monthly_charges=rec.customer.monthly_charges,
        internet_service=rec.customer.internet_service,
        payment_method=rec.customer.payment_method,
    )
