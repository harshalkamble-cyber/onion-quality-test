"""Train the object detector and 5-class quality classifier using a reviewed, licensed dataset.

Usage:
  python train.py detector --data /data/onion-detection.yaml --base yolov8n.pt --epochs 100
  python train.py classifier --data /data/onion-quality-classes --base yolov8n-cls.pt --epochs 80

Classifier dataset folder must contain train/{1_star,2_star,3_star,4_star,5_star} and
val/{1_star,2_star,3_star,4_star,5_star}. Detector dataset should use one class named 'onion'.
Never train or deploy on synthetic examples alone. Split by farm/lot/session to avoid leakage.
"""
import argparse
from pathlib import Path
from ultralytics import YOLO

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('task', choices=['detector','classifier'])
    parser.add_argument('--data', required=True)
    parser.add_argument('--base', default=None)
    parser.add_argument('--epochs', type=int, default=100)
    parser.add_argument('--imgsz', type=int, default=640)
    parser.add_argument('--device', default='0')
    parser.add_argument('--project', default='runs/onion-quality')
    args = parser.parse_args()
    default_base = 'yolov8n.pt' if args.task == 'detector' else 'yolov8n-cls.pt'
    model = YOLO(args.base or default_base)
    output = model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz if args.task == 'detector' else 224,
                         device=args.device, project=args.project, name=args.task, patience=20, cache=False,
                         seed=42, deterministic=True, workers=4)
    best = Path(output.save_dir) / 'weights' / 'best.pt'
    print(f'Best weights: {best}')
    print('Record dataset version, label policy, validation metrics, confusion matrix, per-grade recall, calibration, and model hash before release.')

if __name__ == '__main__': main()
