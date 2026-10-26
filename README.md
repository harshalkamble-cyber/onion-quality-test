# Trained model weights

Place the **validated, project-trained** weights here before you run a real scan:

- `onion-detector.pt`: an Ultralytics YOLO object-detection model trained to detect whole onion bulbs. Prefer a single class named `onion`.
- `onion-quality-classifier.pt`: an Ultralytics image-classification model with exactly five grade classes. Supported names include `1_star`, `2_star`, `3_star`, `4_star`, and `5_star` (or documented aliases in `apps/ai/app/inference.py`).

Weights are intentionally not included. Generic public weights cannot grade onion quality accurately, and claiming otherwise would turn the dashboard into a confidence trick with vegetable-themed CSS. Train and validate using a licensed, representative, human-labelled onion dataset first. See `docs/model-card.md`.
