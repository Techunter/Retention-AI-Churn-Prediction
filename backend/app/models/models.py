from datetime import datetime
from typing import List

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """Authorized platform administrator or analyst user."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class Customer(Base):
    """Telecom customer profile aligned with IBM Telco Customer Churn schema."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    senior_citizen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    partner: Mapped[str] = mapped_column(String(10), nullable=False)
    dependents: Mapped[str] = mapped_column(String(10), nullable=False)
    tenure: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    phone_service: Mapped[str] = mapped_column(String(20), nullable=False)
    multiple_lines: Mapped[str] = mapped_column(String(30), nullable=False)
    internet_service: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    online_security: Mapped[str] = mapped_column(String(30), nullable=False)
    online_backup: Mapped[str] = mapped_column(String(30), nullable=False)
    device_protection: Mapped[str] = mapped_column(String(30), nullable=False)
    tech_support: Mapped[str] = mapped_column(String(30), nullable=False)
    streaming_tv: Mapped[str] = mapped_column(String(30), nullable=False)
    streaming_movies: Mapped[str] = mapped_column(String(30), nullable=False)
    contract: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    paperless_billing: Mapped[str] = mapped_column(String(10), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    monthly_charges: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    total_charges: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    predictions: Mapped[List["ChurnPrediction"]] = relationship(
        "ChurnPrediction",
        back_populates="customer",
        cascade="all, delete-orphan",
        order_by="desc(ChurnPrediction.prediction_date)",
    )
    recommendations: Mapped[List["RetentionRecommendation"]] = relationship(
        "RetentionRecommendation",
        back_populates="customer",
        cascade="all, delete-orphan",
        order_by="desc(RetentionRecommendation.created_at)",
    )


class ChurnPrediction(Base):
    """Stored ML churn prediction result for a customer."""

    __tablename__ = "churn_predictions"
    __table_args__ = (
        Index("ix_churn_predictions_customer_date", "customer_id", "prediction_date"),
        Index("ix_churn_predictions_risk_category", "risk_category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    churn_probability: Mapped[float] = mapped_column(Float, nullable=False)
    risk_category: Mapped[str] = mapped_column(String(20), nullable=False)
    model_name: Mapped[str] = mapped_column(String(80), nullable=False, default="XGBoost")
    prediction_date: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="predictions")
    shap_explanations: Mapped[List["ShapExplanation"]] = relationship(
        "ShapExplanation",
        back_populates="prediction",
        cascade="all, delete-orphan",
        order_by="ShapExplanation.feature_rank",
    )
    recommendations: Mapped[List["RetentionRecommendation"]] = relationship(
        "RetentionRecommendation",
        back_populates="prediction",
        cascade="all, delete-orphan",
    )


class ShapExplanation(Base):
    """Individual feature SHAP contribution tied to a prediction."""

    __tablename__ = "shap_explanations"
    __table_args__ = (
        Index("ix_shap_explanations_pred_rank", "prediction_id", "feature_rank"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prediction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("churn_predictions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    feature_name: Mapped[str] = mapped_column(String(120), nullable=False)
    shap_value: Mapped[float] = mapped_column(Float, nullable=False)
    impact_type: Mapped[str] = mapped_column(String(20), nullable=False)
    feature_rank: Mapped[int] = mapped_column(Integer, nullable=False)

    prediction: Mapped["ChurnPrediction"] = relationship(
        "ChurnPrediction", back_populates="shap_explanations"
    )


class RetentionRecommendation(Base):
    """Actionable retention recommendation generated from risk tier and SHAP drivers."""

    __tablename__ = "retention_recommendations"
    __table_args__ = (
        Index("ix_retention_rec_status_priority", "action_status", "priority"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prediction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("churn_predictions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    churn_reason: Mapped[str] = mapped_column(String(255), nullable=False)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    action_status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    prediction: Mapped["ChurnPrediction"] = relationship(
        "ChurnPrediction", back_populates="recommendations"
    )
    customer: Mapped["Customer"] = relationship("Customer", back_populates="recommendations")
