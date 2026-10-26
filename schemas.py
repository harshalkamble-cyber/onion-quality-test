from pydantic import BaseModel, Field
from typing import Any

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float

class VisualMetrics(BaseModel):
    color_consistency: float = Field(ge=0, le=100)
    shape_regularity: float = Field(ge=0, le=100)
    surface_uniformity: float = Field(ge=0, le=100)
    visible_defect_score: float | None = Field(default=None, ge=0, le=100)

class OnionPrediction(BaseModel):
    onion_index: int
    bbox: BoundingBox
    quality_stars: int = Field(ge=1, le=5)
    quality_label: str
    confidence: float = Field(ge=0, le=1)
    visual_metrics: VisualMetrics
    reasons: list[str]
    visible_defects: list[str] = []

class ImageAnalysis(BaseModel):
    image_index: int
    detected_onions: int
    predictions: list[OnionPrediction]

class BatchAnalysisResponse(BaseModel):
    model_version: str
    device: str
    processing_ms: int
    total_images: int
    total_onions: int
    images: list[ImageAnalysis]
    disclaimer: str

class HealthResponse(BaseModel):
    status: str
    model_ready: bool
    model_version: str
    device: str
    missing_models: list[str]
