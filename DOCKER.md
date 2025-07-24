# Docker Setup Guide for Resume-Matcher

This guide provides instructions for running Resume-Matcher using Docker and Docker Compose.

## 🐳 Prerequisites

- **Docker** (v20.10 or later)
- **Docker Compose** (v2.0 or later)
- At least **8GB RAM** (for Ollama AI models)
- At least **10GB free disk space** (for AI models and containers)

## 📁 Docker Files Overview

The project includes several Docker-related files:

- `Dockerfile.backend` - Backend FastAPI application container
- `Dockerfile.frontend` - Frontend Next.js application container
- `docker-compo  se.yml` - Production deployment configuration
- `docker-compose.dev.yml` - Development environment configuration
- `.dockerignore` - Files to exclude from Docker build context

## 🚀 Quick Start

### Production Deployment

1. **Clone the repository**
   ```bash
   git clone https://github.com/srbhr/Resume-Matcher.git
   cd Resume-Matcher
   ```

2. **Start all services**
   ```bash
   docker compose up -d
   ```

3. **Wait for initialization** (first run takes 5-10 minutes)
   ```bash
   # Monitor the logs
   docker compose logs -f

   # Check service status
   docdocker compose ps
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - Ollama API: http://localhost:11434

### Development Environment

For development with hot-reload:

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Stop services
docker compose -f docker-compose.dev.yml down
```

## 🔧 Configuration

### Environment Variables

The Docker setup uses the following key environment variables:

#### Backend
- `SESSION_SECRET_KEY` - FastAPI session secret (change in production)
- `SYNC_DATABASE_URL` - Synchronous database connection string
- `ASYNC_DATABASE_URL` - Asynchronous database connection string
- `OLLAMA_HOST` - Ollama service endpoint
- `PYTHONDONTWRITEBYTECODE` - Disable Python bytecode generation

#### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL for client-side requests
- `NODE_ENV` - Node.js environment (development/production)

### Customizing Configuration

1. **Create environment override file**
   ```bash
   # Create docker-compose.override.yml for local customizations
   cat > docker-compose.override.yml << EOF
   version: '3.8'
   services:
     backend:
       environment:
         - SESSION_SECRET_KEY=your-secure-secret-key
     frontend:
       environment:
         - NEXT_PUBLIC_API_URL=http://localhost:8000
   EOF
   ```

2. **Custom ports**
   ```yaml
   # In docker-compose.override.yml
   services:
     frontend:
       ports:
         - "3001:3000"  # Change frontend port
     backend:
       ports:
         - "8001:8000"  # Change backend port
   ```

## 📊 Service Dependencies

The services start in the following order:

1. **Ollama** - AI service foundation
2. **Ollama-init** - Downloads required AI models (gemma3:4b)
3. **Backend** - FastAPI application (waits for Ollama)
4. **Frontend** - Next.js application (waits for Backend)

## 🗄️ Data Persistence

Docker volumes are used for data persistence:

- `ollama_data` - AI models and Ollama configuration
- `backend_data` - Application data and uploads
- `backend_db` - SQLite database files

### Backup Data

```bash
# Backup all volumes
docker run --rm -v resume-matcher_ollama_data:/data -v $(pwd):/backup alpine tar czf /backup/ollama_backup.tar.gz -C /data .
docker run --rm -v resume-matcher_backend_data:/data -v $(pwd):/backup alpine tar czf /backup/backend_data_backup.tar.gz -C /data .
docker run --rm -v resume-matcher_backend_db:/data -v $(pwd):/backup alpine tar czf /backup/backend_db_backup.tar.gz -C /data .
```

### Restore Data

```bash
# Restore volumes from backup
docker run --rm -v resume-matcher_ollama_data:/data -v $(pwd):/backup alpine tar xzf /backup/ollama_backup.tar.gz -C /data
docker run --rm -v resume-matcher_backend_data:/data -v $(pwd):/backup alpine tar xzf /backup/backend_data_backup.tar.gz -C /data
docker run --rm -v resume-matcher_backend_db:/data -v $(pwd):/backup alpine tar xzf /backup/backend_db_backup.tar.gz -C /data
```

## 🔍 Monitoring and Debugging

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f ollama

# Last 100 lines
docker compose logs --tail=100 backend
```

### Health Checks

All services include health checks:

```bash
# Check service health
docker compose ps

# Manual health check
curl http://localhost:8000/health  # Backend
curl http://localhost:3000         # Frontend
curl http://localhost:11434/api/tags  # Ollama
```

### Access Container Shells

```bash
# Backend container
docker compose exec backend bash

# Frontend container (development)
docker compose -f docker-compose.dev.yml exec frontend sh

# Ollama container
docker compose exec ollama bash
```

## 🛠️ Troubleshooting

### Common Issues

1. **Ollama model download fails**
   ```bash
   # Manually pull the model
   docker compose exec ollama ollama pull gemma3:4b
   ```

2. **Port conflicts**
   ```bash
   # Check what's using the ports
   netstat -tulpn | grep :3000
   netstat -tulpn | grep :8000
   netstat -tulpn | grep :11434
   ```

3. **Out of disk space**
   ```bash
   # Clean up unused Docker resources
   docker system prune -a --volumes

   # Check Docker disk usage
   docker system df
   ```

4. **Memory issues with Ollama**
   ```bash
   # Check available memory
   free -h

   # Monitor container memory usage
   docker stats
   ```

### Reset    Everything

```bash
# Stop and remove all containers, networks, and volumes
docdocker compose n -v --remove-orphans

# Remove all images
docdocker compose down --rmi all

# Clean up system
docker system prune -a --volumes
```

## 🚦 Performance Optimization

### Production Optimizations

1. **Limit container resources**
   ```yaml
   # In docker-compose.yml
   services:
     backend:
       deploy:
         resources:
           limits:
             memory: 2G
             cpus: '1.0'
   ```

2. **Use multi-stage builds** (already implemented in Dockerfiles)

3. **Enable Docker BuildKit**
   ```bash
   export DOCKER_BUILDKIT=1
   docker compose build
   ```

### Development Optimizations

1. **Use bind mounts for live reload** (already configured in dev compose)

2. **Cache node_modules**
   ```yaml
   # Already configured in docker-compose.dev.yml
   volumes:
     - frontend_node_modules:/app/node_modules
   ```

## 🔒 Security Considerations

1. **Change default secrets**
   - Update `SESSION_SECRET_KEY` in production
   - Use secure random values

2. **Network isolation**
   - Services communicate through internal Docker network
   - Only necessary ports are exposed

3. **User permissions**
   - Frontend runs as non-root user
   - Backend uses appropriate file permissions

4. **Regular updates**
   ```bash
   # Update base images
   docker compose pull
   docker compose up -d
   ```

## 📈 Scaling

### Horizontal Scaling

```yaml
# Scale specific services
docker compose up -d --scale backend=3
```

### Load Balancing

For production, consider adding:
- Nginx reverse proxy
- Multiple backend replicas
- Health check endpoints

---

## 🆘 Support

If you encounter issues:

1. Check the logs: `docker compose logs -f`
2. Verify health checks: `docker compose ps`
3. Review resource usage: `docker stats`
4. Consult the main README.md for project-specific guidance

For more detailed setup information, see `SETUP.md`.
