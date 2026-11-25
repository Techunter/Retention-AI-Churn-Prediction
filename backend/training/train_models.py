"""
Reproducible ML Training and Evaluation Pipeline for Retention AI.

Trains and evaluates four models on the IBM Telco Customer Churn Dataset:
1. Logistic Regression (L2 regularization, balanced class weights)
2. Random Forest (>= 200 trees, depth/leaf tuning on validation)
3. XGBoost (gradient boosting with scale_pos_weight & hyperparameter tuning) -> Production Model
4. PyTorch Multi-Layer Perceptron (ReLU, BatchNorm1d, Dropout, BCEWithLogitsLoss)

Usage:
    python -m training.train_models
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset
from xgboost import XGBClassifier

# Ensure backend directory is on sys.path when executed directly
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ml.mlp_model import ChurnMLP  # noqa: E402
from app.ml.preprocessing import (  # noqa: E402
    ALL_MODEL_FEATURES,
    build_preprocessor,
    clean_telco_dataframe,
)

DEFAULT_DATASET_PATH = PROJECT_ROOT / "dataset" / "WA_Fn-UseC_-Telco-Customer-Churn.csv"
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"
RANDOM_SEED = 42


def set_seed(seed: int = RANDOM_SEED) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)


def compute_metrics(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5) -> Dict[str, float]:
    y_pred = (y_prob >= threshold).astype(int)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4),
    }


def compute_roc_points(y_true: np.ndarray, y_prob: np.ndarray, max_points: int = 80) -> List[Dict[str, float]]:
    fpr, tpr, thresholds = roc_curve(y_true, y_prob)
    if len(fpr) > max_points:
        indices = np.linspace(0, len(fpr) - 1, max_points, dtype=int)
        fpr = fpr[indices]
        tpr = tpr[indices]
        thresholds = thresholds[indices]
    points = []
    for f, t, thr in zip(fpr, tpr, thresholds):
        points.append(
            {
                "fpr": round(float(f), 4),
                "tpr": round(float(t), 4),
                "threshold": round(float(thr if np.isfinite(thr) else 1.0), 4),
            }
        )
    return points


def load_and_split_dataset(dataset_path: Path) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, np.ndarray, np.ndarray, np.ndarray, Dict[str, Any]]:
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Download the IBM Telco Customer Churn CSV first."
        )

    raw_df = pd.read_csv(dataset_path)
    cleaned_df, blank_fixed = clean_telco_dataframe(raw_df)

    if "Churn" not in cleaned_df.columns:
        raise ValueError("Dataset must contain target column 'Churn'.")

    y = (cleaned_df["Churn"].astype(str).str.strip().str.lower() == "yes").astype(int).to_numpy()
    # Explicitly exclude customerID and target Churn from model features
    X = cleaned_df[ALL_MODEL_FEATURES].copy()

    # Stratified split: 70% train (~4930), 15% validation (~1056), 15% test (~1057)
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, stratify=y, random_state=RANDOM_SEED
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, stratify=y_temp, random_state=RANDOM_SEED
    )

    summary = {
        "dataset_file": dataset_path.name,
        "total_records": int(len(cleaned_df)),
        "original_columns": int(len(raw_df.columns)),
        "predictive_features": len(ALL_MODEL_FEATURES),
        "blank_total_charges_handled": int(blank_fixed),
        "churn_rate_pct": round(float(y.mean() * 100.0), 2),
        "splits": {
            "train": int(len(X_train)),
            "validation": int(len(X_val)),
            "test": int(len(X_test)),
        },
    }
    return X_train, X_val, X_test, y_train, y_val, y_test, summary


def train_logistic_regression(
    X_train_proc: np.ndarray, y_train: np.ndarray, X_val_proc: np.ndarray, y_val: np.ndarray
) -> Tuple[LogisticRegression, Dict[str, float], np.ndarray]:
    best_model = None
    best_score = -1.0
    for c_val in [0.1, 0.5, 1.0, 2.0]:
        model = LogisticRegression(
            C=c_val,
            penalty="l2",
            class_weight="balanced",
            solver="lbfgs",
            max_iter=1500,
            random_state=RANDOM_SEED,
        )
        model.fit(X_train_proc, y_train)
        val_prob = model.predict_proba(X_val_proc)[:, 1]
        auc = roc_auc_score(y_val, val_prob)
        if auc > best_score:
            best_score = auc
            best_model = model

    assert best_model is not None
    val_prob = best_model.predict_proba(X_val_proc)[:, 1]
    return best_model, compute_metrics(y_val, val_prob), val_prob


def train_random_forest(
    X_train_proc: np.ndarray, y_train: np.ndarray, X_val_proc: np.ndarray, y_val: np.ndarray
) -> Tuple[RandomForestClassifier, Dict[str, float], np.ndarray]:
    best_model = None
    best_score = -1.0
    candidates = [
        {"n_estimators": 250, "max_depth": 8, "min_samples_leaf": 5},
        {"n_estimators": 300, "max_depth": 10, "min_samples_leaf": 4},
        {"n_estimators": 350, "max_depth": 12, "min_samples_leaf": 3},
    ]
    for params in candidates:
        model = RandomForestClassifier(
            n_estimators=params["n_estimators"],
            max_depth=params["max_depth"],
            min_samples_leaf=params["min_samples_leaf"],
            class_weight="balanced_subsample",
            random_state=RANDOM_SEED,
            n_jobs=-1,
        )
        model.fit(X_train_proc, y_train)
        val_prob = model.predict_proba(X_val_proc)[:, 1]
        metrics = compute_metrics(y_val, val_prob)
        composite = 0.5 * metrics["roc_auc"] + 0.5 * metrics["f1_score"]
        if composite > best_score:
            best_score = composite
            best_model = model

    assert best_model is not None
    val_prob = best_model.predict_proba(X_val_proc)[:, 1]
    return best_model, compute_metrics(y_val, val_prob), val_prob


def train_xgboost(
    X_train_proc: np.ndarray, y_train: np.ndarray, X_val_proc: np.ndarray, y_val: np.ndarray
) -> Tuple[XGBClassifier, Dict[str, float], np.ndarray]:
    neg_count = int((y_train == 0).sum())
    pos_count = int((y_train == 1).sum())
    scale_pos_weight = neg_count / max(pos_count, 1)

    best_model = None
    best_score = -1.0
    param_grid = [
        {"n_estimators": 250, "learning_rate": 0.03, "max_depth": 3, "subsample": 0.8, "colsample_bytree": 0.8, "reg_alpha": 0.5, "reg_lambda": 2.0},
        {"n_estimators": 300, "learning_rate": 0.04, "max_depth": 4, "subsample": 0.85, "colsample_bytree": 0.8, "reg_alpha": 0.3, "reg_lambda": 1.5},
        {"n_estimators": 350, "learning_rate": 0.025, "max_depth": 4, "subsample": 0.8, "colsample_bytree": 0.75, "reg_alpha": 1.0, "reg_lambda": 2.5},
    ]

    for params in param_grid:
        model = XGBClassifier(
            n_estimators=params["n_estimators"],
            learning_rate=params["learning_rate"],
            max_depth=params["max_depth"],
            subsample=params["subsample"],
            colsample_bytree=params["colsample_bytree"],
            reg_alpha=params["reg_alpha"],
            reg_lambda=params["reg_lambda"],
            scale_pos_weight=scale_pos_weight,
            objective="binary:logistic",
            eval_metric="auc",
            random_state=RANDOM_SEED,
            n_jobs=-1,
        )
        model.fit(
            X_train_proc,
            y_train,
            eval_set=[(X_val_proc, y_val)],
            verbose=False,
        )
        val_prob = model.predict_proba(X_val_proc)[:, 1]
        metrics = compute_metrics(y_val, val_prob)
        composite = 0.4 * metrics["roc_auc"] + 0.3 * metrics["f1_score"] + 0.3 * metrics["recall"]
        if composite > best_score:
            best_score = composite
            best_model = model

    assert best_model is not None
    val_prob = best_model.predict_proba(X_val_proc)[:, 1]
    return best_model, compute_metrics(y_val, val_prob), val_prob


def train_pytorch_mlp(
    X_train_proc: np.ndarray, y_train: np.ndarray, X_val_proc: np.ndarray, y_val: np.ndarray
) -> Tuple[ChurnMLP, Dict[str, Any], Dict[str, float], np.ndarray]:
    device = torch.device("cpu")
    input_dim = X_train_proc.shape[1]
    hidden_dims = (128, 64, 32)
    dropout = 0.30

    model = ChurnMLP(input_dim=input_dim, hidden_dims=hidden_dims, dropout=dropout).to(device)
    neg_count = float((y_train == 0).sum())
    pos_count = float((y_train == 1).sum())
    pos_weight = torch.tensor([neg_count / max(pos_count, 1.0)], dtype=torch.float32, device=device)

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=4)

    train_dataset = TensorDataset(
        torch.tensor(X_train_proc, dtype=torch.float32),
        torch.tensor(y_train, dtype=torch.float32),
    )
    train_loader = DataLoader(train_dataset, batch_size=128, shuffle=True)

    X_val_tensor = torch.tensor(X_val_proc, dtype=torch.float32, device=device)

    best_auc = -1.0
    best_state = None
    patience_counter = 0
    max_epochs = 60

    for _epoch in range(max_epochs):
        model.train()
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad()
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_logits = model(X_val_tensor)
            val_prob = torch.sigmoid(val_logits).cpu().numpy()
        val_auc = roc_auc_score(y_val, val_prob)
        scheduler.step(val_auc)

        if val_auc > best_auc + 1e-4:
            best_auc = val_auc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= 10:
                break

    assert best_state is not None
    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        final_val_prob = torch.sigmoid(model(X_val_tensor)).cpu().numpy()

    mlp_config = {
        "input_dim": int(input_dim),
        "hidden_dims": list(hidden_dims),
        "dropout": float(dropout),
    }
    return model, mlp_config, compute_metrics(y_val, final_val_prob), final_val_prob


def run_training(dataset_path: Path, artifacts_dir: Path) -> Dict[str, Any]:
    set_seed(RANDOM_SEED)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    X_train, X_val, X_test, y_train, y_val, y_test, dataset_summary = load_and_split_dataset(dataset_path)

    # Fit preprocessor ONLY on training split to prevent data/target leakage
    preprocessor = build_preprocessor()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_val_proc = preprocessor.transform(X_val)
    X_test_proc = preprocessor.transform(X_test)

    print(f"Dataset loaded: {dataset_summary['total_records']} rows | Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")

    # 1. Logistic Regression
    lr_model, lr_val_metrics, lr_val_prob = train_logistic_regression(X_train_proc, y_train, X_val_proc, y_val)
    print(f"[Logistic Regression] Val: {lr_val_metrics}")

    # 2. Random Forest
    rf_model, rf_val_metrics, rf_val_prob = train_random_forest(X_train_proc, y_train, X_val_proc, y_val)
    print(f"[Random Forest]       Val: {rf_val_metrics}")

    # 3. XGBoost (Intended Production Model)
    xgb_model, xgb_val_metrics, xgb_val_prob = train_xgboost(X_train_proc, y_train, X_val_proc, y_val)
    print(f"[XGBoost]             Val: {xgb_val_metrics}")

    # 4. PyTorch MLP
    mlp_model, mlp_config, mlp_val_metrics, mlp_val_prob = train_pytorch_mlp(X_train_proc, y_train, X_val_proc, y_val)
    print(f"[PyTorch MLP]         Val: {mlp_val_metrics}")

    # Evaluate selected production model (XGBoost) on held-out test set AFTER selection
    xgb_test_prob = xgb_model.predict_proba(X_test_proc)[:, 1]
    xgb_test_metrics = compute_metrics(y_test, xgb_test_prob)
    xgb_test_pred = (xgb_test_prob >= 0.5).astype(int)
    xgb_cm = confusion_matrix(y_test, xgb_test_pred).tolist()
    xgb_roc = compute_roc_points(y_test, xgb_test_prob)
    print(f"[XGBoost Production]  Test: {xgb_test_metrics} | CM: {xgb_cm}")

    # Also compute test metrics & ROC curves for comparison completeness after selection
    lr_test_prob = lr_model.predict_proba(X_test_proc)[:, 1]
    rf_test_prob = rf_model.predict_proba(X_test_proc)[:, 1]
    mlp_model.eval()
    with torch.no_grad():
        mlp_test_prob = torch.sigmoid(mlp_model(torch.tensor(X_test_proc, dtype=torch.float32))).numpy()

    # Save artifacts
    joblib.dump(preprocessor, artifacts_dir / "preprocessor.joblib")
    joblib.dump(lr_model, artifacts_dir / "logistic_regression_model.joblib")
    joblib.dump(rf_model, artifacts_dir / "random_forest_model.joblib")
    joblib.dump(xgb_model, artifacts_dir / "xgboost_model.joblib")
    torch.save(mlp_model.state_dict(), artifacts_dir / "pytorch_mlp_state.pt")
    with open(artifacts_dir / "pytorch_mlp_config.json", "w", encoding="utf-8") as f:
        json.dump(mlp_config, f, indent=2)

    evaluation_results = {
        "production_model": "XGBoost",
        "dataset_summary": dataset_summary,
        "models": [
            {
                "model_key": "logistic_regression",
                "model_name": "Logistic Regression",
                "is_production": False,
                "validation_metrics": lr_val_metrics,
                "test_metrics": compute_metrics(y_test, lr_test_prob),
                "confusion_matrix": confusion_matrix(y_test, (lr_test_prob >= 0.5).astype(int)).tolist(),
                "roc_curve": compute_roc_points(y_test, lr_test_prob),
            },
            {
                "model_key": "random_forest",
                "model_name": "Random Forest",
                "is_production": False,
                "validation_metrics": rf_val_metrics,
                "test_metrics": compute_metrics(y_test, rf_test_prob),
                "confusion_matrix": confusion_matrix(y_test, (rf_test_prob >= 0.5).astype(int)).tolist(),
                "roc_curve": compute_roc_points(y_test, rf_test_prob),
            },
            {
                "model_key": "xgboost",
                "model_name": "XGBoost",
                "is_production": True,
                "validation_metrics": xgb_val_metrics,
                "test_metrics": xgb_test_metrics,
                "confusion_matrix": xgb_cm,
                "roc_curve": xgb_roc,
            },
            {
                "model_key": "pytorch_mlp",
                "model_name": "PyTorch MLP",
                "is_production": False,
                "validation_metrics": mlp_val_metrics,
                "test_metrics": compute_metrics(y_test, mlp_test_prob),
                "confusion_matrix": confusion_matrix(y_test, (mlp_test_prob >= 0.5).astype(int)).tolist(),
                "roc_curve": compute_roc_points(y_test, mlp_test_prob),
            },
        ],
    }

    with open(artifacts_dir / "model_evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump(evaluation_results, f, indent=2)

    print(f"All artifacts saved to {artifacts_dir}")
    return evaluation_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train and evaluate Retention AI churn models.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to the IBM Telco Customer Churn CSV file.",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=ARTIFACTS_DIR,
        help="Output directory for trained models and metrics.",
    )
    args = parser.parse_args()
    run_training(args.dataset, args.artifacts_dir)
