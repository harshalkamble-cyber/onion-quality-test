# Model card: Onion Quality Rating

## Intended use

Produce an **AI-assisted visual quality category** for individual onion bulbs visible in uploaded images. The UI displays one to five stars, confidence, image-derived indicators and visible-defect flags when available. The system is intended to support a farmer's review and negotiation preparation, not replace trained inspection, official grading, lab testing, food-safety decisions or statutory market rules.

## Model components

1. **Detector** (`onion-detector.pt`): Ultralytics YOLO object-detection model. It must detect onion bulbs at the required camera distances and overlaps. For independent visible-defect flags, train named detector classes such as `onion`, `rot`, `disease_spot`, `physical_damage`, `skin_defect` and/or `bruise`. Detection confidence and class names are persisted as part of the inference service behavior.
2. **Quality classifier** (`onion-quality-classifier.pt`): Ultralytics YOLO classification model trained on crops of individual onions. Class names must map to exactly the intended 1–5-star rubric, e.g. `1_star`, `2_star`, `3_star`, `4_star`, `5_star`. The current service rejects unrecognized labels rather than silently converting them.
3. **Visual descriptors**: OpenCV-derived color consistency, contour circularity/shape regularity, surface brightness uniformity and (when defect classes exist) a simple visible-defect cue. These values are explanatory image descriptors; they are not measured freshness, internal rot, moisture, disease diagnosis, chemical safety or harvest maturity.

## Training data requirements

The repository does not include onion images, a grading standard or trained weights. Before deployment, the dataset owner must document data licensing, consent, collection regions, onion varieties, harvest season, capture devices, camera distance, lighting, background, lot/farm provenance, label definitions and annotator agreement.

Suggested organization:

```text
classification-dataset/
├── train/
│   ├── 1_star/
│   ├── 2_star/
│   ├── 3_star/
│   ├── 4_star/
│   └── 5_star/
└── val/                  # Separate farms/lots/sessions from train
    ├── 1_star/
    ├── 2_star/
    ├── 3_star/
    ├── 4_star/
    └── 5_star/
```

The detector dataset is an Ultralytics YOLO detection dataset with a `data.yaml` and one row per labelled onion/visible defect. Use a defined grading rubric with photographs at every grade boundary. A sample should be reviewed by multiple trained graders; resolve disagreements before training.

## Training commands

```bash
# Detector dataset YAML must point to train/val image splits and define names.
python apps/ai/train.py detector \
  --data /datasets/onion-detection/data.yaml \
  --base yolov8n.pt --epochs 100 --imgsz 640 --device 0

python apps/ai/train.py classifier \
  --data /datasets/onion-quality-classes \
  --base yolov8n-cls.pt --epochs 80 --imgsz 224 --device 0
```

The generated `best.pt` files should be copied to `models/onion-detector.pt` and `models/onion-quality-classifier.pt` only after testing. Record checksums and the dataset version in the model registry. The training helper saves artifacts but does not certify them.

## Validation protocol (required before release)

- Hold out entire farms/lots/capture sessions from training and validation. Maintain a final locked test set never used for hyperparameter selection.
- Report detector precision, recall, mAP50 and mAP50-95; missed-onion rate; defect-class precision/recall; per-grade classifier precision/recall/F1; confusion matrix; macro-F1; calibration and abstention behavior.
- Evaluate performance separately for onion variety, district/season, smartphone quality, lighting, background, dry/wet skin, pile density, distance, and different grades. Investigate any grade with weak recall.
- Test duplicate/near-duplicate leakage, motion blur, small objects, glare, shadows, mixed lots, damaged camera lenses and non-onion objects.
- Compare ratings with a reference panel of trained graders and an agreed grading standard. Document annotator disagreement and known limits.
- Have a domain expert approve the exact model artifact, training-data version, thresholds and rubric. Deploy by immutable artifact digest and retain rollback weights.

## Suggested release gates

These are proposed project gates, not achieved metrics. Tune with domain experts before relying on them:

- Detector recall at least 95% on representative holdout images, with a separate missed-bulb evaluation for crowded scenes.
- Macro-F1 at least 0.85 for the five-grade classifier and per-grade recall at least 0.80; review confusion specifically at adjacent-grade boundaries.
- Expected calibration error no greater than 0.08 or another pre-agreed threshold, and low-confidence predictions clearly flagged for manual review.
- No meaningful subgroup disparity left unexplained; publish the evaluation summary and known failure modes.
- p95 image-level inference under two seconds on the actual selected target hardware at the tested concurrency, with a separate large-batch benchmark.

## Confidence and explanation behavior

`confidence` is the top class probability from the deployed classifier. Do not present it as a calibrated probability until calibration has been evaluated. The current service adds reasons about the classifier's visual grade, CV descriptors, defect-detector flags and low confidence. It does not use an LLM to invent explanations.

A low-confidence or low-quality photo should prompt recapture/manual review. In a production deployment, consider an explicit `needs_review` state and an uncertainty threshold derived from held-out data. If no onions are detected, do not fabricate an average grade.

## Known limitations

- Single RGB photos cannot reliably infer internal quality, hidden rot, residues, moisture, shelf life or many disease conditions.
- Strong lighting, background, scale, overlapping bulbs and atypical varieties may change model behavior.
- Training data that does not represent Maharashtra and other target regions will not justify broad India-wide claims.
- A model score is not a guaranteed official grade or a price recommendation. No price prediction is implemented.
- The metrics named “color consistency”, “shape regularity” and “surface uniformity” are heuristic descriptors derived from image pixels. They can be affected by the background and crop boundaries and must be displayed as cues rather than independent quality percentages.

## Model governance

Keep model weights versioned and immutable; log model version on each scan; review a labelled production sample periodically; track drift, confidence, per-grade distributions and farmer feedback; require human approval for release; retain the previous known-good model for rollback; and document a rollback plan. Never retrain directly on farmer uploads without review and consent.
