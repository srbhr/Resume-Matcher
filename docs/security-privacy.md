# Security and Privacy Architecture

## Overview

Resume Matcher is built with a privacy-first architecture that prioritizes user data protection and security. All sensitive resume and job description data is processed locally, never transmitted to external services, ensuring complete privacy and compliance with data protection regulations.

## Privacy-First Design Principles

### Core Privacy Commitments

```python
# core/privacy_policy.py
class PrivacyPrinciples:
    """
    Codified privacy principles that guide all architectural decisions
    """
    
    PRINCIPLES = {
        "local_processing": {
            "description": "All AI processing happens locally on user's machine",
            "implementation": "Ollama for local AI inference, no cloud API calls for sensitive data",
            "guarantee": "Resume content never leaves user's device"
        },
        "data_minimization": {
            "description": "Collect and store only necessary data for functionality",
            "implementation": "No user accounts, no tracking, minimal metadata collection",
            "guarantee": "Zero unnecessary data collection"
        },
        "transparent_storage": {
            "description": "All data storage is local and user-controlled",
            "implementation": "SQLite database in user's local directory",
            "guarantee": "Users have full control over their data"
        },
        "no_telemetry": {
            "description": "No usage tracking or analytics data collection",
            "implementation": "No external analytics services, no crash reporting to external services",
            "guarantee": "No behavioral data collected or transmitted"
        },
        "open_source_transparency": {
            "description": "All code is open source and auditable",
            "implementation": "MIT license, full source code availability",
            "guarantee": "No hidden data collection or processing"
        }
    }
    
    @classmethod
    def validate_compliance(cls, operation: str, data_types: list) -> bool:
        """
        Validates that an operation complies with privacy principles
        """
        # Check if operation involves external data transmission
        if "external_api" in operation.lower() and any("resume" in dt or "personal" in dt for dt in data_types):
            logger.error(f"Privacy violation: {operation} would transmit sensitive data externally")
            return False
        
        # Check for unnecessary data collection
        unnecessary_data = ["ip_address", "device_fingerprint", "usage_analytics"]
        if any(dt in unnecessary_data for dt in data_types):
            logger.error(f"Privacy violation: {operation} would collect unnecessary data")
            return False
        
        return True

class DataClassification:
    """
    Classifies data types by sensitivity level
    """
    
    CLASSIFICATION = {
        "highly_sensitive": [
            "personal_name", "email_address", "phone_number", "home_address",
            "resume_content", "job_applications", "salary_information",
            "employment_history", "personal_projects"
        ],
        "sensitive": [
            "skills_data", "education_info", "job_preferences",
            "processed_resume_structure", "matching_scores"
        ],
        "internal": [
            "processing_metadata", "file_hashes", "processing_timestamps",
            "system_performance_metrics"
        ],
        "public": [
            "application_version", "supported_file_types", "general_help_content"
        ]
    }
    
    @classmethod
    def get_data_sensitivity(cls, data_type: str) -> str:
        """
        Returns sensitivity level for a given data type
        """
        for level, types in cls.CLASSIFICATION.items():
            if data_type in types:
                return level
        return "unknown"
    
    @classmethod
    def requires_local_processing(cls, data_type: str) -> bool:
        """
        Determines if data type must be processed locally
        """
        sensitivity = cls.get_data_sensitivity(data_type)
        return sensitivity in ["highly_sensitive", "sensitive"]
```

### Local-First Architecture

```python
# architecture/local_first.py
class LocalFirstArchitecture:
    """
    Ensures all sensitive operations happen locally
    """
    
    def __init__(self):
        self.local_services = {
            "ai_processing": "ollama",
            "document_parsing": "markitdown", 
            "database": "sqlite",
            "file_storage": "local_filesystem",
            "web_interface": "local_server"
        }
        
        self.blocked_external_services = [
            "openai_api_for_resumes",    # OpenAI only for non-sensitive operations
            "google_analytics",
            "crash_reporting_services",
            "usage_tracking",
            "cloud_storage_sync"
        ]
    
    def validate_service_call(self, service_name: str, data_classification: str) -> bool:
        """
        Validates that service calls comply with local-first principles
        """
        # Block external services for sensitive data
        if service_name in self.blocked_external_services:
            logger.error(f"Blocked external service call: {service_name}")
            return False
        
        # Require local processing for sensitive data
        if data_classification in ["highly_sensitive", "sensitive"]:
            if service_name not in self.local_services.values():
                logger.error(f"Sensitive data {data_classification} cannot use external service {service_name}")
                return False
        
        return True
    
    async def process_resume_locally(self, resume_content: str) -> dict:
        """
        Ensures resume processing happens entirely locally
        """
        # Validate that we're using local services
        if not self.validate_service_call("ollama", "highly_sensitive"):
            raise SecurityError("Cannot process resume: local AI service not available")
        
        # Use local AI processing
        ai_provider = await self._get_local_ai_provider()
        
        # Process without external network calls
        with NetworkBlocker():  # Context manager that blocks network access
            result = await ai_provider.extract_structured_data(resume_content)
        
        return result
    
    async def _get_local_ai_provider(self):
        """
        Returns verified local AI provider
        """
        from agent.providers.ollama import OllamaProvider
        
        provider = OllamaProvider()
        
        # Verify it's actually running locally
        if not await provider.verify_local_connection():
            raise SecurityError("AI provider is not running locally")
        
        return provider

class NetworkBlocker:
    """
    Context manager that blocks network access during sensitive operations
    """
    
    def __init__(self):
        self.original_socket = None
    
    def __enter__(self):
        # This is a conceptual implementation
        # In practice, you might use firewall rules or network namespaces
        logger.info("Network access blocked for sensitive operation")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        logger.info("Network access restored")
```

## Data Security Implementation

### Encryption at Rest

```python
# security/encryption.py
import cryptography
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os
import base64
from typing import Optional

class LocalDataEncryption:
    """
    Encrypts sensitive data stored locally using user-controlled keys
    """
    
    def __init__(self, password: Optional[str] = None):
        self.password = password
        self.key = self._derive_key() if password else None
        self.fernet = Fernet(self.key) if self.key else None
    
    def _derive_key(self) -> bytes:
        """
        Derives encryption key from user password using PBKDF2
        """
        # Use a consistent salt for the same user
        # In production, store this salt securely or derive from system info
        salt = b'resume_matcher_salt_2024'  # Should be unique per installation
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,  # Good balance of security and performance
        )
        
        key = base64.urlsafe_b64encode(kdf.derive(self.password.encode()))
        return key
    
    def encrypt_resume_data(self, resume_data: dict) -> bytes:
        """
        Encrypts resume data for secure local storage
        """
        if not self.fernet:
            # If no encryption key, store as plaintext (user choice)
            return json.dumps(resume_data).encode()
        
        try:
            plaintext = json.dumps(resume_data).encode()
            encrypted_data = self.fernet.encrypt(plaintext)
            
            logger.info("Resume data encrypted for local storage")
            return encrypted_data
            
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise SecurityError("Failed to encrypt sensitive data")
    
    def decrypt_resume_data(self, encrypted_data: bytes) -> dict:
        """
        Decrypts resume data from secure local storage
        """
        if not self.fernet:
            # If no encryption key, assume plaintext
            return json.loads(encrypted_data.decode())
        
        try:
            decrypted_data = self.fernet.decrypt(encrypted_data)
            resume_data = json.loads(decrypted_data.decode())
            
            logger.debug("Resume data decrypted successfully")
            return resume_data
            
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise SecurityError("Failed to decrypt data - incorrect password or corrupted data")
    
    def secure_delete_file(self, file_path: str):
        """
        Securely deletes a file by overwriting it multiple times
        """
        if not os.path.exists(file_path):
            return
        
        try:
            # Get file size
            file_size = os.path.getsize(file_path)
            
            # Overwrite with random data multiple times
            with open(file_path, 'r+b') as file:
                for _ in range(3):  # 3 passes of random data
                    file.seek(0)
                    file.write(os.urandom(file_size))
                    file.flush()
                    os.fsync(file.fileno())  # Force write to disk
            
            # Finally delete the file
            os.remove(file_path)
            logger.info(f"Securely deleted file: {file_path}")
            
        except Exception as e:
            logger.error(f"Secure file deletion failed: {e}")
            # Regular deletion as fallback
            try:
                os.remove(file_path)
            except:
                pass

class SecureDatabase:
    """
    Database wrapper with encryption for sensitive fields
    """
    
    def __init__(self, encryption: LocalDataEncryption):
        self.encryption = encryption
        self.sensitive_fields = [
            "personal_data", "experiences", "skills", "education",
            "projects", "achievements", "extracted_keywords"
        ]
    
    async def store_resume_securely(self, resume_data: dict) -> str:
        """
        Stores resume data with selective field encryption
        """
        encrypted_data = {}
        
        for field, value in resume_data.items():
            if field in self.sensitive_fields and value:
                # Encrypt sensitive fields
                encrypted_value = self.encryption.encrypt_resume_data({field: value})
                encrypted_data[field] = base64.b64encode(encrypted_value).decode()
                encrypted_data[f"{field}_encrypted"] = True
            else:
                # Store non-sensitive fields as plaintext
                encrypted_data[field] = value
                encrypted_data[f"{field}_encrypted"] = False
        
        # Store in database (implementation depends on your database layer)
        resume_id = await self._store_in_database(encrypted_data)
        
        logger.info(f"Resume stored securely with ID: {resume_id}")
        return resume_id
    
    async def retrieve_resume_securely(self, resume_id: str) -> dict:
        """
        Retrieves and decrypts resume data
        """
        # Retrieve from database
        encrypted_data = await self._retrieve_from_database(resume_id)
        
        decrypted_data = {}
        
        for field, value in encrypted_data.items():
            if field.endswith("_encrypted"):
                continue  # Skip encryption flags
            
            field_encrypted = encrypted_data.get(f"{field}_encrypted", False)
            
            if field_encrypted and value:
                # Decrypt sensitive field
                encrypted_bytes = base64.b64decode(value.encode())
                decrypted_field_data = self.encryption.decrypt_resume_data(encrypted_bytes)
                decrypted_data[field] = decrypted_field_data[field]
            else:
                # Use plaintext value
                decrypted_data[field] = value
        
        return decrypted_data
```

### Input Validation and Sanitization

```python
# security/input_validation.py
import re
import html
from typing import Any, Dict, List
import bleach

class InputValidator:
    """
    Validates and sanitizes all user inputs to prevent security vulnerabilities
    """
    
    def __init__(self):
        # Define allowed HTML tags for rich text (if any)
        self.allowed_html_tags = []  # No HTML allowed in resume processing
        
        # Define maximum lengths for different field types
        self.max_lengths = {
            "name": 100,
            "email": 254,  # RFC 5321 limit
            "phone": 20,
            "job_title": 200,
            "company": 200,
            "description": 5000,
            "skill_name": 100,
            "file_content": 10 * 1024 * 1024,  # 10MB
        }
        
        # Regex patterns for validation
        self.patterns = {
            "email": re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
            "phone": re.compile(r'^[\+]?[\d\s\-\(\)\.]{7,20}$'),
            "name": re.compile(r'^[a-zA-Z\s\-\.\']{1,100}$'),
            "safe_text": re.compile(r'^[a-zA-Z0-9\s\-\_\.\,\!\?\(\)\[\]\'\"]{1,}$')
        }
    
    def validate_resume_upload(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """
        Validates uploaded resume file for security and format compliance
        """
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "sanitized_filename": ""
        }
        
        # Validate file size
        if len(file_content) > self.max_lengths["file_content"]:
            validation_result["valid"] = False
            validation_result["errors"].append(
                f"File size ({len(file_content)} bytes) exceeds maximum allowed ({self.max_lengths['file_content']} bytes)"
            )
        
        # Validate and sanitize filename
        sanitized_filename = self.sanitize_filename(filename)
        if not sanitized_filename:
            validation_result["valid"] = False
            validation_result["errors"].append("Invalid filename")
        else:
            validation_result["sanitized_filename"] = sanitized_filename
        
        # Check file extension
        allowed_extensions = ['.pdf', '.docx', '.doc', '.txt']
        if not any(sanitized_filename.lower().endswith(ext) for ext in allowed_extensions):
            validation_result["valid"] = False
            validation_result["errors"].append(
                f"File type not allowed. Supported types: {', '.join(allowed_extensions)}"
            )
        
        # Check for potentially malicious content patterns
        malicious_patterns = [
            b'<script',  # JavaScript
            b'javascript:',  # JavaScript URLs
            b'vbscript:',  # VBScript
            b'data:text/html',  # Data URLs with HTML
            b'<?php',  # PHP code
            b'<%',  # ASP/JSP code
        ]
        
        content_lower = file_content[:1024].lower()  # Check first 1KB
        for pattern in malicious_patterns:
            if pattern in content_lower:
                validation_result["warnings"].append(
                    f"Potentially suspicious content detected: {pattern.decode('utf-8', errors='ignore')}"
                )
        
        return validation_result
    
    def sanitize_filename(self, filename: str) -> str:
        """
        Sanitizes filename to prevent directory traversal and other attacks
        """
        if not filename:
            return ""
        
        # Remove directory traversal attempts
        filename = os.path.basename(filename)
        
        # Remove or replace dangerous characters
        dangerous_chars = ['<', '>', ':', '"', '|', '?', '*', '\0']
        for char in dangerous_chars:
            filename = filename.replace(char, '_')
        
        # Limit length
        if len(filename) > 255:
            # Preserve extension
            name, ext = os.path.splitext(filename)
            max_name_length = 255 - len(ext)
            filename = name[:max_name_length] + ext
        
        # Ensure filename is not empty after sanitization
        if not filename or filename.startswith('.'):
            filename = f"document_{int(time.time())}.txt"
        
        return filename
    
    def validate_personal_data(self, personal_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates and sanitizes personal data from resume processing
        """
        validation_result = {
            "valid": True,
            "errors": [],
            "sanitized_data": {}
        }
        
        # Validate required fields
        required_fields = ["firstName", "lastName"]
        for field in required_fields:
            if field not in personal_data or not personal_data[field]:
                validation_result["errors"].append(f"Required field missing: {field}")
                validation_result["valid"] = False
        
        # Validate and sanitize each field
        field_validators = {
            "firstName": ("name", True),
            "lastName": ("name", True),
            "email": ("email", False),
            "phone": ("phone", False),
        }
        
        for field, (pattern_name, required) in field_validators.items():
            value = personal_data.get(field)
            
            if not value and required:
                continue  # Already handled in required fields check
            
            if value:
                sanitized_value = self.sanitize_text_field(value, pattern_name)
                if sanitized_value:
                    validation_result["sanitized_data"][field] = sanitized_value
                else:
                    validation_result["errors"].append(f"Invalid format for field: {field}")
                    if required:
                        validation_result["valid"] = False
        
        return validation_result
    
    def sanitize_text_field(self, value: str, pattern_name: str) -> str:
        """
        Sanitizes text field according to pattern and security requirements
        """
        if not isinstance(value, str):
            return ""
        
        # Basic sanitization
        value = value.strip()
        
        # HTML escape
        value = html.escape(value)
        
        # Remove any remaining HTML tags
        value = bleach.clean(value, tags=[], strip=True)
        
        # Check length limits
        field_type = pattern_name
        max_length = self.max_lengths.get(field_type, 1000)
        if len(value) > max_length:
            value = value[:max_length]
        
        # Validate against pattern
        pattern = self.patterns.get(pattern_name)
        if pattern and not pattern.match(value):
            logger.warning(f"Text field failed pattern validation: {pattern_name}")
            return ""  # Invalid format
        
        return value
    
    def validate_job_description(self, job_text: str) -> Dict[str, Any]:
        """
        Validates job description text for security issues
        """
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "sanitized_text": ""
        }
        
        if not job_text or not isinstance(job_text, str):
            validation_result["valid"] = False
            validation_result["errors"].append("Job description text is required")
            return validation_result
        
        # Check length
        if len(job_text) > 50000:  # 50KB limit
            validation_result["warnings"].append("Job description is very long, truncating...")
            job_text = job_text[:50000]
        
        # Sanitize HTML and potentially malicious content
        sanitized_text = bleach.clean(job_text, tags=[], strip=True)
        sanitized_text = html.escape(sanitized_text)
        
        # Check for suspicious patterns
        suspicious_patterns = [
            r'<script[^>]*>.*?</script>',
            r'javascript:',
            r'vbscript:',
            r'on\w+\s*=',  # Event handlers
            r'data:text/html',
        ]
        
        for pattern in suspicious_patterns:
            if re.search(pattern, sanitized_text, re.IGNORECASE):
                validation_result["warnings"].append(f"Suspicious content detected and removed: {pattern}")
        
        validation_result["sanitized_text"] = sanitized_text
        return validation_result

# Global input validator instance
input_validator = InputValidator()
```

### Security Headers and API Protection

```python
# security/api_protection.py
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import time
from collections import defaultdict, deque

class SecurityMiddleware:
    """
    Comprehensive security middleware for API protection
    """
    
    def __init__(self):
        # Rate limiting storage
        self.rate_limits = defaultdict(lambda: deque())
        
        # Request limits per IP
        self.limits = {
            "per_minute": 60,
            "per_hour": 1000,
            "upload_per_minute": 5
        }
        
        # Blocked IPs (for severe abuse)
        self.blocked_ips = set()
        
        # Security headers
        self.security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "connect-src 'self'; "
                "font-src 'self'; "
                "object-src 'none'; "
                "media-src 'self'; "
                "frame-src 'none';"
            )
        }
    
    async def __call__(self, request: Request, call_next):
        """
        Process request through security middleware
        """
        start_time = time.time()
        
        # Get client IP
        client_ip = self.get_client_ip(request)
        
        # Check if IP is blocked
        if client_ip in self.blocked_ips:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Apply rate limiting
        if not self.check_rate_limit(client_ip, request.url.path):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        
        # Process request
        response = await call_next(request)
        
        # Add security headers
        for header, value in self.security_headers.items():
            response.headers[header] = value
        
        # Add timing header (for monitoring)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(round(process_time, 4))
        
        return response
    
    def get_client_ip(self, request: Request) -> str:
        """
        Extracts client IP address from request
        """
        # Check for forwarded headers (if behind proxy)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Take the first IP (client IP)
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fall back to direct connection IP
        return request.client.host
    
    def check_rate_limit(self, client_ip: str, path: str) -> bool:
        """
        Checks if request is within rate limits
        """
        current_time = time.time()
        
        # Determine limit based on endpoint
        if "upload" in path:
            limit = self.limits["upload_per_minute"]
            window = 60  # 1 minute
        else:
            limit = self.limits["per_minute"]
            window = 60  # 1 minute
        
        # Clean old entries
        requests = self.rate_limits[client_ip]
        while requests and requests[0] < current_time - window:
            requests.popleft()
        
        # Check if limit exceeded
        if len(requests) >= limit:
            logger.warning(f"Rate limit exceeded for IP {client_ip} on path {path}")
            return False
        
        # Add current request
        requests.append(current_time)
        
        return True
    
    def block_ip(self, client_ip: str, reason: str):
        """
        Blocks an IP address
        """
        self.blocked_ips.add(client_ip)
        logger.warning(f"Blocked IP {client_ip}: {reason}")
    
    def unblock_ip(self, client_ip: str):
        """
        Unblocks an IP address
        """
        self.blocked_ips.discard(client_ip)
        logger.info(f"Unblocked IP {client_ip}")

def configure_security(app: FastAPI):
    """
    Configures comprehensive security for FastAPI application
    """
    # Add security middleware
    security_middleware = SecurityMiddleware()
    app.middleware("http")(security_middleware)
    
    # Configure CORS (restrict to localhost for local-first app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=False,  # No credentials needed for local app
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
        max_age=600  # 10 minutes
    )
    
    # Trusted host middleware (local development)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", "*.localhost"]
    )
    
    return app

# Request size limiting
class RequestSizeLimiter:
    """
    Limits request size to prevent memory exhaustion attacks
    """
    
    def __init__(self, max_size: int = 10 * 1024 * 1024):  # 10MB default
        self.max_size = max_size
    
    async def __call__(self, request: Request, call_next):
        """
        Check request size before processing
        """
        # Check Content-Length header
        content_length = request.headers.get("content-length")
        if content_length:
            content_length = int(content_length)
            if content_length > self.max_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"Request too large. Maximum size: {self.max_size} bytes"
                )
        
        return await call_next(request)
```

### Audit Logging and Security Monitoring

```python
# security/audit_logging.py
import logging
import json
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum

class SecurityEventType(Enum):
    """
    Types of security events to log
    """
    FILE_UPLOAD = "file_upload"
    DATA_ACCESS = "data_access"
    DATA_DELETION = "data_deletion"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    INVALID_INPUT = "invalid_input"
    AUTHENTICATION_ATTEMPT = "authentication_attempt"
    CONFIGURATION_CHANGE = "configuration_change"
    ERROR_OCCURRED = "error_occurred"

class SecurityAuditLogger:
    """
    Logs security-relevant events for monitoring and compliance
    """
    
    def __init__(self):
        # Configure security logger (separate from application logger)
        self.security_logger = logging.getLogger("security_audit")
        
        # Create file handler for security logs
        security_handler = logging.FileHandler("logs/security_audit.log")
        security_handler.setLevel(logging.INFO)
        
        # JSON formatter for structured logging
        formatter = logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": %(message)s}'
        )
        security_handler.setFormatter(formatter)
        
        self.security_logger.addHandler(security_handler)
        self.security_logger.setLevel(logging.INFO)
    
    def log_security_event(
        self,
        event_type: SecurityEventType,
        details: Dict[str, Any],
        client_ip: str = None,
        user_agent: str = None,
        success: bool = True,
        risk_level: str = "low"
    ):
        """
        Logs a security event with structured data
        """
        event_data = {
            "event_type": event_type.value,
            "timestamp": datetime.utcnow().isoformat(),
            "client_ip": client_ip,
            "user_agent": user_agent,
            "success": success,
            "risk_level": risk_level,
            "details": details
        }
        
        # Remove None values
        event_data = {k: v for k, v in event_data.items() if v is not None}
        
        # Log based on risk level
        if risk_level == "high":
            self.security_logger.error(json.dumps(event_data))
        elif risk_level == "medium":
            self.security_logger.warning(json.dumps(event_data))
        else:
            self.security_logger.info(json.dumps(event_data))
    
    def log_file_upload(self, filename: str, file_size: int, client_ip: str, success: bool = True):
        """
        Logs file upload events
        """
        self.log_security_event(
            SecurityEventType.FILE_UPLOAD,
            {
                "filename": filename,
                "file_size_bytes": file_size,
                "action": "upload"
            },
            client_ip=client_ip,
            success=success,
            risk_level="medium" if file_size > 5 * 1024 * 1024 else "low"  # Large files = medium risk
        )
    
    def log_data_access(self, resource_type: str, resource_id: str, operation: str, client_ip: str):
        """
        Logs data access events
        """
        self.log_security_event(
            SecurityEventType.DATA_ACCESS,
            {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "operation": operation
            },
            client_ip=client_ip,
            risk_level="low"
        )
    
    def log_rate_limit_exceeded(self, client_ip: str, endpoint: str, limit_type: str):
        """
        Logs rate limit violations
        """
        self.log_security_event(
            SecurityEventType.RATE_LIMIT_EXCEEDED,
            {
                "endpoint": endpoint,
                "limit_type": limit_type,
                "action": "blocked"
            },
            client_ip=client_ip,
            success=False,
            risk_level="medium"
        )
    
    def log_invalid_input(self, input_type: str, validation_errors: list, client_ip: str):
        """
        Logs invalid input attempts
        """
        self.log_security_event(
            SecurityEventType.INVALID_INPUT,
            {
                "input_type": input_type,
                "validation_errors": validation_errors,
                "error_count": len(validation_errors)
            },
            client_ip=client_ip,
            success=False,
            risk_level="high" if len(validation_errors) > 5 else "medium"
        )
    
    def log_data_deletion(self, resource_type: str, resource_id: str, client_ip: str):
        """
        Logs data deletion events
        """
        self.log_security_event(
            SecurityEventType.DATA_DELETION,
            {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "action": "delete"
            },
            client_ip=client_ip,
            risk_level="medium"
        )

# Global security audit logger
security_audit = SecurityAuditLogger()

# Usage in API endpoints
async def secure_file_upload_handler(request: Request, file: UploadFile):
    """
    Example of secure file upload with audit logging
    """
    client_ip = request.client.host
    
    try:
        # Validate file
        validation_result = input_validator.validate_resume_upload(
            await file.read(),
            file.filename
        )
        
        if not validation_result["valid"]:
            # Log invalid input attempt
            security_audit.log_invalid_input(
                "file_upload",
                validation_result["errors"],
                client_ip
            )
            
            raise HTTPException(
                status_code=400,
                detail={"errors": validation_result["errors"]}
            )
        
        # Process file
        # ... (processing logic)
        
        # Log successful upload
        security_audit.log_file_upload(
            file.filename,
            file.size,
            client_ip,
            success=True
        )
        
        return {"message": "File uploaded successfully"}
        
    except Exception as e:
        # Log failed upload
        security_audit.log_file_upload(
            file.filename,
            file.size if hasattr(file, 'size') else 0,
            client_ip,
            success=False
        )
        
        raise
```

### Secure Configuration Management

```python
# security/secure_config.py
import os
from pathlib import Path
from cryptography.fernet import Fernet
import json
from typing import Dict, Any, Optional

class SecureConfigManager:
    """
    Manages application configuration with security best practices
    """
    
    def __init__(self, config_dir: Path = None):
        self.config_dir = config_dir or Path.home() / ".resume_matcher"
        self.config_dir.mkdir(exist_ok=True, mode=0o700)  # Owner only access
        
        self.config_file = self.config_dir / "config.json"
        self.secure_config_file = self.config_dir / "secure_config.encrypted"
        
        # Default secure configuration
        self.default_config = {
            "security": {
                "encryption_enabled": True,
                "secure_deletion": True,
                "audit_logging": True,
                "rate_limiting": True
            },
            "privacy": {
                "local_processing_only": True,
                "no_telemetry": True,
                "data_retention_days": 30
            },
            "performance": {
                "max_concurrent_jobs": 5,
                "file_size_limit_mb": 10,
                "processing_timeout_seconds": 300
            }
        }
    
    def initialize_secure_config(self, user_password: Optional[str] = None) -> Dict[str, Any]:
        """
        Initializes secure configuration with user preferences
        """
        config = self.default_config.copy()
        
        # Load existing configuration if available
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    existing_config = json.load(f)
                    config.update(existing_config)
            except Exception as e:
                logger.warning(f"Failed to load existing configuration: {e}")
        
        # Save configuration with secure permissions
        self.save_config(config)
        
        logger.info("Secure configuration initialized")
        return config
    
    def save_config(self, config: Dict[str, Any]):
        """
        Saves configuration with secure file permissions
        """
        try:
            # Save to regular config file
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
            
            # Set secure file permissions (owner only)
            os.chmod(self.config_file, 0o600)
            
            logger.info("Configuration saved securely")
            
        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
            raise
    
    def get_config_value(self, key_path: str, default: Any = None) -> Any:
        """
        Gets configuration value using dot notation (e.g., 'security.encryption_enabled')
        """
        config = self.load_config()
        
        keys = key_path.split('.')
        value = config
        
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        
        return value
    
    def set_config_value(self, key_path: str, value: Any):
        """
        Sets configuration value using dot notation
        """
        config = self.load_config()
        
        keys = key_path.split('.')
        current = config
        
        # Navigate to parent of target key
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        # Set the target value
        current[keys[-1]] = value
        
        # Save updated configuration
        self.save_config(config)
    
    def load_config(self) -> Dict[str, Any]:
        """
        Loads configuration from file
        """
        if not self.config_file.exists():
            return self.default_config.copy()
        
        try:
            with open(self.config_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            return self.default_config.copy()
    
    def validate_configuration(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates configuration for security compliance
        """
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": []
        }
        
        # Check required security settings
        security_config = config.get("security", {})
        
        if not security_config.get("local_processing_only", True):
            validation_result["errors"].append(
                "local_processing_only must be True for privacy compliance"
            )
            validation_result["valid"] = False
        
        if security_config.get("telemetry_enabled", False):
            validation_result["errors"].append(
                "Telemetry must be disabled for privacy compliance"
            )
            validation_result["valid"] = False
        
        # Check file size limits
        performance_config = config.get("performance", {})
        max_file_size = performance_config.get("file_size_limit_mb", 10)
        
        if max_file_size > 50:  # 50MB limit
            validation_result["warnings"].append(
                f"Large file size limit ({max_file_size}MB) may impact performance"
            )
        
        return validation_result

# Global secure configuration manager
secure_config = SecureConfigManager()
```

---

This comprehensive security and privacy documentation provides developers with detailed understanding of Resume Matcher's privacy-first architecture, security implementation, and compliance measures to ensure user data protection and system security.
