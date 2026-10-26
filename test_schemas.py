from app.schemas import BoundingBox, VisualMetrics, OnionPrediction

def test_prediction_schema_bounds():
    p = OnionPrediction(onion_index=1, bbox=BoundingBox(x=0, y=0, width=1, height=1), quality_stars=5,
                        quality_label='Premium Quality', confidence=0.9,
                        visual_metrics=VisualMetrics(color_consistency=90, shape_regularity=80, surface_uniformity=75), reasons=['Test'])
    assert p.quality_stars == 5

def test_prediction_rejects_invalid_star_rating():
    try:
        OnionPrediction(onion_index=1, bbox=BoundingBox(x=0, y=0, width=1, height=1), quality_stars=6,
                        quality_label='Invalid', confidence=0.9,
                        visual_metrics=VisualMetrics(color_consistency=90, shape_regularity=80, surface_uniformity=75), reasons=[])
    except Exception:
        return
    raise AssertionError('Expected schema validation to reject invalid star rating')
