from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import get_current_user
from app.models.models import User
from app.schemas.schemas import ModelPerformanceResponse
from app.services.ml_service import load_model_evaluation_results

router = APIRouter(prefix="/api/models", tags=["Model Performance"])


@router.get("/performance", response_model=ModelPerformanceResponse)
def get_model_performance(
    _current_user: User = Depends(get_current_user),
) -> ModelPerformanceResponse:
    """Return actual saved evaluation metrics, confusion matrices, and ROC curves for all 4 ML models."""
    try:
        results = load_model_evaluation_results()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return ModelPerformanceResponse(**results)
