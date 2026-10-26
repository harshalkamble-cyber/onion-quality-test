from __future__ import annotations
import os
import re
import time
from pathlib import Path
from io import BytesIO
from typing import Any

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

from .settings import settings
from .schemas import BatchAnalysisResponse, ImageAnalysis, OnionPrediction, BoundingBox, VisualMetrics

LABELS = {
    1: 'Very Poor Quality', 2: 'Poor Quality', 3: 'Average Quality',
    4: 'Good Quality', 5: 'Premium Quality'
}
DISCLAIMER = (
    'AI-assisted visual assessment only. Results are based on the supplied image and the deployed, '
    'validated model. They do not measure internal quality, chemical residues, moisture, or food safety. '
    'Use a representative sample and trained human inspection for high-stakes grading.'
)

class ModelNotReady(RuntimeError):
    pass

class ImageRejected(ValueError):
    pass

class OnionInference:
    def __init__(self) -> None:
        self.detector: YOLO | None = None
        self.classifier: YOLO | None = None
        self.device = self._resolve_device()
        self.load_error: str | None = None

    def _resolve_device(self) -> str:
        if settings.device != 'auto':
            return settings.device
        try:
            import torch
            return '0' if torch.cuda.is_available() else 'cpu'
        except Exception:
            return 'cpu'

    @property
    def missing_models(self) -> list[str]:
        missing = []
        if not Path(settings.detector_weights_path).is_file(): missing.append('detector')
        if not Path(settings.classifier_weights_path).is_file(): missing.append('quality_classifier')
        return missing

    @property
    def ready(self) -> bool:
        return self.detector is not None and self.classifier is not None

    def load(self) -> None:
        missing = self.missing_models
        if missing:
            self.load_error = f"Missing required trained model file(s): {', '.join(missing)}"
            return
        try:
            self.detector = YOLO(settings.detector_weights_path)
            self.classifier = YOLO(settings.classifier_weights_path)
            self.load_error = None
        except Exception as exc:
            self.load_error = f'Model loading failed: {type(exc).__name__}'
            self.detector = None
            self.classifier = None

    @staticmethod
    def decode_image(data: bytes) -> np.ndarray:
        if not data:
            raise ImageRejected('The uploaded file is empty.')
        try:
            with Image.open(BytesIO(data)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise ImageRejected('Only JPEG, PNG, and WebP files are supported.')
                width, height = image.size
                if width < 64 or height < 64:
                    raise ImageRejected('Image is too small. Use an image at least 64 × 64 pixels.')
                if width > settings.max_image_side or height > settings.max_image_side or width * height > settings.max_pixels:
                    raise ImageRejected('Image dimensions exceed the configured safety limit.')
                rgb = np.asarray(image.convert('RGB'))
                return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except ImageRejected:
            raise
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise ImageRejected('The uploaded file is not a valid supported image.') from exc

    @staticmethod
    def _metric_values(crop: np.ndarray, visible_defect_count: int | None = None) -> VisualMetrics:
        # These are interpretable image descriptors, not laboratory measurements or independent quality labels.
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        hue = hsv[:, :, 0].astype(np.float32)
        sat = hsv[:, :, 1].astype(np.float32)
        val = hsv[:, :, 2].astype(np.float32)
        hue_std = float(np.std(hue) / 90.0)
        sat_std = float(np.std(sat) / 128.0)
        color_consistency = float(np.clip(100 * (1 - 0.55 * min(hue_std, 1) - 0.45 * min(sat_std, 1)), 0, 100))
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        _, threshold = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        threshold = cv2.morphologyEx(threshold, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        shape_regularity = 50.0
        if contours:
            contour = max(contours, key=cv2.contourArea)
            area = float(cv2.contourArea(contour))
            perimeter = float(cv2.arcLength(contour, True))
            if perimeter > 0:
                circularity = min(1.0, 4 * np.pi * area / (perimeter * perimeter))
                shape_regularity = float(np.clip(circularity * 100, 0, 100))
        local_variance = float(np.var(val / 255.0))
        surface_uniformity = float(np.clip(100 * (1 - min(local_variance * 4, 1)), 0, 100))
        return VisualMetrics(
            color_consistency=round(color_consistency, 1),
            shape_regularity=round(shape_regularity, 1),
            surface_uniformity=round(surface_uniformity, 1),
            visible_defect_score=None if visible_defect_count is None else round(float(np.clip(100 - min(visible_defect_count, 5) * 20, 0, 100)), 1),
        )

    @staticmethod
    def _star_class(name: str) -> int | None:
        normalized = name.lower().replace('-', '_').replace(' ', '_')
        for stars in range(1, 6):
            if re.search(rf'(^|\D){stars}(_?star|_?stars)?($|\D)', normalized) or f'{stars}_star' in normalized:
                return stars
        aliases = {
            'very_poor': 1, 'very_poor_quality': 1, 'poor': 2, 'poor_quality': 2,
            'average': 3, 'average_quality': 3, 'good': 4, 'good_quality': 4,
            'premium': 5, 'premium_quality': 5, 'excellent': 5,
        }
        for alias, stars in aliases.items():
            if alias in normalized:
                return stars
        return None

    @staticmethod
    def _reasons(stars: int, metrics: VisualMetrics, confidence: float, visible_defects: list[str]) -> list[str]:
        reasons: list[str] = []
        if stars >= 4:
            reasons.append('The trained quality classifier placed this onion in a higher visual-grade category.')
        elif stars == 3:
            reasons.append('The trained quality classifier placed this onion in the middle visual-grade category.')
        else:
            reasons.append('The trained quality classifier found visual patterns associated with a lower grade.')
        if metrics.color_consistency < 55:
            reasons.append('Visible color variation is relatively high in this image crop.')
        if metrics.shape_regularity < 45:
            reasons.append('The detected outline is less regular; image background and crop quality can affect this measure.')
        if metrics.surface_uniformity < 50:
            reasons.append('Surface brightness varies across the crop; this is only a visual cue, not a direct defect diagnosis.')
        if visible_defects:
            reasons.append('The detector marked visible ' + ', '.join(sorted(set(visible_defects))) + '; check these areas during manual inspection.')
        if confidence < 0.6:
            reasons.append('Model confidence is limited. Retake the image in even light and review manually.')
        return reasons[:4]

    def analyze(self, image_bytes: list[bytes]) -> BatchAnalysisResponse:
        if not self.ready:
            raise ModelNotReady(self.load_error or 'Trained detector and classifier are not ready.')
        if not image_bytes or len(image_bytes) > settings.max_images_per_request:
            raise ImageRejected(f'Upload between 1 and {settings.max_images_per_request} images per request.')
        started = time.perf_counter()
        decoded = [self.decode_image(data) for data in image_bytes]
        assert self.detector is not None and self.classifier is not None
        detections = self.detector.predict(source=decoded, conf=settings.confidence_threshold, device=self.device, verbose=False, max_det=500)
        prepared: list[dict[str, Any]] = []
        results: list[dict[str, Any]] = []
        for image_index, (image, detections_result) in enumerate(zip(decoded, detections)):
            image_h, image_w = image.shape[:2]
            onion_boxes: list[dict[str, Any]] = []
            defect_boxes: list[dict[str, Any]] = []
            class_names = [str(v).lower() for v in detections_result.names.values()]
            defect_model_available = any(any(k in name for k in ['rot', 'disease', 'damage', 'defect', 'bruise']) for name in class_names)
            if detections_result.boxes is not None:
                for box in detections_result.boxes:
                    class_id = int(box.cls[0].item())
                    name = str(detections_result.names.get(class_id, class_id)).lower().replace('-', '_').replace(' ', '_')
                    x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(image_w, x2), min(image_h, y2)
                    if x2 - x1 < 4 or y2 - y1 < 4:
                        continue
                    detection = {'box': [x1, y1, x2, y2], 'name': name, 'confidence': float(box.conf[0].item())}
                    if 'onion' in name or len(detections_result.names) == 1:
                        if x2-x1 >= 12 and y2-y1 >= 12: onion_boxes.append(detection)
                    elif any(k in name for k in ['rot', 'disease', 'damage', 'defect', 'bruise', 'spot']):
                        defect_boxes.append(detection)
            items: list[dict[str, Any]] = []
            for onion in onion_boxes:
                x1, y1, x2, y2 = onion['box']
                crop = image[y1:y2, x1:x2]
                matched: list[str] = []
                for defect in defect_boxes:
                    dx1, dy1, dx2, dy2 = defect['box']
                    cx, cy = (dx1 + dx2) / 2, (dy1 + dy2) / 2
                    if x1 <= cx <= x2 and y1 <= cy <= y2:
                        matched.append(defect['name'].replace('_', ' '))
                items.append({'box': onion['box'], 'crop': crop, 'visible_defects': matched,
                              'metrics': self._metric_values(crop, len(matched) if defect_model_available else None)})
            prepared.extend({'image_index': image_index, 'image_shape': (image_w, image_h), **item} for item in items)
            results.append({'image_index': image_index, 'items': items, 'predictions': []})

        if prepared:
            crops = [item['crop'] for item in prepared]
            classified = self.classifier.predict(source=crops, imgsz=224, device=self.device, verbose=False)
            for item, class_result in zip(prepared, classified):
                probs = class_result.probs
                top_idx = int(probs.top1)
                class_name = str(class_result.names.get(top_idx, top_idx))
                stars = self._star_class(class_name)
                if stars is None:
                    raise ModelNotReady(f"Classifier class '{class_name}' is not a supported 1_star..5_star label.")
                confidence = float(probs.top1conf.item())
                x1, y1, x2, y2 = item['box']
                image_w, image_h = item['image_shape']
                m: VisualMetrics = item['metrics']
                prediction = OnionPrediction(
                    onion_index=0,
                    bbox=BoundingBox(x=round(x1 / image_w, 6), y=round(y1 / image_h, 6), width=round((x2-x1) / image_w, 6), height=round((y2-y1) / image_h, 6)),
                    quality_stars=stars, quality_label=LABELS[stars], confidence=round(confidence, 5),
                    visual_metrics=m, reasons=self._reasons(stars, m, confidence, item['visible_defects']), visible_defects=item['visible_defects']
                )
                results[item['image_index']]['predictions'].append(prediction)

        image_analyses: list[ImageAnalysis] = []
        for result in results:
            predictions = result['predictions']
            for index, prediction in enumerate(predictions, start=1): prediction.onion_index = index
            image_analyses.append(ImageAnalysis(image_index=result['image_index'], detected_onions=len(predictions), predictions=predictions))
        elapsed = int((time.perf_counter() - started) * 1000)
        return BatchAnalysisResponse(
            model_version=settings.model_version, device=self.device, processing_ms=elapsed,
            total_images=len(image_bytes), total_onions=sum(x.detected_onions for x in image_analyses),
            images=image_analyses, disclaimer=DISCLAIMER
        )

inference = OnionInference()
