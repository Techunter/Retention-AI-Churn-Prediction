from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.models import User
from app.schemas.schemas import PredictionInput, PredictionResponse
from app.services.prediction_persistence import (
    get_prediction_by_id,
    resolve_or_upsert_customer,
    run_and_persist_prediction,
)

router = APIRouter(tags=["Predictions"])


@router.post("/api/predict", response_model=PredictionResponse)
def predict_churn(
    payload: PredictionInput,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PredictionResponse:
    """
    Validate customer attributes, predict churn using the trained XGBoost model,
    classify risk tier, compute TreeSHAP feature contributions, generate a
    personalized retention recommendation, and persist all outputs in MySQL.
    """
    customer = resolve_or_upsert_customer(db, payload)
    attrs = payload.model_dump(exclude={"customer_id", "customer_db_id"})
    return run_and_persist_prediction(db=db, customer=customer, attr_override=attrs)


@router.get("/api/predictions/{prediction_id}", response_model=PredictionResponse)
def read_prediction(
    prediction_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> PredictionResponse:
    """Return a saved prediction along with its risk tier, SHAP drivers, and recommendation."""
    result = get_prediction_by_id(db, prediction_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction {prediction_id} not found.",
        )
    return result
