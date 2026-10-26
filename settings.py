from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='../.env', case_sensitive=False, extra='ignore')
    environment: str = 'development'
    service_token: str = Field(default='replace-this-ai-service-token-with-32-characters', validation_alias=AliasChoices('AI_SERVICE_TOKEN', 'SERVICE_TOKEN'))
    detector_weights_path: str = '/models/onion-detector.pt'
    classifier_weights_path: str = '/models/onion-quality-classifier.pt'
    model_version: str = 'onion-quality-v1'
    device: str = 'auto'
    confidence_threshold: float = 0.25
    max_upload_bytes: int = 15 * 1024 * 1024
    max_images_per_request: int = 30
    max_image_side: int = 4096
    max_pixels: int = 20_000_000
    inference_timeout_seconds: float = 25.0

settings = Settings()
