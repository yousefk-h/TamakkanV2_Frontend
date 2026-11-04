# **AI Speaking & Submissions Platform** 

Detailed 7-Day Architecture & Execution Plan 

**Framework:** Python FastAPI (Async) 

**Voice AI:** Gemini Live API ("Maya") **Deployment:** Docker on Hostinger 

## **1. Executive Summary & System Architecture** 

This document details the production-ready execution plan for delivering the AI Speaking & Submissions Platform within a 7-day sprint cycle. The platform supports two main student interactions: asynchronous audio/video task submissions and real-time bidirectional AI voice practice ("Discuss with Maya"). 

### **System Architecture Topology** 



<!-- Start of picture text -->
                                ┌──────────────────────────────────────────┐<br>                                │          FastAPI Backend (Docker)        │<br>                                └────┬───────────────┬───────────────┬─────┘<br>                                     │               │               │<br>             ┌───────────────────────▼┐   ┌──────────▼────────┐   ┌──▼────────────────┐<br>             │  Gemini Live WebSocket │   │ Practice Audio    │   │ YouTube Ingest    │<br>             │   (Voice Agent "Maya") │   │ & Friday Video    │   │ & Teacher Review  │<br>             └────────────────────────┘   └───────────────────┘   └───────────────────┘<br><!-- End of picture text -->

#### **Core Strategy:** 

- **Media Uploads:** Large media files are handled using Cloudinary's <mark>`upload_large()`</mark> with 6MB chunking to comply with Hostinger container memory limits. 

- **Real-time Voice:** Gemini Live API provides bidirectional WebSocket streaming for low-latency conversations. 

- 

- **Transcription:** Captions are fetched via <mark>`youtube-transcript-api` ,</mark> with Gemini Multimodal Audio transcription as an automatic fallback. 

AI Speaking & Submissions Platform — Project Plan 

Page 1 of 7 

## **2. Technical Stack & Infrastructure** 

|**Component**|**Technology / Library**|**Purpose / Implementation Detail**|
|---|---|---|
|**Backend**<br>**Framework**|Python 3.11+, FastAPI, Uvicorn|High-performance async API server, WebSockets, and<br>background tasks.|
|**Database & ODM**|MongoDB, Beanie ODM, Pydantic v2|Asynchronous MongoDB document mapping and strict payload<br>validation.|
|**Real-Time Voice AI**|Gemini Live API(<br>`google-genai`<br>SDK)|Low-latency bidirectional voice sessions with the "Maya" AI<br>persona.|
|**Transcription**<br>**Engine**|`youtube-transcript-api` +<br>Gemini API|Fast caption retrieval +<br>`gemini-2.5-flash` audio fle<br>fallback.|
|**Media Hosting**|Cloudinary Python SDK|Chunked media uploads (6MB chunks) preventing memory<br>spikes.|
|**Video Ingestion**|`yt-dlp`|Programmatic extraction of video/audio streams from YouTube<br>links.|
|**Deployment Target**|Docker on Hostinger (PaaS/VPS)|Multi-stage container deployment with system-level<br>`ffmpeg` .|



## **3. Database Schema Blueprint (Beanie ODM)** 

All database access is managed asynchronously via Beanie ODM models using MongoDB. 

### **3.1 User Model (** **<mark>`app/models/user.py` )</mark>** 

```
from enum import Enum
from beanie import Document
from pydantic import EmailStr
```

```
class Role(str, Enum):
    STUDENT = "student"
    ADMIN = "administrator"
```

```
class User(Document):
    email: EmailStr
    password_hash: str
    role: Role = Role.STUDENT
    full_name: str
```

```
    class Settings:
        name = "users"
```

AI Speaking & Submissions Platform — Project Plan 

Page 2 of 7 

**3.2 Recording Submission Model (** **<mark>`app/models/submission.py` )</mark>** 

```
from enum import Enum
from datetime import datetime
from beanie import Document, Link
from app.models.user import User
```

```
class SubmissionKind(str, Enum):
    AUDIO_TASK = "audio_task"
    FRIDAY_VIDEO = "friday_video"
```

```
class RecordingState(str, Enum):
    IDLE = "idle"
    REQUESTING_PERMISSION = "requesting_permission"
    RECORDING = "recording"
    RECORDED = "recorded"
    SUBMITTED = "submitted"
```

```
class RecordingSubmission(Document):
    student: Link[User]
    kind: SubmissionKind
    label: str  # e.g., "Task 3" or "Week 2 Friday Check-in"
    state: RecordingState = RecordingState.SUBMITTED
    media_url: str
    duration_seconds: float
    reviewed: bool = False
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
```

```
    class Settings:
        name = "recording_submissions"
```

AI Speaking & Submissions Platform — Project Plan 

Page 3 of 7 

### **3.3 Course Video Context Model** **<mark>(</mark>** **<mark>`app/models/video_context.py` )</mark>** 

```
from enum import Enum
from typing import List, Optional
from datetime import datetime
from beanie import Document, Field
```

```
class MediaState(str, Enum):
    QUEUED = "queued"
    FETCHING_YOUTUBE = "fetching_youtube"
    UPLOADING_CLOUDINARY = "uploading_cloudinary"
    READY = "ready"
    FAILED = "failed"
```

```
class TranscriptState(str, Enum):
    QUEUED = "queued"
    EXTRACTING = "extracting"
    PENDING_REVIEW = "pending_review"
    APPROVED_FOR_AI = "approved_for_ai"
```

```
class TranscriptSegment(dict):
```

```
    text: str
    start: float
    duration: float
```

```
class CourseVideoContext(Document):
```

```
    youtube_url: str
    youtube_id: str
    title: str
    cloudinary_url: Optional[str] = None
    media_state: MediaState = MediaState.QUEUED
    transcript_state: TranscriptState = TranscriptState.QUEUED
    raw_transcript: List[TranscriptSegment] = []
```

```
    approved_transcript: Optional[str] = None  # Context injected into Gemini Live
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

```
    class Settings:
        name = "course_video_contexts"
```

AI Speaking & Submissions Platform — Project Plan 

Page 4 of 7 

### **3.4 Live Session Model (** **<mark>`app/models/live_session.py` )</mark>** 

```
from enum import Enum
from typing import List, Optional
from datetime import datetime
from beanie import Document, Link, Field
from app.models.user import User
from app.models.video_context import CourseVideoContext
```

```
class SessionState(str, Enum):
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ENDED = "ended"
    FAILED = "failed"
```

```
class InteractionTurn(dict):
    speaker: str  # "user" or "maya"
    text: str
    timestamp: datetime
```

```
class LiveSession(Document):
    student: Link[User]
    video_context: Optional[Link[CourseVideoContext]] = None
    session_id: str
    state: SessionState = SessionState.CONNECTING
    transcript_history: List[InteractionTurn] = []
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    class Settings:
        name = "live_sessions"
```

## **4. Pipeline Workflows & Gemini Integrations** 

### **4.1 YouTube Ingestion & Teacher Review Pipeline** 



<!-- Start of picture text -->
1. Admin Posts YT Link ──► 2. Background Task (yt-dlp) ──► 3. Upload to Cloudinary (Chunked)<br>                                   │<br>                                   ├──► 4. Captions via youtube-transcript-api<br>                                   │            │ (Fallback: Gemini Audio Transcription)<br>                                   │            ▼<br>                                   │    [PENDING_REVIEW]<br>                                   │            │<br>                                   │     5. Teacher Reviews & Approves<br>                                   │            │<br>                                   ▼            ▼<br>                            [Media READY]  [APPROVED_FOR_AI]<br>                                   │            │<br>                                   └─────┬──────┘<br>                                         ▼<br>                               6. Injected into Gemini Live System Prompt<br><!-- End of picture text -->

### **4.2 Gemini Audio Transcription Fallback Service** 

When YouTube captions are disabled or missing, audio is extracted locally and sent to the Gemini File API for verbatim transcription: 

AI Speaking & Submissions Platform — Project Plan 

Page 5 of 7 

```
import os
from google import genai
```

```
def transcribe_audio_with_gemini(audio_path: str) -> str:
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
```

```
    # Upload temporary audio file to Gemini File API
    audio_file = client.files.upload(file=audio_path)
```

```
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            audio_file,
```

```
            "Provide an accurate, verbatim transcript of this educational video audio."
        ]
    )
```

```
    # Clean up file reference
    client.files.delete(name=audio_file.name)
    return response.text
```

## **5. Detailed 7-Day Implementation Roadmap** 

- **✓ Day 1: Auth, Schemas & Base API Setup** 

Initialize FastAPI project structure, MongoDB Beanie ODM connection, JWT auth endpoints, and user role guards. 

### **✓** 

### **Day 2: Gemini Live Voice Session Engine** 

- Build WebSocket bridge connecting client browsers with Gemini Live API (`BidiGenerateContent`), managing real-time audio streams. 

### **✓ Day 3: Cloudinary & Asynchronous Submissions** 

Build audio/video submission routes using `upload_large()` chunking, enforcing submission constraints. 

### **✓ Day 4: YouTube Ingestion & Gemini Transcription Fallback** 

Implement background workers for `yt-dlp` media fetching, `youtube-transcript-api` extraction, and Gemini transcription fallback. 

### **✓ Day 5: Teacher Review Dashboard API & Metrics** 

Build `GET /pending`, `PUT /{id}/approve` endpoints, and teacher review queues to verify context before AI injection. 

### **✓ Day 6: System Integration & Error Guardrails** 

Wire approved transcripts into Gemini Live prompts, handle WebSocket disconnects, and ensure automatic disk cleanup in `/tmp/`. 

### **✓** 

### **Day 7: Dockerization & Hostinger Deployment** 

Write multi-stage Dockerfile with system `ffmpeg`, configure production environment variables, and deploy to Hostinger. 

## **6. Claude Code Desktop Configuration** 

### **6.1 MCP Server Configuration** **<mark>(</mark>** **<mark>`claude_desktop_config.json` )</mark>** 

```
{
  "mcpServers": {
    "gemini-docs": {
      "command": "uvx",
      "args": ["mcp-server-fetch-python"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

AI Speaking & Submissions Platform — Project Plan 

Page 6 of 7 

### **6.2 Recommended Community Skills** 

- 

- 

- 

- 

- <mark>`jezweb/fastapi` :</mark> Verified FastAPI router patterns and Pydantic v2 schemas. 

- <mark>`husniadil/fastmcp-builder` :</mark> FastMCP skills for exposing endpoints to AI assistants. 

- <mark>`yuntou/docker-pkg-install-skill` :</mark> Managing system dependencies (e.g. <mark>`ffmpeg` )</mark> inside Docker. 

- <mark>`SpillwaveSolutions/document-specialist-skill` :</mark> Auto-generating documentation and API specs. 

## **7. Docker & Hosting Blueprint** 

### **7.1** **<mark>`Dockerfile`</mark>** 

```
FROM python:3.11-slim
```

```
RUN apt-get update && apt-get install -y --no-install-recommends     ffmpeg     curl     && rm -
rf /var/lib/apt/lists/*
```

```
WORKDIR /app
```

```
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```

```
COPY . .
```

```
EXPOSE 8000
```

```
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### **7.2** **<mark>`requirements.txt`</mark>** 

```
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
beanie>=1.25.0
motor>=3.3.0
pydantic>=2.6.0
pydantic-settings>=2.2.0
google-genai>=0.1.0
cloudinary>=1.39.0
yt-dlp>=2024.3.10
youtube-transcript-api>=0.6.2
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.9
httpx>=0.27.0
```

## **8. Post-Alpha Migration Plan (Cloudinary → Cloudflare R2)** 

#### **Post-Launch Storage Optimization:** 

To avoid Cloudinary bandwidth credit overages after launch, the storage layer will be transitioned to **Cloudflare R2** (S3compatible, zero egress fees). The backend will generate S3 pre-signed URLs for browser-direct uploads, bypassing Hostinger server memory entirely. 

AI Speaking & Submissions Platform — Project Plan 

Page 7 of 7 

