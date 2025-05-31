# Production Deployment Guide

## Overview

This guide covers deploying the Resume Matcher application in a production environment with high scalability, optimized memory usage, and following Google engineering best practices.

## Architecture

The production setup includes:
- **FastAPI Backend** with async support and connection pooling
- **Next.js Frontend** with SSR and optimized builds
- **PostgreSQL** for persistent data with optimized configurations
- **Redis** for caching and rate limiting
- **Celery** for background task processing
- **Nginx** for reverse proxy and load balancing
- **Prometheus + Grafana** for monitoring
- **Docker Swarm/Kubernetes** for orchestration

## Pre-requisites

- Docker 24.0+
- Docker Compose 2.20+
- PostgreSQL 16+
- Redis 7+
- Node.js 20+
- Python 3.11+

## Deployment Steps

### 1. Environment Setup

```bash
# Clone the repository
git clone https://github.com/your-org/resume-matcher.git
cd resume-matcher

# Copy environment template
cp env.production.example .env.production

# Generate secure keys
openssl rand -hex 32  # For SESSION_SECRET_KEY
openssl rand -hex 32  # For JWT_SECRET_KEY

# Edit .env.production with your values
vim .env.production
```

### 2. SSL Certificates

```bash
# Create SSL directory
mkdir -p nginx/ssl

# For production, use Let's Encrypt
docker run -it --rm \
  -v $(pwd)/nginx/ssl:/etc/letsencrypt \
  certbot/certbot certonly \
  --standalone \
  -d resume-matcher.com \
  -d www.resume-matcher.com \
  -d api.resume-matcher.com
```

### 3. Database Setup

```bash
# Create database initialization script
cat > scripts/init-db.sql << EOF
-- Performance optimizations
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET max_parallel_workers_per_gather = 2;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET max_parallel_maintenance_workers = 2;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create indexes for better performance
-- These will be created after tables are initialized
EOF
```

### 4. Build and Deploy

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check service health
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f
```

### 5. Post-Deployment Optimization

```bash
# Run database migrations
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Create database indexes
docker-compose -f docker-compose.prod.yml exec postgres psql -U resume_user -d resume_matcher << EOF
-- Add indexes for common queries
CREATE INDEX idx_resumes_created_at ON resumes(created_at DESC);
CREATE INDEX idx_processed_resumes_resume_id ON processed_resumes(resume_id);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_users_email ON users(email);

-- Add full-text search indexes
CREATE INDEX idx_resumes_content_gin ON resumes USING gin(to_tsvector('english', content));
CREATE INDEX idx_jobs_description_gin ON jobs USING gin(to_tsvector('english', description));
EOF

# Warm up cache
docker-compose -f docker-compose.prod.yml exec backend python -m app.scripts.warm_cache
```

## Performance Optimizations

### 1. Backend Optimizations

- **Connection Pooling**: Configured with optimal pool sizes
- **Async Operations**: All I/O operations are async
- **Redis Caching**: Frequently accessed data is cached
- **Streaming File Processing**: Large files are processed in chunks
- **Query Optimization**: Pagination and batch processing
- **Rate Limiting**: Prevents abuse and ensures fair usage

### 2. Frontend Optimizations

- **Static Generation**: Pages are pre-rendered where possible
- **Image Optimization**: Next.js Image component with WebP/AVIF
- **Code Splitting**: Automatic chunk optimization
- **Compression**: Gzip compression enabled
- **Caching Headers**: Proper cache-control headers

### 3. Database Optimizations

- **Connection Pooling**: 20 connections with 40 overflow
- **Query Caching**: 1200 query cache size
- **Index Optimization**: Proper indexes on frequently queried columns
- **WAL Mode**: For SQLite in development
- **Prepared Statements**: Reduced query parsing overhead

### 4. Caching Strategy

```python
# Cache layers:
1. Browser Cache: Static assets (1 year)
2. CDN Cache: Images and API responses (1 hour)
3. Redis Cache: Database queries (5 minutes)
4. Application Cache: In-memory caching for hot data
```

## Monitoring

### 1. Health Checks

```bash
# Backend health
curl http://localhost/api/health

# Frontend health
curl http://localhost:3000/api/health

# Database health
docker-compose -f docker-compose.prod.yml exec backend python -c "
from app.core import check_database_connection
import asyncio
print(asyncio.run(check_database_connection()))
"

# Redis health
docker-compose -f docker-compose.prod.yml exec backend python -c "
from app.core import cache
import asyncio
print(asyncio.run(cache.health_check()))
"
```

### 2. Metrics

Access Grafana at `http://localhost:3000` (default login: admin/admin)

Key metrics to monitor:
- Request rate and latency
- Database connection pool usage
- Cache hit rates
- Memory usage per service
- CPU usage per service
- Background task queue length

### 3. Logs

```bash
# Aggregate logs
docker-compose -f docker-compose.prod.yml logs -f

# Specific service logs
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend

# Export logs for analysis
docker-compose -f docker-compose.prod.yml logs --since 24h > logs/production_$(date +%Y%m%d).log
```

## Scaling

### Horizontal Scaling

```yaml
# Increase replicas in docker-compose.prod.yml
deploy:
  replicas: 4  # Increase as needed
```

### Database Scaling

```bash
# Read replicas for PostgreSQL
# Add read-only replicas to handle read traffic
# Configure in your database connection string
```

### Caching Scaling

```bash
# Redis Cluster for high availability
# Configure Redis Sentinel or Cluster mode
```

## Security Best Practices

1. **Environment Variables**: Never commit secrets
2. **HTTPS Only**: Force SSL in production
3. **Security Headers**: All security headers configured
4. **Rate Limiting**: Prevent abuse
5. **Input Validation**: Pydantic models validate all inputs
6. **SQL Injection**: Using ORM with parameterized queries
7. **XSS Protection**: Content security policy configured
8. **CORS**: Strict origin validation

## Backup and Recovery

### Database Backup

```bash
# Automated daily backups
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_CONTAINER="postgres"

# Create backup
docker-compose -f docker-compose.prod.yml exec -T $DB_CONTAINER \
  pg_dump -U resume_user resume_matcher | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x scripts/backup.sh

# Add to crontab
echo "0 2 * * * /path/to/scripts/backup.sh" | crontab -
```

### Recovery

```bash
# Restore from backup
gunzip < /backups/backup_20240115_020000.sql.gz | \
  docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U resume_user resume_matcher
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks: `docker stats`
   - Increase swap: `sudo fallocate -l 4G /swapfile`
   - Optimize queries: Check slow query log

2. **Slow Response Times**
   - Check cache hit rates
   - Monitor database queries
   - Enable query profiling

3. **Connection Errors**
   - Check connection pool exhaustion
   - Increase pool size if needed
   - Monitor network latency

### Debug Mode

```bash
# Enable debug logging
docker-compose -f docker-compose.prod.yml exec backend \
  python -c "import logging; logging.basicConfig(level=logging.DEBUG)"
```

## Maintenance

### Regular Tasks

1. **Weekly**
   - Review error logs
   - Check disk usage
   - Update dependencies

2. **Monthly**
   - Performance review
   - Security updates
   - Database optimization

3. **Quarterly**
   - Load testing
   - Disaster recovery drill
   - Architecture review

### Updates

```bash
# Update dependencies
cd apps/backend
poetry update

cd ../frontend
npm update

# Rebuild and deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

## Performance Benchmarks

Expected performance metrics:
- API Response Time: < 200ms (p95)
- Database Query Time: < 50ms (p95)
- Cache Hit Rate: > 80%
- Concurrent Users: 10,000+
- Requests/Second: 1,000+
- Memory Usage: < 1GB per service
- CPU Usage: < 70% under load

## Support

For production support:
- Monitor Sentry for errors
- Check Grafana dashboards
- Review application logs
- Contact: devops@resume-matcher.com 