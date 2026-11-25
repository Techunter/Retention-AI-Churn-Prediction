from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.database import init_db
from app.routers import analytics, auth, customers, models, predictions, recommendations

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize database tables on startup when DB is reachable."""
    try:
        init_db()
    except Exception as exc:
        # Log warning instead of crashing import if DB isn't initialized yet
        print(f"[Retention AI] Startup DB initialization note: {exc}")
    yield


app = FastAPI(
    title="Retention AI — Customer Churn Prediction & Retention Platform",
    description=(
        "AI-powered telecom customer churn prediction platform featuring XGBoost "
        "inference, TreeSHAP explainability, rule-based retention recommendations, "
        "and MySQL persistence."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(predictions.router)
app.include_router(analytics.router)
app.include_router(recommendations.router)
app.include_router(models.router)


@app.get("/api/health", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.APP_NAME}
