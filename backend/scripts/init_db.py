"""
Database initialization and seed script for Retention AI.

1. Ensures the target MySQL database exists.
2. Creates all five normalized tables via SQLAlchemy ORM.
3. Seeds the demo administrator account (admin@retentionai.com / Admin@123).
4. Optionally seeds initial representative IBM Telco customers with live ML predictions
   if the customers table is empty and trained model artifacts are present.

Usage:
    python -m scripts.init_db
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.ml.preprocessing import API_TO_TELCO_MAP, clean_telco_dataframe  # noqa: E402
from app.models.models import Customer, User  # noqa: E402
from app.services.prediction_persistence import run_and_persist_prediction  # noqa: E402

DEFAULT_DATASET = PROJECT_ROOT / "dataset" / "WA_Fn-UseC_-Telco-Customer-Churn.csv"


def ensure_database_exists() -> None:
    settings = get_settings()
    if settings.DATABASE_URL:
        return
    from urllib.parse import quote_plus

    encoded_pw = quote_plus(settings.MYSQL_PASSWORD)
    server_url = (
        f"mysql+pymysql://{settings.MYSQL_USER}:{encoded_pw}"
        f"@{settings.MYSQL_HOST}:{settings.MYSQL_PORT}/?charset=utf8mb4"
    )
    temp_engine = create_engine(server_url)
    with temp_engine.connect() as conn:
        conn.execute(
            text(
                f"CREATE DATABASE IF NOT EXISTS `{settings.MYSQL_DATABASE}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        )
        conn.commit()
    temp_engine.dispose()


def seed_admin_user() -> None:
    db = SessionLocal()
    try:
        admin_email = "admin@retentionai.com"
        existing = db.query(User).filter(User.email == admin_email).first()
        if existing is None:
            admin = User(
                name="Retention AI Administrator",
                email=admin_email,
                hashed_password=hash_password("Admin@123"),
            )
            db.add(admin)
            db.commit()
            print(f"Seeded demo administrator account: {admin_email} / Admin@123")
        else:
            print(f"Demo administrator account already exists: {admin_email}")
    finally:
        db.close()


def seed_sample_customers(sample_size: int = 30) -> None:
    if sample_size <= 0 or not DEFAULT_DATASET.exists():
        return

    artifacts_dir = BACKEND_DIR / "artifacts"
    if not (artifacts_dir / "xgboost_model.joblib").exists():
        print("Skipping sample predictions: model artifacts not trained yet.")
        return

    db = SessionLocal()
    try:
        if db.query(Customer).count() > 0:
            print("Customers table already populated; skipping sample seed.")
            return

        raw_df = pd.read_csv(DEFAULT_DATASET)
        cleaned_df, _ = clean_telco_dataframe(raw_df)

        # Select a balanced sample of churned and retained Telco customers
        churn_yes = cleaned_df[cleaned_df["Churn"] == "Yes"].head(sample_size // 2)
        churn_no = cleaned_df[cleaned_df["Churn"] == "No"].head(sample_size - len(churn_yes))
        sample_df = pd.concat([churn_yes, churn_no], ignore_index=True)

        seeded = 0
        for _, row in sample_df.iterrows():
            record = {}
            for api_key, telco_col in API_TO_TELCO_MAP.items():
                if api_key in ("senior_citizen", "tenure"):
                    record[api_key] = int(row[telco_col])
                elif api_key in ("monthly_charges", "total_charges"):
                    record[api_key] = round(float(row[telco_col]), 2)
                else:
                    record[api_key] = str(row[telco_col]).strip()
            customer = Customer(**record)
            db.add(customer)
            db.flush()
            run_and_persist_prediction(db, customer)
            seeded += 1

        print(f"Seeded {seeded} real IBM Telco customers with live XGBoost + TreeSHAP predictions.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize Retention AI MySQL database.")
    parser.add_argument(
        "--sample-size",
        type=int,
        default=30,
        help="Number of initial IBM Telco records to seed with live predictions (0 to skip).",
    )
    args = parser.parse_args()

    ensure_database_exists()
    init_db()
    print("Database tables verified/created successfully.")
    seed_admin_user()
    seed_sample_customers(args.sample_size)


if __name__ == "__main__":
    main()
