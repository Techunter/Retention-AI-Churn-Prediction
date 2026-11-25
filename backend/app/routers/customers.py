import io
import math
from typing import Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.ml.preprocessing import (
    API_TO_TELCO_MAP,
    REQUIRED_TELCO_CSV_COLUMNS,
    clean_telco_dataframe,
)
from app.models.models import ChurnPrediction, Customer, User
from app.schemas.schemas import (
    CustomerCreate,
    CustomerDetailResponse,
    CustomerListResponse,
    CustomerOut,
    CustomerUpdate,
    CustomerUploadResponse,
    PredictionHistoryItem,
)
from app.services.prediction_persistence import get_prediction_by_id, run_and_persist_prediction

router = APIRouter(prefix="/api/customers", tags=["Customers"])


def _attach_latest_predictions(db: Session, customers: List[Customer]) -> List[CustomerOut]:
    if not customers:
        return []
    customer_ids = [c.id for c in customers]
    subq = (
        db.query(
            ChurnPrediction.customer_id,
            func.max(ChurnPrediction.id).label("max_id"),
        )
        .filter(ChurnPrediction.customer_id.in_(customer_ids))
        .group_by(ChurnPrediction.customer_id)
        .subquery()
    )
    latest_preds = (
        db.query(ChurnPrediction)
        .join(subq, ChurnPrediction.id == subq.c.max_id)
        .all()
    )
    pred_map: Dict[int, ChurnPrediction] = {p.customer_id: p for p in latest_preds}

    items: List[CustomerOut] = []
    for cust in customers:
        out = CustomerOut.model_validate(cust)
        pred = pred_map.get(cust.id)
        if pred is not None:
            out.latest_churn_probability = pred.churn_probability
            out.latest_risk_category = pred.risk_category
            out.latest_prediction_id = pred.id
            out.latest_prediction_date = pred.prediction_date
        items.append(out)
    return items


@router.get("", response_model=CustomerListResponse)
def list_customers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    risk_category: Optional[str] = Query(default=None),
    contract: Optional[str] = Query(default=None),
    internet_service: Optional[str] = Query(default=None),
    sort_by: str = Query(default="created_at", pattern="^(created_at|tenure|monthly_charges|customer_id)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CustomerListResponse:
    """Return paginated customer records with optional filtering, sorting, and latest risk tier."""
    latest_subq = (
        db.query(
            ChurnPrediction.customer_id.label("cust_id"),
            func.max(ChurnPrediction.id).label("max_pred_id"),
        )
        .group_by(ChurnPrediction.customer_id)
        .subquery()
    )

    latest_pred_alias = (
        db.query(
            ChurnPrediction.customer_id.label("cust_id"),
            ChurnPrediction.risk_category.label("risk_category"),
            ChurnPrediction.churn_probability.label("churn_probability"),
        )
        .join(latest_subq, ChurnPrediction.id == latest_subq.c.max_pred_id)
        .subquery()
    )

    query = db.query(Customer).outerjoin(
        latest_pred_alias, Customer.id == latest_pred_alias.c.cust_id
    )

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.customer_id.ilike(term),
                Customer.contract.ilike(term),
                Customer.internet_service.ilike(term),
                Customer.payment_method.ilike(term),
            )
        )

    if risk_category and risk_category != "All":
        if risk_category == "Unscored":
            query = query.filter(latest_pred_alias.c.risk_category.is_(None))
        else:
            query = query.filter(latest_pred_alias.c.risk_category == risk_category)

    if contract and contract != "All":
        query = query.filter(Customer.contract == contract)

    if internet_service and internet_service != "All":
        query = query.filter(Customer.internet_service == internet_service)

    total = query.count()

    sort_col_map = {
        "created_at": Customer.created_at,
        "tenure": Customer.tenure,
        "monthly_charges": Customer.monthly_charges,
        "customer_id": Customer.customer_id,
    }
    sort_col = sort_col_map[sort_by]
    order_fn = asc if sort_order == "asc" else desc

    customers = (
        query.order_by(order_fn(sort_col), desc(Customer.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = _attach_latest_predictions(db, customers)
    total_pages = max(1, math.ceil(total / page_size))

    return CustomerListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{customer_db_id}", response_model=CustomerDetailResponse)
def get_customer_detail(
    customer_db_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CustomerDetailResponse:
    """Return full customer profile, prediction history, and latest SHAP-explained prediction."""
    customer = db.query(Customer).filter(Customer.id == customer_db_id).first()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    cust_out = _attach_latest_predictions(db, [customer])[0]
    preds = (
        db.query(ChurnPrediction)
        .filter(ChurnPrediction.customer_id == customer.id)
        .order_by(desc(ChurnPrediction.prediction_date), desc(ChurnPrediction.id))
        .all()
    )
    history = [
        PredictionHistoryItem(
            id=p.id,
            churn_probability=p.churn_probability,
            churn_probability_pct=round(p.churn_probability * 100.0, 2),
            risk_category=p.risk_category,
            model_name=p.model_name,
            prediction_date=p.prediction_date,
        )
        for p in preds
    ]
    latest_full = get_prediction_by_id(db, preds[0].id) if preds else None

    return CustomerDetailResponse(
        customer=cust_out,
        predictions=history,
        latest_prediction=latest_full,
    )


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CustomerOut:
    """Create a new customer record."""
    existing = (
        db.query(Customer)
        .filter(Customer.customer_id == payload.customer_id.strip())
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Customer with ID '{payload.customer_id}' already exists.",
        )

    data = payload.model_dump()
    data["customer_id"] = data["customer_id"].strip()
    customer = Customer(**data)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return CustomerOut.model_validate(customer)


@router.put("/{customer_db_id}", response_model=CustomerOut)
def update_customer(
    customer_db_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CustomerOut:
    """Update an existing customer's profile attributes."""
    customer = db.query(Customer).filter(Customer.id == customer_db_id).first()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return _attach_latest_predictions(db, [customer])[0]


@router.delete("/{customer_db_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_db_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> None:
    """Delete a customer and cascade-delete associated predictions and recommendations."""
    customer = db.query(Customer).filter(Customer.id == customer_db_id).first()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")
    db.delete(customer)
    db.commit()


@router.post("/upload", response_model=CustomerUploadResponse)
async def upload_customers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CustomerUploadResponse:
    """Validate, clean, and import IBM Telco Customer Churn CSV records into MySQL."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please upload a valid .csv file.",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded CSV file is empty.",
        )

    try:
        df = pd.read_csv(io.BytesIO(raw_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse CSV file: {exc}",
        ) from exc

    df.columns = [str(c).strip() for c in df.columns]
    missing_cols = [col for col in REQUIRED_TELCO_CSV_COLUMNS if col not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required IBM Telco columns: {', '.join(missing_cols)}",
        )

    cleaned_df, blank_fixed = clean_telco_dataframe(df)
    total_rows = int(len(cleaned_df))

    existing_customers = {
        c.customer_id: c
        for c in db.query(Customer).all()
    }

    inserted = 0
    updated = 0
    skipped = 0
    new_objects: List[Customer] = []
    seen_in_file = set()

    for _, row in cleaned_df.iterrows():
        cust_id_val = row.get("customerID")
        if pd.isna(cust_id_val) or not str(cust_id_val).strip():
            skipped += 1
            continue
        cust_id_str = str(cust_id_val).strip()
        if cust_id_str in seen_in_file:
            skipped += 1
            continue
        seen_in_file.add(cust_id_str)

        try:
            record_data = {}
            for api_key, telco_col in API_TO_TELCO_MAP.items():
                if telco_col == "customerID":
                    record_data["customer_id"] = cust_id_str
                elif api_key in ("senior_citizen", "tenure"):
                    record_data[api_key] = int(row[telco_col])
                elif api_key in ("monthly_charges", "total_charges"):
                    val = float(row[telco_col])
                    if math.isnan(val):
                        raise ValueError(f"NaN value in {telco_col}")
                    record_data[api_key] = round(val, 2)
                else:
                    val = row[telco_col]
                    if pd.isna(val):
                        raise ValueError(f"Missing value in {telco_col}")
                    record_data[api_key] = str(val).strip()
        except Exception:
            skipped += 1
            continue

        if cust_id_str in existing_customers:
            cust_obj = existing_customers[cust_id_str]
            for k, v in record_data.items():
                if k != "customer_id":
                    setattr(cust_obj, k, v)
            updated += 1
        else:
            new_objects.append(Customer(**record_data))
            inserted += 1

    if new_objects:
        db.bulk_save_objects(new_objects)
    db.commit()

    return CustomerUploadResponse(
        total_rows=total_rows,
        inserted=inserted,
        updated=updated,
        skipped=skipped,
        blank_total_charges_fixed=blank_fixed,
        message=(
            f"Successfully processed {total_rows} records: "
            f"{inserted} inserted, {updated} updated, {skipped} skipped."
        ),
    )


@router.post("/batch-score", response_model=Dict[str, int])
def batch_score_unpredicted(
    limit: int = Query(default=200, ge=1, le=2000),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Dict[str, int]:
    """Run live XGBoost + TreeSHAP predictions for customers without an existing prediction."""
    scored_ids_subq = db.query(ChurnPrediction.customer_id).distinct()
    unscored = (
        db.query(Customer)
        .filter(~Customer.id.in_(scored_ids_subq))
        .limit(limit)
        .all()
    )
    scored_count = 0
    for customer in unscored:
        run_and_persist_prediction(db, customer)
        scored_count += 1
    return {"scored": scored_count}
