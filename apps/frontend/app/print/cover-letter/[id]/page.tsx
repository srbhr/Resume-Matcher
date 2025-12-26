import { API_BASE } from '@/lib/api/client';

/**
 * Page dimensions in millimeters
 */
const PAGE_DIMENSIONS = {
  A4: { width: 210, height: 297 },
  LETTER: { width: 215.9, height: 279.4 },
} as const;

type PageSize = 'A4' | 'LETTER';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    pageSize?: string;
  }>;
};

interface PersonalInfo {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

interface ResumeResponse {
  data: {
    processed_resume?: {
      personalInfo?: PersonalInfo;
    };
    cover_letter?: string;
  };
}

async function fetchCoverLetterData(
  id: string
): Promise<{ personalInfo: PersonalInfo; coverLetter: string; error?: string }> {
  const url = `${API_BASE}/resumes?resume_id=${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        personalInfo: {},
        coverLetter: '',
        error: `Failed to fetch (status ${res.status})`,
      };
    }
    const payload = (await res.json()) as ResumeResponse;

    return {
      personalInfo: payload.data.processed_resume?.personalInfo || {},
      coverLetter: payload.data.cover_letter || '',
    };
  } catch (err) {
    return {
      personalInfo: {},
      coverLetter: '',
      error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function parsePageSize(value: string | undefined): PageSize {
  if (value === 'A4' || value === 'LETTER') {
    return value;
  }
  return 'A4';
}

export default async function PrintCoverLetterPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { personalInfo, coverLetter, error } = await fetchCoverLetterData(resolvedParams.id);

  const pageSize = parsePageSize(resolvedSearchParams?.pageSize);
  const pageDims = PAGE_DIMENSIONS[pageSize];

  // Show error if fetch failed
  if (error) {
    return (
      <div
        className="cover-letter-print bg-white"
        style={{
          width: `${pageDims.width}mm`,
          minHeight: `${pageDims.height}mm`,
          padding: '25mm',
          boxSizing: 'border-box',
        }}
      >
        <h1 style={{ color: 'red', fontSize: '14pt' }}>Error Loading Cover Letter</h1>
        <p style={{ fontSize: '11pt' }}>{error}</p>
        <p style={{ fontSize: '9pt', color: '#666' }}>Resume ID: {resolvedParams.id}</p>
        <p style={{ fontSize: '9pt', color: '#666' }}>API URL: {API_BASE}</p>
      </div>
    );
  }

  // Standard cover letter margins
  const margins = { top: 25, right: 25, bottom: 25, left: 25 };

  // Get today's date formatted
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Split cover letter into paragraphs (handle both double and single newlines)
  const paragraphs = coverLetter
    .split(/\n\n+/)
    .flatMap((p) => p.split('\n'))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Debug info
  const debugInfo = {
    hasPersonalInfo: Object.keys(personalInfo).length > 0,
    hasCoverLetter: coverLetter.length > 0,
    coverLetterLength: coverLetter.length,
    paragraphCount: paragraphs.length,
  };

  return (
    <div
      className="cover-letter-print"
      style={{
        width: `${pageDims.width}mm`,
        minHeight: `${pageDims.height}mm`,
        padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
        boxSizing: 'border-box',
        fontFamily: 'Georgia, serif',
        backgroundColor: '#ffffff',
        color: '#000000',
      }}
    >
      {/* Debug info - remove in production */}
      {!coverLetter && (
        <div
          style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            padding: '8px',
            marginBottom: '10mm',
            fontSize: '9pt',
            fontFamily: 'monospace',
          }}
        >
          Debug: {JSON.stringify(debugInfo)}
        </div>
      )}
      {/* Header - Personal Info */}
      <header
        style={{
          marginBottom: '8mm',
          paddingBottom: '4mm',
          borderBottom: '2px solid #000',
        }}
      >
        <h1
          style={{
            fontSize: '18pt',
            fontWeight: 'bold',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          {personalInfo.name || 'Your Name'}
        </h1>
        <div
          style={{
            marginTop: '2mm',
            fontSize: '9pt',
            fontFamily: 'monospace',
            color: '#666',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4mm',
          }}
        >
          {personalInfo.email && <span>{personalInfo.email}</span>}
          {personalInfo.phone && <span>{personalInfo.phone}</span>}
          {personalInfo.location && <span>{personalInfo.location}</span>}
          {personalInfo.linkedin && <span>{personalInfo.linkedin}</span>}
        </div>
      </header>

      {/* Date */}
      <div
        style={{
          marginBottom: '8mm',
          fontSize: '10pt',
          fontFamily: 'monospace',
          color: '#666',
        }}
      >
        {today}
      </div>

      {/* Body */}
      <div style={{ lineHeight: '1.6' }}>
        {paragraphs.length > 0 ? (
          paragraphs.map((para, idx) => (
            <p
              key={idx}
              style={{
                fontSize: '11pt',
                margin: '0 0 4mm 0',
                textAlign: 'justify',
              }}
            >
              {para}
            </p>
          ))
        ) : coverLetter ? (
          // Fallback: render raw content with line breaks preserved
          <pre
            style={{
              fontSize: '11pt',
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'Georgia, serif',
            }}
          >
            {coverLetter}
          </pre>
        ) : (
          <p style={{ fontSize: '11pt', color: '#999' }}>
            No cover letter content available. (Resume ID: {resolvedParams.id})
          </p>
        )}
      </div>
    </div>
  );
}
