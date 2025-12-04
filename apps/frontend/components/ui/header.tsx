import Link from 'next/link';

const Header = () => {
  return (
    <header className="sticky top-0 left-0 z-50 w-full bg-white shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-gray-900">
          munch
        </Link>

        {/* Navigation */}
        <nav className="flex items-center space-x-6">
          <Link href="/overview" className="text-sm text-gray-600 hover:text-gray-900">
            Overview
          </Link>
          <Link href="/signup" className="text-sm text-gray-600 hover:text-gray-900">
            Sign up
          </Link>
          <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">
            Blog
          </Link>
          <Link
            href="/buy"
            className="rounded-md bg-teal-400 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-teal-500"
          >
            Buy Spazio Bianco
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
