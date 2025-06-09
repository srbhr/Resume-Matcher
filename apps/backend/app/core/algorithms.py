"""
High-performance algorithms for text processing and similarity matching.

Implements memory-efficient algorithms optimized for production use:
- TF-IDF vectorization with sparse matrices
- BM25 ranking algorithm
- Efficient cosine similarity with SIMD optimizations
- Memory-pooled text processing
- Inverted index for fast search
"""

import heapq
import math
import re
from collections import defaultdict, Counter
from typing import List, Dict, Tuple, Set, Optional, Generator
import numpy as np
from scipy.sparse import csr_matrix, dok_matrix
from functools import lru_cache
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Pre-compiled regex patterns for performance
WORD_PATTERN = re.compile(r'\b\w+\b')
SENTENCE_PATTERN = re.compile(r'[.!?]+')
STOP_WORDS = frozenset({
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
    'had', 'what', 'when', 'where', 'who', 'will', 'with', 'would'
})


class MemoryEfficientTokenizer:
    """Memory-efficient tokenizer using generators."""
    
    def __init__(self, lowercase: bool = True, remove_stopwords: bool = True):
        self.lowercase = lowercase
        self.remove_stopwords = remove_stopwords
        self._token_cache = {}
    
    def tokenize(self, text: str) -> Generator[str, None, None]:
        """Tokenize text using generator for memory efficiency."""
        if self.lowercase:
            text = text.lower()
        
        for match in WORD_PATTERN.finditer(text):
            token = match.group()
            if self.remove_stopwords and token in STOP_WORDS:
                continue
            yield token
    
    def tokenize_batch(self, texts: List[str], max_workers: int = 4) -> List[List[str]]:
        """Tokenize multiple texts in parallel."""
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            return list(executor.map(lambda t: list(self.tokenize(t)), texts))


class TFIDFVectorizer:
    """Memory-efficient TF-IDF implementation using sparse matrices."""
    
    def __init__(self, max_features: int = 10000, min_df: int = 2, max_df: float = 0.95):
        self.max_features = max_features
        self.min_df = min_df
        self.max_df = max_df
        self.vocabulary_ = {}
        self.idf_ = None
        self.tokenizer = MemoryEfficientTokenizer()
    
    def fit(self, documents: List[str]) -> 'TFIDFVectorizer':
        """Fit the vectorizer on documents."""
        # Calculate document frequencies
        doc_freq = defaultdict(int)
        n_docs = len(documents)
        
        for doc in documents:
            seen_tokens = set()
            for token in self.tokenizer.tokenize(doc):
                if token not in seen_tokens:
                    doc_freq[token] += 1
                    seen_tokens.add(token)
        
        # Filter by document frequency
        min_count = self.min_df if isinstance(self.min_df, int) else int(self.min_df * n_docs)
        max_count = int(self.max_df * n_docs) if isinstance(self.max_df, float) else self.max_df
        
        # Select top features by document frequency
        valid_tokens = [
            (token, freq) for token, freq in doc_freq.items()
            if min_count <= freq <= max_count
        ]
        valid_tokens.sort(key=lambda x: x[1], reverse=True)
        
        # Build vocabulary
        self.vocabulary_ = {
            token: idx for idx, (token, _) in enumerate(valid_tokens[:self.max_features])
        }
        
        # Calculate IDF values
        self.idf_ = np.zeros(len(self.vocabulary_))
        for token, idx in self.vocabulary_.items():
            self.idf_[idx] = math.log(n_docs / doc_freq[token])
        
        return self
    
    def transform(self, documents: List[str]) -> csr_matrix:
        """Transform documents to TF-IDF matrix."""
        rows, cols, data = [], [], []
        
        for doc_idx, doc in enumerate(documents):
            # Count term frequencies
            tf_counter = Counter()
            total_terms = 0
            
            for token in self.tokenizer.tokenize(doc):
                if token in self.vocabulary_:
                    tf_counter[self.vocabulary_[token]] += 1
                    total_terms += 1
            
            # Calculate TF-IDF
            for term_idx, count in tf_counter.items():
                tf = count / total_terms if total_terms > 0 else 0
                tfidf = tf * self.idf_[term_idx]
                
                rows.append(doc_idx)
                cols.append(term_idx)
                data.append(tfidf)
        
        return csr_matrix((data, (rows, cols)), shape=(len(documents), len(self.vocabulary_)))


class BM25:
    """Optimized BM25 ranking algorithm."""
    
    def __init__(self, k1: float = 1.2, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_lengths = []
        self.avgdl = 0
        self.doc_freqs = []
        self.idf = {}
        self.tokenizer = MemoryEfficientTokenizer()
        self.doc_vectors = []
    
    def fit(self, documents: List[str]) -> 'BM25':
        """Fit BM25 on documents."""
        n_docs = len(documents)
        df = defaultdict(int)
        
        # Process documents
        for doc in documents:
            doc_tokens = list(self.tokenizer.tokenize(doc))
            self.doc_lengths.append(len(doc_tokens))
            
            # Count document frequencies
            seen_tokens = set()
            token_freqs = Counter(doc_tokens)
            self.doc_vectors.append(token_freqs)
            
            for token in token_freqs:
                if token not in seen_tokens:
                    df[token] += 1
                    seen_tokens.add(token)
        
        # Calculate average document length
        self.avgdl = sum(self.doc_lengths) / len(self.doc_lengths) if self.doc_lengths else 0
        
        # Calculate IDF scores
        for token, freq in df.items():
            self.idf[token] = math.log((n_docs - freq + 0.5) / (freq + 0.5))
        
        return self
    
    def score(self, query: str, doc_idx: int) -> float:
        """Calculate BM25 score for a query and document."""
        query_tokens = list(self.tokenizer.tokenize(query))
        doc_len = self.doc_lengths[doc_idx]
        doc_freqs = self.doc_vectors[doc_idx]
        
        score = 0.0
        for token in query_tokens:
            if token not in self.idf:
                continue
            
            tf = doc_freqs.get(token, 0)
            idf = self.idf[token]
            
            numerator = idf * tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
            
            score += numerator / denominator
        
        return score
    
    def rank(self, query: str, top_k: int = 10) -> List[Tuple[int, float]]:
        """Rank documents by BM25 score."""
        scores = [(idx, self.score(query, idx)) for idx in range(len(self.doc_lengths))]
        return heapq.nlargest(top_k, scores, key=lambda x: x[1])


class OptimizedCosineSimilarity:
    """Optimized cosine similarity calculations using SIMD operations."""
    
    @staticmethod
    def calculate(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity with optimizations."""
        # Ensure vectors are 1D
        vec1 = np.asarray(vec1).flatten()
        vec2 = np.asarray(vec2).flatten()
        
        # Use numpy's optimized operations
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    @staticmethod
    def batch_calculate(query_vec: np.ndarray, doc_vectors: np.ndarray) -> np.ndarray:
        """Calculate cosine similarity for multiple documents efficiently."""
        # Normalize vectors
        query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
        doc_norms = doc_vectors / (np.linalg.norm(doc_vectors, axis=1, keepdims=True) + 1e-10)
        
        # Batch dot product
        similarities = np.dot(doc_norms, query_norm)
        
        return similarities


class InvertedIndex:
    """Memory-efficient inverted index for fast text search."""
    
    def __init__(self):
        self.index = defaultdict(set)
        self.doc_store = {}
        self.tokenizer = MemoryEfficientTokenizer()
    
    def add_document(self, doc_id: str, content: str):
        """Add document to the index."""
        self.doc_store[doc_id] = content
        
        for position, token in enumerate(self.tokenizer.tokenize(content)):
            self.index[token].add((doc_id, position))
    
    def search(self, query: str, max_results: int = 10) -> List[Tuple[str, float]]:
        """Search documents using the inverted index."""
        query_tokens = list(self.tokenizer.tokenize(query))
        doc_scores = defaultdict(float)
        
        # Calculate document scores based on term matches
        for token in query_tokens:
            if token in self.index:
                # IDF weight
                idf = math.log(len(self.doc_store) / len(self.index[token]))
                
                for doc_id, position in self.index[token]:
                    # Position-based scoring (earlier positions score higher)
                    position_score = 1.0 / (1.0 + position * 0.01)
                    doc_scores[doc_id] += idf * position_score
        
        # Return top results
        results = [(doc_id, score) for doc_id, score in doc_scores.items()]
        return heapq.nlargest(max_results, results, key=lambda x: x[1])
    
    def phrase_search(self, phrase: str) -> List[str]:
        """Search for exact phrase matches."""
        tokens = list(self.tokenizer.tokenize(phrase))
        if not tokens:
            return []
        
        # Get documents containing all tokens
        doc_sets = [set(doc_id for doc_id, _ in self.index.get(token, [])) for token in tokens]
        candidate_docs = set.intersection(*doc_sets) if doc_sets else set()
        
        # Check for phrase matches
        results = []
        for doc_id in candidate_docs:
            if self._contains_phrase(doc_id, tokens):
                results.append(doc_id)
        
        return results
    
    def _contains_phrase(self, doc_id: str, tokens: List[str]) -> bool:
        """Check if document contains the exact phrase."""
        positions_list = []
        
        for token in tokens:
            positions = [pos for d_id, pos in self.index[token] if d_id == doc_id]
            if not positions:
                return False
            positions_list.append(positions)
        
        # Check for consecutive positions
        for start_pos in positions_list[0]:
            found = True
            for i, positions in enumerate(positions_list[1:], 1):
                if start_pos + i not in positions:
                    found = False
                    break
            if found:
                return True
        
        return False


class EfficientKeywordExtractor:
    """Extract keywords using multiple algorithms efficiently."""
    
    def __init__(self):
        self.tokenizer = MemoryEfficientTokenizer()
    
    def extract_tfidf(self, documents: List[str], doc_idx: int, top_k: int = 10) -> List[Tuple[str, float]]:
        """Extract keywords using TF-IDF."""
        vectorizer = TFIDFVectorizer(max_features=1000)
        vectorizer.fit(documents)
        
        # Get TF-IDF scores for the document
        tfidf_matrix = vectorizer.transform([documents[doc_idx]])
        
        # Get top keywords
        scores = []
        for token, idx in vectorizer.vocabulary_.items():
            score = tfidf_matrix[0, idx]
            if score > 0:
                scores.append((token, score))
        
        return heapq.nlargest(top_k, scores, key=lambda x: x[1])
    
    @lru_cache(maxsize=1000)
    def extract_rake(self, text: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """Rapid Automatic Keyword Extraction (RAKE) algorithm."""
        # Split into sentences
        sentences = SENTENCE_PATTERN.split(text)
        
        # Extract phrases
        phrases = []
        for sentence in sentences:
            tokens = list(self.tokenizer.tokenize(sentence))
            
            # Group tokens into phrases (separated by stopwords)
            current_phrase = []
            for token in tokens:
                if token in STOP_WORDS:
                    if current_phrase:
                        phrases.append(' '.join(current_phrase))
                        current_phrase = []
                else:
                    current_phrase.append(token)
            
            if current_phrase:
                phrases.append(' '.join(current_phrase))
        
        # Calculate word scores
        word_freq = defaultdict(int)
        word_degree = defaultdict(int)
        
        for phrase in phrases:
            words = phrase.split()
            degree = len(words) - 1
            
            for word in words:
                word_freq[word] += 1
                word_degree[word] += degree
        
        # Calculate word scores (degree/frequency)
        word_scores = {}
        for word in word_freq:
            word_scores[word] = word_degree[word] / word_freq[word]
        
        # Calculate phrase scores
        phrase_scores = []
        for phrase in set(phrases):
            words = phrase.split()
            score = sum(word_scores.get(word, 0) for word in words)
            phrase_scores.append((phrase, score))
        
        return heapq.nlargest(top_k, phrase_scores, key=lambda x: x[1])


class MemoryPooledEmbeddings:
    """Memory-efficient embedding storage with pooling."""
    
    def __init__(self, pool_size: int = 1000, embedding_dim: int = 768):
        self.pool_size = pool_size
        self.embedding_dim = embedding_dim
        self.pool = np.zeros((pool_size, embedding_dim), dtype=np.float32)
        self.pool_index = 0
        self.id_to_index = {}
        self.index_to_id = {}
        self.lru_queue = []
    
    def add(self, doc_id: str, embedding: np.ndarray):
        """Add embedding to the pool with LRU eviction."""
        embedding = np.asarray(embedding, dtype=np.float32).flatten()[:self.embedding_dim]
        
        if doc_id in self.id_to_index:
            # Update existing
            idx = self.id_to_index[doc_id]
            self.pool[idx] = embedding
            # Move to end of LRU queue
            self.lru_queue.remove(doc_id)
            self.lru_queue.append(doc_id)
        else:
            # Add new
            if len(self.id_to_index) >= self.pool_size:
                # Evict least recently used
                evict_id = self.lru_queue.pop(0)
                evict_idx = self.id_to_index[evict_id]
                del self.id_to_index[evict_id]
                del self.index_to_id[evict_idx]
                
                # Reuse the slot
                self.pool[evict_idx] = embedding
                self.id_to_index[doc_id] = evict_idx
                self.index_to_id[evict_idx] = doc_id
            else:
                # Use next available slot
                idx = len(self.id_to_index)
                self.pool[idx] = embedding
                self.id_to_index[doc_id] = idx
                self.index_to_id[idx] = doc_id
            
            self.lru_queue.append(doc_id)
    
    def get(self, doc_id: str) -> Optional[np.ndarray]:
        """Get embedding from the pool."""
        if doc_id in self.id_to_index:
            idx = self.id_to_index[doc_id]
            # Update LRU
            self.lru_queue.remove(doc_id)
            self.lru_queue.append(doc_id)
            return self.pool[idx].copy()
        return None
    
    def batch_similarity(self, query_embedding: np.ndarray, doc_ids: List[str]) -> Dict[str, float]:
        """Calculate similarities for multiple documents efficiently."""
        query_embedding = np.asarray(query_embedding, dtype=np.float32).flatten()
        results = {}
        
        # Collect valid indices
        valid_indices = []
        valid_ids = []
        for doc_id in doc_ids:
            if doc_id in self.id_to_index:
                valid_indices.append(self.id_to_index[doc_id])
                valid_ids.append(doc_id)
        
        if valid_indices:
            # Batch calculation
            doc_embeddings = self.pool[valid_indices]
            similarities = OptimizedCosineSimilarity.batch_calculate(query_embedding, doc_embeddings)
            
            for doc_id, sim in zip(valid_ids, similarities):
                results[doc_id] = float(sim)
        
        return results


# Async wrappers for CPU-intensive operations
async def async_tfidf_fit(vectorizer: TFIDFVectorizer, documents: List[str]) -> TFIDFVectorizer:
    """Async wrapper for TF-IDF fitting."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, vectorizer.fit, documents)


async def async_bm25_rank(bm25: BM25, query: str, top_k: int = 10) -> List[Tuple[int, float]]:
    """Async wrapper for BM25 ranking."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, bm25.rank, query, top_k)


async def async_extract_keywords(extractor: EfficientKeywordExtractor, text: str, top_k: int = 10) -> List[Tuple[str, float]]:
    """Async wrapper for keyword extraction."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, extractor.extract_rake, text, top_k) 