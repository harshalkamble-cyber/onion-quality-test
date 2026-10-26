from __future__ import annotations
import hmac
import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from .settings import settings
from .inference import inference, ModelNotReady, ImageRejected
from .schemas import HealthResponse, BatchAnalysisResponse

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
ai_requests = Counter('ai_inference_requests_total', 'Inference calls to the onion quality service', ['status'])
ai_duration = Histogram('ai_inference_duration_seconds', 'End-to-end inference duration in seconds', buckets=(0.05,0.1,0.25,0.5,1,2,5,10,20,60))
logger = logging.getLogger('onion-ai')

@asynccontextmanager
async def lifespan(_: FastAPI):
    inference.load()
    if inference.ready:
        logger.info('model_ready version=%s device=%s', settings.model_version, inference.device)
    else:
        logger.error('model_not_ready missing=%s detail=%s', inference.missing_models, inference.load_error)
    yield

app = FastAPI(title='Onion Quality AI Service', version='1.0.0', description='Private inference service for onion object detection and quality classification.', lifespan=lifespan, docs_url='/docs' if settings.environment != 'production' else None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=[], allow_credentials=False, allow_methods=['GET','POST'], allow_headers=['content-type','x-ai-service-token'])

@app.middleware('http')
async def request_log(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = int((time.perf_counter() - start) * 1000)
    logger.info('request method=%s path=%s status=%d elapsed_ms=%d', request.method, request.url.path, response.status_code, elapsed)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/health/live')
def live():
    return {'status': 'ok'}

@app.get('/health/ready', response_model=HealthResponse)
def ready():
    return HealthResponse(status='ready' if inference.ready else 'not_ready', model_ready=inference.ready, model_version=settings.model_version, device=inference.device, missing_models=inference.missing_models)

@app.post('/v1/analyze', response_model=BatchAnalysisResponse)
async def analyze(
    files: Annotated[list[UploadFile], File(description='One or more JPEG, PNG, or WebP images')],
    x_ai_service_token: Annotated[str | None, Header()] = None,
):
    if not x_ai_service_token or not hmac.compare_digest(x_ai_service_token, settings.service_token):
        raise HTTPException(status_code=401, detail='Invalid service credentials.')
    if not inference.ready:
        raise HTTPException(status_code=503, detail={'code':'MODEL_NOT_READY','message':'Trained detector and quality classifier weights are not installed. See the model training guide.','missing_models':inference.missing_models})
    if not files or len(files) > settings.max_images_per_request:
        raise HTTPException(status_code=413, detail=f'Upload between 1 and {settings.max_images_per_request} images.')
    payload: list[bytes] = []
    for file in files:
        if file.content_type not in {'image/jpeg','image/png','image/webp'}:
            raise HTTPException(status_code=415, detail=f'Unsupported content type for {file.filename}.')
        data = await file.read(settings.max_upload_bytes + 1)
        if not data or len(data) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail=f'File {file.filename} is empty or too large.')
        payload.append(data)
    try:
        # Ultralytics prediction is CPU/GPU-bound. Run it off the event loop so health and other requests remain responsive.
        import anyio
        with ai_duration.time():
            result = await anyio.to_thread.run_sync(inference.analyze, payload)
        ai_requests.labels(status='success').inc()
        return result
    except ImageRejected as exc:
        ai_requests.labels(status='rejected').inc()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ModelNotReady as exc:
        ai_requests.labels(status='not_ready').inc()
        raise HTTPException(status_code=503, detail={'code':'MODEL_NOT_READY','message':str(exc)}) from exc
    except Exception as exc:
        ai_requests.labels(status='error').inc()
        logger.exception('inference_failed type=%s', type(exc).__name__)
        raise HTTPException(status_code=500, detail={'code':'INFERENCE_FAILED','message':'Inference failed. Check service logs.'}) from exc

@app.exception_handler(Exception)
async def uncaught_error(_: Request, exc: Exception):
    logger.exception('unhandled_exception type=%s', type(exc).__name__)
    return JSONResponse(status_code=500, content={'detail':'Internal AI service error.'})

# Prometheus metrics endpoint is reachable only on the internal service network.
@app.get('/metrics', include_in_schema=False)
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
