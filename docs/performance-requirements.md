# Performance Requirements and Optimization

## Overview

Resume Matcher is designed for high-performance local processing with specific benchmarks and optimization strategies. This document outlines performance requirements, measurement approaches, and optimization techniques across all system components.

## Performance Targets

### Response Time Requirements

```python
# performance/benchmarks.py
PERFORMANCE_TARGETS = {
    "api_endpoints": {
        "health_check": {"max_response_time_ms": 50, "p99_ms": 100},
        "resume_upload": {"max_response_time_ms": 2000, "p99_ms": 5000},
        "job_upload": {"max_response_time_ms": 1000, "p99_ms": 2000},
        "resume_preview": {"max_response_time_ms": 200, "p99_ms": 500},
        "match_score": {"max_response_time_ms": 500, "p99_ms": 1000}
    },
    "ai_processing": {
        "resume_extraction": {"max_time_s": 30, "target_time_s": 15},
        "job_processing": {"max_time_s": 20, "target_time_s": 10},
        "improvement_generation": {"max_time_s": 45, "target_time_s": 25},
        "similarity_calculation": {"max_time_ms": 2000, "target_time_ms": 1000}
    },
    "database_operations": {
        "simple_query": {"max_time_ms": 50, "target_time_ms": 20},
        "complex_join": {"max_time_ms": 200, "target_time_ms": 100},
        "bulk_insert": {"max_time_ms": 500, "target_time_ms": 200}
    },
    "file_processing": {
        "pdf_extraction_1mb": {"max_time_s": 5, "target_time_s": 2},
        "docx_extraction_1mb": {"max_time_s": 3, "target_time_s": 1}
    }
}

class PerformanceMonitor:
    """
    Monitors and tracks performance metrics against targets
    """
    
    def __init__(self):
        self.metrics = {}
        self.targets = PERFORMANCE_TARGETS
    
    async def measure_operation(self, category: str, operation: str, func, *args, **kwargs):
        """
        Measures execution time of an operation and compares to targets
        """
        start_time = time.perf_counter()
        
        try:
            result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
            execution_time = time.perf_counter() - start_time
            
            # Record metric
            self._record_metric(category, operation, execution_time, success=True)
            
            # Check against targets
            self._check_performance_target(category, operation, execution_time)
            
            return result
            
        except Exception as e:
            execution_time = time.perf_counter() - start_time
            self._record_metric(category, operation, execution_time, success=False, error=str(e))
            raise
    
    def _record_metric(self, category: str, operation: str, execution_time: float, success: bool, error: str = None):
        """
        Records performance metric for analysis
        """
        key = f"{category}.{operation}"
        
        if key not in self.metrics:
            self.metrics[key] = {
                "measurements": [],
                "success_count": 0,
                "error_count": 0,
                "avg_time": 0.0,
                "p95_time": 0.0,
                "p99_time": 0.0
            }
        
        metric = self.metrics[key]
        metric["measurements"].append({
            "timestamp": datetime.utcnow(),
            "execution_time": execution_time,
            "success": success,
            "error": error
        })
        
        # Update counters
        if success:
            metric["success_count"] += 1
        else:
            metric["error_count"] += 1
        
        # Update percentiles (keep last 1000 measurements)
        if len(metric["measurements"]) > 1000:
            metric["measurements"] = metric["measurements"][-1000:]
        
        recent_times = [m["execution_time"] for m in metric["measurements"] if m["success"]]
        if recent_times:
            recent_times.sort()
            metric["avg_time"] = sum(recent_times) / len(recent_times)
            metric["p95_time"] = recent_times[int(len(recent_times) * 0.95)]
            metric["p99_time"] = recent_times[int(len(recent_times) * 0.99)]
    
    def _check_performance_target(self, category: str, operation: str, execution_time: float):
        """
        Checks if performance meets targets and logs warnings
        """
        target = self.targets.get(category, {}).get(operation, {})
        
        # Check maximum time limit
        max_time_key = "max_response_time_ms" if execution_time < 1 else "max_time_s"
        if max_time_key not in target:
            max_time_key = "max_time_ms" if max_time_key not in target else max_time_key
        
        if max_time_key in target:
            max_time = target[max_time_key]
            time_value = execution_time * 1000 if "ms" in max_time_key else execution_time
            
            if time_value > max_time:
                logger.warning(
                    f"Performance target exceeded for {category}.{operation}: "
                    f"{time_value:.2f}{'ms' if 'ms' in max_time_key else 's'} > {max_time}{'ms' if 'ms' in max_time_key else 's'}"
                )

# Usage example
performance_monitor = PerformanceMonitor()

async def timed_resume_processing(resume_content: str):
    """
    Example of performance-monitored resume processing
    """
    return await performance_monitor.measure_operation(
        "ai_processing", 
        "resume_extraction",
        ai_processor.extract_structured_data,
        resume_content
    )
```

### Throughput Requirements

```python
# Concurrent processing limits
THROUGHPUT_TARGETS = {
    "concurrent_resume_processing": 5,      # Simultaneous AI processing jobs
    "concurrent_api_requests": 50,          # FastAPI concurrent requests
    "database_connection_pool": 20,         # Max database connections
    "file_upload_queue": 10,                # Queued file uploads
    "background_task_workers": 3            # Background job processors
}

class ThroughputManager:
    """
    Manages system throughput and resource utilization
    """
    
    def __init__(self):
        self.semaphores = {
            "ai_processing": asyncio.Semaphore(THROUGHPUT_TARGETS["concurrent_resume_processing"]),
            "file_processing": asyncio.Semaphore(THROUGHPUT_TARGETS["file_upload_queue"]),
            "background_tasks": asyncio.Semaphore(THROUGHPUT_TARGETS["background_task_workers"])
        }
        
        self.active_jobs = {
            "ai_processing": 0,
            "file_processing": 0,
            "background_tasks": 0
        }
    
    async def acquire_ai_processing_slot(self):
        """
        Acquires slot for AI processing with monitoring
        """
        await self.semaphores["ai_processing"].acquire()
        self.active_jobs["ai_processing"] += 1
        
        logger.info(f"AI processing slot acquired. Active jobs: {self.active_jobs['ai_processing']}")
    
    def release_ai_processing_slot(self):
        """
        Releases AI processing slot
        """
        self.semaphores["ai_processing"].release()
        self.active_jobs["ai_processing"] -= 1
        
        logger.info(f"AI processing slot released. Active jobs: {self.active_jobs['ai_processing']}")
    
    async def get_system_load(self) -> dict:
        """
        Returns current system load metrics
        """
        import psutil
        
        return {
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_usage_percent": psutil.disk_usage('/').percent,
            "active_ai_jobs": self.active_jobs["ai_processing"],
            "active_file_jobs": self.active_jobs["file_processing"],
            "active_background_jobs": self.active_jobs["background_tasks"],
            "available_ai_slots": self.semaphores["ai_processing"]._value,
            "available_file_slots": self.semaphores["file_processing"]._value
        }

# Context manager for managed processing
class ManagedProcessing:
    """
    Context manager for resource-controlled processing
    """
    
    def __init__(self, throughput_manager: ThroughputManager, resource_type: str):
        self.throughput_manager = throughput_manager
        self.resource_type = resource_type
    
    async def __aenter__(self):
        if self.resource_type == "ai_processing":
            await self.throughput_manager.acquire_ai_processing_slot()
        # Add other resource types as needed
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.resource_type == "ai_processing":
            self.throughput_manager.release_ai_processing_slot()

# Usage example
async def process_resume_with_throttling(resume_content: str):
    """
    Process resume with throughput management
    """
    throughput_manager = ThroughputManager()
    
    async with ManagedProcessing(throughput_manager, "ai_processing"):
        return await ai_processor.extract_structured_data(resume_content)
```

## Memory Management

### Memory Usage Optimization

```python
# memory/optimizer.py
import gc
import psutil
from typing import Dict, Any
import weakref

class MemoryManager:
    """
    Manages memory usage and optimization across the application
    """
    
    def __init__(self):
        self.memory_targets = {
            "max_memory_usage_percent": 80,    # Max system memory usage
            "ai_model_cache_mb": 2048,         # AI model cache limit
            "file_processing_cache_mb": 512,   # File processing cache
            "database_cache_mb": 256           # Database query cache
        }
        
        self.caches = {
            "ai_responses": weakref.WeakValueDictionary(),
            "processed_documents": weakref.WeakValueDictionary(),
            "similarity_scores": weakref.WeakValueDictionary()
        }
        
        self.cache_sizes = {key: 0 for key in self.caches.keys()}
    
    def get_memory_usage(self) -> Dict[str, float]:
        """
        Returns current memory usage statistics
        """
        process = psutil.Process()
        memory_info = process.memory_info()
        system_memory = psutil.virtual_memory()
        
        return {
            "process_memory_mb": memory_info.rss / 1024 / 1024,
            "process_memory_percent": process.memory_percent(),
            "system_memory_percent": system_memory.percent,
            "available_memory_mb": system_memory.available / 1024 / 1024,
            "cache_sizes": self.cache_sizes.copy()
        }
    
    async def check_memory_pressure(self) -> bool:
        """
        Checks if system is under memory pressure
        """
        memory_stats = self.get_memory_usage()
        
        return (
            memory_stats["system_memory_percent"] > self.memory_targets["max_memory_usage_percent"] or
            memory_stats["process_memory_mb"] > 1024  # 1GB process limit
        )
    
    async def optimize_memory_usage(self):
        """
        Performs memory optimization when under pressure
        """
        if not await self.check_memory_pressure():
            return
        
        logger.info("Memory pressure detected, starting optimization...")
        
        # Clear caches in order of importance
        for cache_name in ["similarity_scores", "ai_responses", "processed_documents"]:
            if await self.check_memory_pressure():
                self._clear_cache(cache_name)
                gc.collect()  # Force garbage collection
                
                logger.info(f"Cleared {cache_name} cache")
                await asyncio.sleep(0.1)  # Allow GC to complete
            else:
                break
        
        # Final memory stats
        final_stats = self.get_memory_usage()
        logger.info(f"Memory optimization complete. Usage: {final_stats['system_memory_percent']:.1f}%")
    
    def _clear_cache(self, cache_name: str):
        """
        Clears specified cache
        """
        if cache_name in self.caches:
            self.caches[cache_name].clear()
            self.cache_sizes[cache_name] = 0
    
    def cache_ai_response(self, key: str, response: dict, estimated_size_mb: float = 0.1):
        """
        Caches AI response with memory tracking
        """
        if self.cache_sizes["ai_responses"] + estimated_size_mb > self.memory_targets["ai_model_cache_mb"]:
            # Clear some cache entries
            self._clear_cache("ai_responses")
        
        self.caches["ai_responses"][key] = response
        self.cache_sizes["ai_responses"] += estimated_size_mb
    
    def get_cached_ai_response(self, key: str) -> Dict[str, Any]:
        """
        Retrieves cached AI response
        """
        return self.caches["ai_responses"].get(key)

# Memory-optimized file processing
class MemoryEfficientFileProcessor:
    """
    File processor optimized for memory usage
    """
    
    def __init__(self, memory_manager: MemoryManager):
        self.memory_manager = memory_manager
        self.chunk_size = 1024 * 1024  # 1MB chunks
    
    async def process_large_file(self, file_path: str) -> str:
        """
        Processes large files in memory-efficient chunks
        """
        # Check memory before processing
        if await self.memory_manager.check_memory_pressure():
            await self.memory_manager.optimize_memory_usage()
        
        # Process file in chunks to minimize memory usage
        extracted_text = ""
        
        try:
            with open(file_path, 'rb') as file:
                while True:
                    chunk = file.read(self.chunk_size)
                    if not chunk:
                        break
                    
                    # Process chunk
                    chunk_text = await self._process_chunk(chunk)
                    extracted_text += chunk_text
                    
                    # Yield control and check memory periodically
                    await asyncio.sleep(0)
                    
                    if await self.memory_manager.check_memory_pressure():
                        logger.warning("Memory pressure during file processing")
                        await self.memory_manager.optimize_memory_usage()
            
            return extracted_text
            
        except Exception as e:
            logger.error(f"Memory-efficient file processing failed: {e}")
            raise
    
    async def _process_chunk(self, chunk: bytes) -> str:
        """
        Processes individual file chunk
        """
        # Implement chunk-specific processing logic
        # This is a simplified example
        return chunk.decode('utf-8', errors='ignore')
```

### Garbage Collection Optimization

```python
# memory/gc_optimizer.py
import gc
import threading
import time

class GarbageCollectionOptimizer:
    """
    Optimizes garbage collection for better performance
    """
    
    def __init__(self):
        self.gc_stats = {
            "collections": 0,
            "collected_objects": 0,
            "collection_time": 0.0
        }
        
        # Configure GC thresholds for better performance
        gc.set_threshold(700, 10, 10)  # More aggressive collection
        
        # Start background GC monitoring
        self.gc_thread = threading.Thread(target=self._gc_monitor, daemon=True)
        self.gc_thread.start()
    
    def _gc_monitor(self):
        """
        Background thread to monitor and optimize GC
        """
        while True:
            time.sleep(30)  # Check every 30 seconds
            self._perform_optimized_gc()
    
    def _perform_optimized_gc(self):
        """
        Performs optimized garbage collection
        """
        start_time = time.time()
        
        # Get pre-collection stats
        pre_stats = gc.get_stats()
        
        # Force collection
        collected = gc.collect()
        
        # Update stats
        collection_time = time.time() - start_time
        self.gc_stats["collections"] += 1
        self.gc_stats["collected_objects"] += collected
        self.gc_stats["collection_time"] += collection_time
        
        if collected > 0:
            logger.debug(f"GC collected {collected} objects in {collection_time:.3f}s")
    
    def get_gc_stats(self) -> dict:
        """
        Returns garbage collection statistics
        """
        return {
            **self.gc_stats,
            "current_objects": len(gc.get_objects()),
            "gc_counts": gc.get_count(),
            "avg_collection_time": self.gc_stats["collection_time"] / max(1, self.gc_stats["collections"])
        }

# Initialize GC optimizer
gc_optimizer = GarbageCollectionOptimizer()
```

## Database Performance Optimization

### Query Optimization

```python
# database/query_optimizer.py
from sqlalchemy import text, func, select
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional

class DatabaseQueryOptimizer:
    """
    Optimizes database queries for better performance
    """
    
    def __init__(self, session):
        self.session = session
        self.query_cache = {}
        self.slow_query_threshold = 0.1  # 100ms
    
    async def get_resume_with_associations(self, resume_id: str) -> Optional[Resume]:
        """
        Optimized query to get resume with all associations in one query
        """
        # Use cache key for repeated queries
        cache_key = f"resume_with_assoc_{resume_id}"
        
        if cache_key in self.query_cache:
            return self.query_cache[cache_key]
        
        start_time = time.perf_counter()
        
        # Optimized query with eager loading
        query = (
            select(Resume)
            .options(
                selectinload(Resume.raw_resume_association),  # Load processed data
                selectinload(Resume.jobs).selectinload(Job.raw_job_association)  # Load associated jobs
            )
            .where(Resume.resume_id == resume_id)
        )
        
        result = await self.session.execute(query)
        resume = result.unique().scalar_one_or_none()
        
        execution_time = time.perf_counter() - start_time
        
        # Log slow queries
        if execution_time > self.slow_query_threshold:
            logger.warning(f"Slow query detected: get_resume_with_associations took {execution_time:.3f}s")
        
        # Cache result for short period
        if resume:
            self.query_cache[cache_key] = resume
            # Clear cache after 5 minutes
            asyncio.create_task(self._clear_cache_after_delay(cache_key, 300))
        
        return resume
    
    async def batch_get_processed_resumes(self, resume_ids: List[str]) -> List[ProcessedResume]:
        """
        Efficiently loads multiple processed resumes in a single query
        """
        if not resume_ids:
            return []
        
        start_time = time.perf_counter()
        
        # Batch query instead of N individual queries
        query = (
            select(ProcessedResume)
            .where(ProcessedResume.resume_id.in_(resume_ids))
            .options(selectinload(ProcessedResume.raw_resume))
        )
        
        result = await self.session.execute(query)
        resumes = result.unique().scalars().all()
        
        execution_time = time.perf_counter() - start_time
        
        logger.info(
            f"Batch loaded {len(resumes)} processed resumes in {execution_time:.3f}s "
            f"({execution_time/len(resume_ids):.3f}s per resume)"
        )
        
        return resumes
    
    async def get_popular_skills_statistics(self, limit: int = 50) -> List[dict]:
        """
        Optimized query for skill statistics using raw SQL for performance
        """
        start_time = time.perf_counter()
        
        # Use raw SQL for complex aggregation query
        query = text("""
            WITH skill_data AS (
                SELECT 
                    json_extract(value, '$.skillName') as skillName,
                    json_extract(value, '$.category') as category
                FROM processed_resumes,
                     json_each(skills, '$.skills')
                WHERE skill_name IS NOT NULL
            )
            SELECT 
                skill_name,
                category,
                COUNT(*) as frequency,
                COUNT(*) * 100.0 / (SELECT COUNT(DISTINCT resume_id) FROM processed_resumes) as percentage
            FROM skill_data
            GROUP BY skill_name, category
            ORDER BY frequency DESC
            LIMIT :limit
        """)
        
        result = await self.session.execute(query, {"limit": limit})
        stats = [dict(row) for row in result]
        
        execution_time = time.perf_counter() - start_time
        logger.info(f"Generated skill statistics in {execution_time:.3f}s")
        
        return stats
    
    async def _clear_cache_after_delay(self, cache_key: str, delay_seconds: int):
        """
        Clears cache entry after specified delay
        """
        await asyncio.sleep(delay_seconds)
        self.query_cache.pop(cache_key, None)

# Database connection pool optimization
class OptimizedDatabaseManager(DatabaseManager):
    """
    Database manager with performance optimizations
    """
    
    def __init__(self, database_url: str = None):
        super().__init__(database_url)
        
        # Performance-optimized engine settings
        self.engine_config = {
            "pool_size": 10,           # Connection pool size
            "max_overflow": 20,        # Additional connections beyond pool_size
            "pool_timeout": 30,        # Timeout when getting connection from pool
            "pool_recycle": 3600,      # Recycle connections every hour
            "pool_pre_ping": True,     # Validate connections before use
            "echo": False,             # Disable SQL logging for performance
            "connect_args": {
                "check_same_thread": False,
                "timeout": 30,
                "isolation_level": None,  # Use autocommit mode
                "pragmas": {
                    "journal_mode": "WAL",     # Write-Ahead Logging
                    "cache_size": -64000,      # 64MB cache
                    "synchronous": "NORMAL",   # Balance safety/performance
                    "temp_store": "MEMORY",    # Store temp tables in memory
                    "mmap_size": 268435456,    # 256MB memory-mapped I/O
                }
            }
        }
    
    async def initialize(self):
        """
        Initialize database with performance optimizations
        """
        self.engine = create_async_engine(
            self.database_url,
            **self.engine_config
        )
        
        # Apply SQLite performance pragmas
        await self._apply_performance_pragmas()
        
        await super().initialize()
    
    async def _apply_performance_pragmas(self):
        """
        Applies SQLite performance optimization pragmas
        """
        pragmas = [
            "PRAGMA journal_mode = WAL;",
            "PRAGMA synchronous = NORMAL;",
            "PRAGMA cache_size = -64000;",  # 64MB
            "PRAGMA temp_store = MEMORY;",
            "PRAGMA mmap_size = 268435456;",  # 256MB
            "PRAGMA optimize;",
        ]
        
        async with self.engine.begin() as conn:
            for pragma in pragmas:
                await conn.execute(text(pragma))
        
        logger.info("Applied SQLite performance optimizations")
```

### Index Optimization

```python
# database/index_optimizer.py
class DatabaseIndexOptimizer:
    """
    Manages database indexes for optimal query performance
    """
    
    REQUIRED_INDEXES = [
        # Primary lookup indexes
        ("resumes", ["resume_id"], True),  # Unique index
        ("processed_resumes", ["resume_id"], True),
        ("jobs", ["job_id"], True),
        ("processed_jobs", ["job_id"], True),
        
        # Time-based queries
        ("resumes", ["created_at"], False),
        ("processed_resumes", ["processed_at"], False),
        ("jobs", ["created_at"], False),
        ("processed_jobs", ["processed_at"], False),
        
        # Search indexes
        ("processed_jobs", ["job_title"], False),
        ("processed_jobs", ["location"], False),
        ("processed_jobs", ["employment_type"], False),
        
        # Association table
        ("job_resume_association", ["job_id"], False),
        ("job_resume_association", ["resume_id"], False),
        ("job_resume_association", ["job_id", "resume_id"], True),  # Composite unique
        
        # JSON field indexes (SQLite 3.45+)
        ("processed_resumes", ["json_extract(personal_data, '$.emailAddress')"], False),
    ]
    
    async def create_performance_indexes(self, session):
        """
        Creates all performance-critical indexes
        """
        logger.info("Creating database performance indexes...")
        
        for table_name, columns, is_unique in self.REQUIRED_INDEXES:
            try:
                await self._create_index(session, table_name, columns, is_unique)
            except Exception as e:
                logger.warning(f"Failed to create index on {table_name}{columns}: {e}")
        
        logger.info("Database index creation completed")
    
    async def _create_index(self, session, table_name: str, columns: List[str], is_unique: bool):
        """
        Creates individual index
        """
        column_str = ", ".join(columns)
        index_name = f"idx_{table_name}_{'_'.join(col.replace('(', '').replace(')', '').replace('.', '_').replace(',', '_').replace("'", '') for col in columns)}"
        unique_str = "UNIQUE " if is_unique else ""
        
        # Truncate index name if too long
        if len(index_name) > 63:  # SQLite limit
            index_name = index_name[:60] + "idx"
        
        create_sql = f"CREATE {unique_str}INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_str})"
        
        await session.execute(text(create_sql))
        logger.debug(f"Created index: {index_name}")
    
    async def analyze_query_performance(self, session):
        """
        Analyzes query performance and suggests optimizations
        """
        # Get query execution statistics
        stats_query = text("SELECT * FROM sqlite_stat1")
        
        try:
            result = await session.execute(stats_query)
            stats = result.fetchall()
            
            logger.info(f"Database statistics: {len(stats)} tables analyzed")
            
            # Run ANALYZE to update statistics
            await session.execute(text("ANALYZE"))
            logger.info("Updated database query statistics")
            
        except Exception as e:
            logger.warning(f"Query performance analysis failed: {e}")
```

## AI Processing Optimization

### Model Performance Tuning

```python
# ai/performance_optimizer.py
class AIPerformanceOptimizer:
    """
    Optimizes AI processing performance
    """
    
    def __init__(self, ai_provider):
        self.ai_provider = ai_provider
        self.performance_cache = {}
        self.processing_stats = {
            "cache_hits": 0,
            "cache_misses": 0,
            "avg_processing_time": 0.0,
            "total_requests": 0
        }
    
    async def optimized_extract_data(self, text: str, schema: dict) -> dict:
        """
        Extracts data with performance optimizations
        """
        # Generate cache key
        cache_key = self._generate_cache_key(text, schema)
        
        # Check cache first
        cached_result = self._get_cached_result(cache_key)
        if cached_result:
            self.processing_stats["cache_hits"] += 1
            return cached_result
        
        self.processing_stats["cache_misses"] += 1
        self.processing_stats["total_requests"] += 1
        
        start_time = time.perf_counter()
        
        # Optimize input text
        optimized_text = self._optimize_input_text(text)
        
        # Process with AI
        result = await self.ai_provider.generate_structured_response(optimized_text, schema)
        
        processing_time = time.perf_counter() - start_time
        
        # Update statistics
        self._update_processing_stats(processing_time)
        
        # Cache result
        self._cache_result(cache_key, result, processing_time)
        
        return result
    
    def _optimize_input_text(self, text: str) -> str:
        """
        Optimizes input text for better AI processing performance
        """
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Truncate if too long (AI models have context limits)
        max_length = 8000  # Conservative limit for most models
        if len(text) > max_length:
            # Smart truncation - keep beginning and end
            middle_point = max_length // 2
            text = text[:middle_point] + "\n... [content truncated] ...\n" + text[-middle_point:]
        
        # Remove potentially problematic characters
        text = text.replace('\x00', '')  # Remove null bytes
        
        return text
    
    def _generate_cache_key(self, text: str, schema: dict) -> str:
        """
        Generates cache key for text/schema combination
        """
        import hashlib
        
        # Create hash of text + schema
        content = text + json.dumps(schema, sort_keys=True)
        return hashlib.md5(content.encode()).hexdigest()
    
    def _get_cached_result(self, cache_key: str) -> Optional[dict]:
        """
        Retrieves cached result if available and not expired
        """
        cached_entry = self.performance_cache.get(cache_key)
        
        if cached_entry:
            cache_time, result = cached_entry
            # Cache expires after 1 hour
            if time.time() - cache_time < 3600:
                return result
            else:
                # Remove expired entry
                del self.performance_cache[cache_key]
        
        return None
    
    def _cache_result(self, cache_key: str, result: dict, processing_time: float):
        """
        Caches result with timestamp
        """
        # Only cache results from successful, reasonably fast processing
        if processing_time < 60:  # Don't cache slow results
            self.performance_cache[cache_key] = (time.time(), result)
            
            # Limit cache size
            if len(self.performance_cache) > 1000:
                # Remove oldest entries
                oldest_keys = sorted(
                    self.performance_cache.keys(),
                    key=lambda k: self.performance_cache[k][0]
                )[:100]
                
                for key in oldest_keys:
                    del self.performance_cache[key]
    
    def _update_processing_stats(self, processing_time: float):
        """
        Updates processing time statistics
        """
        current_avg = self.processing_stats["avg_processing_time"]
        total = self.processing_stats["total_requests"]
        
        # Calculate new running average
        new_avg = ((current_avg * (total - 1)) + processing_time) / total
        self.processing_stats["avg_processing_time"] = new_avg
    
    def get_performance_stats(self) -> dict:
        """
        Returns current performance statistics
        """
        total_requests = self.processing_stats["total_requests"]
        if total_requests == 0:
            cache_hit_rate = 0.0
        else:
            cache_hit_rate = self.processing_stats["cache_hits"] / total_requests
        
        return {
            **self.processing_stats,
            "cache_hit_rate": cache_hit_rate,
            "cache_size": len(self.performance_cache)
        }

# Batch processing optimization
class BatchAIProcessor:
    """
    Processes multiple AI requests in optimized batches
    """
    
    def __init__(self, ai_provider, batch_size: int = 5):
        self.ai_provider = ai_provider
        self.batch_size = batch_size
        self.pending_requests = []
        self.batch_timer = None
    
    async def process_batch_request(self, text: str, schema: dict) -> dict:
        """
        Adds request to batch and returns result when batch is processed
        """
        future = asyncio.Future()
        request = {
            "text": text,
            "schema": schema,
            "future": future
        }
        
        self.pending_requests.append(request)
        
        # Start batch timer if not already running
        if self.batch_timer is None:
            self.batch_timer = asyncio.create_task(self._process_batch_after_delay())
        
        # Process immediately if batch is full
        if len(self.pending_requests) >= self.batch_size:
            await self._process_current_batch()
        
        return await future
    
    async def _process_batch_after_delay(self):
        """
        Processes batch after a short delay to collect more requests
        """
        await asyncio.sleep(0.5)  # 500ms delay
        if self.pending_requests:
            await self._process_current_batch()
    
    async def _process_current_batch(self):
        """
        Processes all pending requests in current batch
        """
        if not self.pending_requests:
            return
        
        batch = self.pending_requests[:]
        self.pending_requests.clear()
        self.batch_timer = None
        
        logger.info(f"Processing AI batch of {len(batch)} requests")
        
        # Process requests concurrently
        tasks = []
        for request in batch:
            task = self._process_single_request(request)
            tasks.append(task)
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _process_single_request(self, request: dict):
        """
        Processes a single request and sets its future result
        """
        try:
            result = await self.ai_provider.generate_structured_response(
                request["text"], 
                request["schema"]
            )
            request["future"].set_result(result)
        except Exception as e:
            request["future"].set_exception(e)
```

## Performance Monitoring and Alerting

```python
# monitoring/performance_monitor.py
class SystemPerformanceMonitor:
    """
    Comprehensive system performance monitoring
    """
    
    def __init__(self):
        self.metrics_history = []
        self.alert_thresholds = {
            "cpu_percent": 80,
            "memory_percent": 85,
            "disk_usage_percent": 90,
            "avg_response_time_ms": 1000,
            "error_rate_percent": 5
        }
        
        self.monitoring_active = False
    
    async def start_monitoring(self):
        """
        Starts continuous performance monitoring
        """
        self.monitoring_active = True
        asyncio.create_task(self._monitoring_loop())
        logger.info("Performance monitoring started")
    
    def stop_monitoring(self):
        """
        Stops performance monitoring
        """
        self.monitoring_active = False
        logger.info("Performance monitoring stopped")
    
    async def _monitoring_loop(self):
        """
        Main monitoring loop
        """
        while self.monitoring_active:
            try:
                metrics = await self._collect_metrics()
                self.metrics_history.append(metrics)
                
                # Keep only last 1000 entries
                if len(self.metrics_history) > 1000:
                    self.metrics_history = self.metrics_history[-1000:]
                
                # Check for alerts
                await self._check_alerts(metrics)
                
                await asyncio.sleep(10)  # Collect metrics every 10 seconds
                
            except Exception as e:
                logger.error(f"Performance monitoring error: {e}")
                await asyncio.sleep(30)  # Wait longer on error
    
    async def _collect_metrics(self) -> dict:
        """
        Collects comprehensive system metrics
        """
        import psutil
        
        # System metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Application metrics
        process = psutil.Process()
        process_memory = process.memory_info()
        
        return {
            "timestamp": datetime.utcnow(),
            "system": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "disk_usage_percent": disk.percent,
                "available_memory_mb": memory.available / 1024 / 1024
            },
            "process": {
                "memory_mb": process_memory.rss / 1024 / 1024,
                "memory_percent": process.memory_percent(),
                "cpu_percent": process.cpu_percent(),
                "num_threads": process.num_threads()
            },
            "application": await self._get_application_metrics()
        }
    
    async def _get_application_metrics(self) -> dict:
        """
        Collects application-specific metrics
        """
        # This would integrate with your actual application metrics
        return {
            "active_ai_jobs": 0,  # Get from throughput manager
            "database_connections": 0,  # Get from connection pool
            "cache_hit_rate": 0.0,  # Get from cache manager
            "avg_response_time_ms": 0.0,  # Get from performance monitor
            "error_rate_percent": 0.0  # Get from error tracking
        }
    
    async def _check_alerts(self, metrics: dict):
        """
        Checks metrics against alert thresholds
        """
        alerts = []
        
        # System resource alerts
        if metrics["system"]["cpu_percent"] > self.alert_thresholds["cpu_percent"]:
            alerts.append(f"High CPU usage: {metrics['system']['cpu_percent']:.1f}%")
        
        if metrics["system"]["memory_percent"] > self.alert_thresholds["memory_percent"]:
            alerts.append(f"High memory usage: {metrics['system']['memory_percent']:.1f}%")
        
        if metrics["system"]["disk_usage_percent"] > self.alert_thresholds["disk_usage_percent"]:
            alerts.append(f"High disk usage: {metrics['system']['disk_usage_percent']:.1f}%")
        
        # Application performance alerts
        app_metrics = metrics["application"]
        if app_metrics["avg_response_time_ms"] > self.alert_thresholds["avg_response_time_ms"]:
            alerts.append(f"High response time: {app_metrics['avg_response_time_ms']:.0f}ms")
        
        if app_metrics["error_rate_percent"] > self.alert_thresholds["error_rate_percent"]:
            alerts.append(f"High error rate: {app_metrics['error_rate_percent']:.1f}%")
        
        # Log alerts
        for alert in alerts:
            logger.warning(f"PERFORMANCE ALERT: {alert}")
    
    def get_performance_summary(self, hours: int = 1) -> dict:
        """
        Returns performance summary for specified time period
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        recent_metrics = [
            m for m in self.metrics_history 
            if m["timestamp"] > cutoff_time
        ]
        
        if not recent_metrics:
            return {"error": "No metrics available for specified period"}
        
        # Calculate averages
        cpu_values = [m["system"]["cpu_percent"] for m in recent_metrics]
        memory_values = [m["system"]["memory_percent"] for m in recent_metrics]
        
        return {
            "period_hours": hours,
            "data_points": len(recent_metrics),
            "cpu": {
                "avg": sum(cpu_values) / len(cpu_values),
                "max": max(cpu_values),
                "min": min(cpu_values)
            },
            "memory": {
                "avg": sum(memory_values) / len(memory_values),
                "max": max(memory_values),
                "min": min(memory_values)
            },
            "alerts_triggered": len([
                m for m in recent_metrics 
                if m["system"]["cpu_percent"] > self.alert_thresholds["cpu_percent"] or
                   m["system"]["memory_percent"] > self.alert_thresholds["memory_percent"]
            ])
        }

# Initialize global performance monitor
performance_monitor = SystemPerformanceMonitor()
```

---

This comprehensive performance documentation provides developers with detailed understanding of Resume Matcher's performance requirements, optimization strategies, and monitoring approaches to ensure the application runs efficiently under various load conditions.
