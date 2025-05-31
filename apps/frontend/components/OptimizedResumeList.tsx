'use client';

import React, { useState, useMemo, useCallback, memo } from 'react';
import {
    useVirtualScroll,
    useDebounce,
    usePagination,
    TextSearcher,
    deepEqual,
    useIntersectionObserver
} from '@/lib/optimization';

interface Resume {
    id: string;
    title: string;
    score: number;
    keywords: string[];
    summary: string;
    updatedAt: string;
}

interface ResumeItemProps {
    resume: Resume;
    searchQuery: string;
    onSelect: (id: string) => void;
}

// Memoized resume item component
const ResumeItem = memo<ResumeItemProps>(({ resume, searchQuery, onSelect }) => {
    const { targetRef, isIntersecting } = useIntersectionObserver({
        threshold: 0.1,
        rootMargin: '50px'
    });

    const handleClick = useCallback(() => {
        onSelect(resume.id);
    }, [resume.id, onSelect]);

    // Only render full content when visible
    if (!isIntersecting) {
        return (
            <div
                ref={targetRef as React.RefObject<HTMLDivElement>}
                className="h-24 bg-gray-100 animate-pulse rounded-lg mb-2"
            />
        );
    }

    return (
        <div
            ref={targetRef as React.RefObject<HTMLDivElement>}
            onClick={handleClick}
            className="p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer mb-2"
        >
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h3 className="text-lg font-semibold">{resume.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{resume.summary}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {resume.keywords.slice(0, 5).map((keyword, idx) => (
                            <span
                                key={idx}
                                className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                            >
                                {keyword}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="ml-4 text-right">
                    <div className="text-2xl font-bold text-green-600">
                        {(resume.score * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500">{resume.updatedAt}</div>
                </div>
            </div>
        </div>
    );
}, deepEqual);

ResumeItem.displayName = 'ResumeItem';

interface OptimizedResumeListProps {
    resumes: Resume[];
    onSelectResume: (id: string) => void;
}

export function OptimizedResumeList({ resumes, onSelectResume }: OptimizedResumeListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'virtual' | 'paginated'>('virtual');

    // Initialize text searcher
    const textSearcher = useMemo(() => {
        const documents = resumes.map(r => `${r.title} ${r.summary} ${r.keywords.join(' ')}`);
        return new TextSearcher(documents);
    }, [resumes]);

    // Debounced search handler
    const handleSearch = useDebounce((query: string) => {
        setSearchQuery(query);
    }, 300);

    // Filter resumes based on search
    const filteredResumes = useMemo(() => {
        if (!searchQuery) return resumes;

        const matchingIndices = textSearcher.search(searchQuery);
        return matchingIndices.map(idx => resumes[idx]);
    }, [resumes, searchQuery, textSearcher]);

    // Virtual scrolling setup
    const {
        visibleItems: virtualResumes,
        offsetY,
        totalHeight,
        handleScroll
    } = useVirtualScroll(filteredResumes, 100, 600, 3);

    // Pagination setup
    const {
        currentItems: paginatedResumes,
        currentPage,
        totalPages,
        goToPage,
        nextPage,
        prevPage
    } = usePagination(filteredResumes, 10);

    // Current display resumes based on view mode
    const displayResumes = viewMode === 'virtual' ? virtualResumes : paginatedResumes;

    return (
        <div className="h-full flex flex-col">
            {/* Search and Controls */}
            <div className="mb-4 space-y-2">
                <input
                    type="text"
                    placeholder="Search resumes..."
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                        Found {filteredResumes.length} resumes
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode('virtual')}
                            className={`px-3 py-1 rounded ${viewMode === 'virtual'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-700'
                                }`}
                        >
                            Virtual Scroll
                        </button>
                        <button
                            onClick={() => setViewMode('paginated')}
                            className={`px-3 py-1 rounded ${viewMode === 'paginated'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-700'
                                }`}
                        >
                            Paginated
                        </button>
                    </div>
                </div>
            </div>

            {/* Resume List */}
            {viewMode === 'virtual' ? (
                <div
                    className="flex-1 overflow-auto"
                    onScroll={handleScroll}
                >
                    <div
                        style={{
                            height: totalHeight,
                            position: 'relative'
                        }}
                    >
                        <div
                            style={{
                                transform: `translateY(${offsetY}px)`,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                            }}
                        >
                            {displayResumes.map((resume) => (
                                <ResumeItem
                                    key={resume.id}
                                    resume={resume}
                                    searchQuery={searchQuery}
                                    onSelect={onSelectResume}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-auto">
                        {displayResumes.map((resume) => (
                            <ResumeItem
                                key={resume.id}
                                resume={resume}
                                searchQuery={searchQuery}
                                onSelect={onSelectResume}
                            />
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    <div className="mt-4 flex justify-center items-center gap-2">
                        <button
                            onClick={prevPage}
                            disabled={currentPage === 1}
                            className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="px-3 py-1">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={nextPage}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default OptimizedResumeList; 