# Security and Privacy Architecture

## Overview
Resume Matcher uses a privacy-first architecture that processes sensitive data locally, never transmitting resume or job data to external services.

## Core Privacy Principles
- **Local Processing**: AI inference runs on the user's machine via Ollama
- **Data Minimization**: No user accounts, tracking, or unnecessary data collection
- **Transparent Storage**: SQLite database in user's local directory
- **No Telemetry**: No analytics or usage tracking
- **Open Source**: Full code transparency under MIT license

## Security Implementation

### Local-First Architecture
```python
class LocalFirstArchitecture:
    def __init__(self):
        self.local_services = {
            "ai_processing": "ollama",
            "document_parsing": "markitdown", 
            "database": "sqlite"
        }
        
    async def process_resume_locally(self, resume_content: str) -> dict:
        # Validate local services
        if not self.validate_service_call("ollama", "highly_sensitive"):
            raise SecurityError("Local AI service not available")
        
        # Process without external network calls
        ai_provider = await self._get_local_ai_provider()
        with NetworkBlocker():
            result = await ai_provider.extract_structured_data(resume_content)
        
        return result
```

### Data Encryption
```python
class LocalDataEncryption:
    def _derive_key(self) -> bytes:
        # Generate and securely store a unique salt per installation
        salt_file = os.path.expanduser("~/.resume_matcher_salt")
        if not os.path.exists(salt_file):
            with open(salt_file, 'wb') as f:
                f.write(os.urandom(16))  # Generate a 16-byte random salt
        
        with open(salt_file, 'rb') as f:
            salt = f.read()
            
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        
        key = base64.urlsafe_b64encode(kdf.derive(self.password.encode()))
        return key
    
    def encrypt_resume_data(self, resume_data: dict) -> bytes:
        # Encrypts data for local storage
        plaintext = json.dumps(resume_data).encode()
        return self.fernet.encrypt(plaintext)
```

### Input Validation
- All user inputs are validated and sanitized
- Malicious patterns are detected and removed
- File uploads are scanned for threats before processing

### Authentication
- Optional password protection for local database
- API endpoints secured with session tokens
- No external authentication providers
