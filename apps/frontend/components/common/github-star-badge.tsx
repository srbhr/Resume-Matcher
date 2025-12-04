import Link from 'next/link';

const GitHubStarBadge = () => {
  const githubRepoUrl = 'https://github.com/srbhr/resume-matcher';

  return (
    <Link
      href={githubRepoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block group"
    >
      <div className="p-[1px] rounded-xl bg-gradient-to-br from-sky-400 to-blue-600">
        <span
          className={`
            inline-flex items-center gap-x-1.5
            px-3 py-1.5
            rounded-xl
            text-md
            bg-black text-white
            group-hover:bg-gradient-to-r group-hover:from-sky-400 group-hover:to-blue-500
            group-hover:text-black
            transition-colors duration-300 ease-in-out
          `}
        >
          <svg
            className="w-3.5 h-3.5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354l-4.543 2.837c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
              clipRule="evenodd"
            />
          </svg>

          <span>Star resume matcher on</span>

          <svg
            width="22"
            height="22"
            viewBox="0 -0.014 0.66 0.66"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M.336 0a.316.316 0 0 0-.1.616C.252.619.258.609.258.601V.547C.17.566.151.504.151.504A.1.1 0 0 0 .116.458C.087.439.118.439.118.439a.07.07 0 0 1 .048.033.07.07 0 0 0 .092.026.07.07 0 0 1 .019-.042C.207.448.133.421.133.301A.12.12 0 0 1 .165.216.12.12 0 0 1 .168.132S.195.123.255.164a.3.3 0 0 1 .158 0C.473.123.5.132.5.132a.1.1 0 0 1 .004.083A.12.12 0 0 1 .536.3c0 .122-.074.148-.144.155a.08.08 0 0 1 .022.058V.6c0 .01.006.018.022.015A.316.316 0 0 0 .336 0"
              fill="currentColor"
            />
          </svg>
        </span>
      </div>
    </Link>
  );
};

export default GitHubStarBadge;
