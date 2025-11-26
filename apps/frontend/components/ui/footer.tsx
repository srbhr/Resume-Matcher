import Link from 'next/link';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-white/35">
      {' '}
      {/* Or your desired background color */}
      <div className="container mx-auto grid grid-cols-1 gap-8 px-6 py-16 md:grid-cols-4">
        {/* Column 1: Logo and Copyright */}
        <div>
          <Link href="/" className="text-2xl font-bold text-gray-900">
            munch
          </Link>
          <p className="mt-2 text-xs text-gray-500">&copy; {currentYear} Spazio Bianco</p>
        </div>

        {/* Column 2: Navigation */}
        <div>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Navigation</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/overview" className="text-sm text-gray-600 hover:text-gray-900">
                Overview
              </Link>
            </li>
            <li>
              <Link href="/colors" className="text-sm text-gray-600 hover:text-gray-900">
                Colors
              </Link>
            </li>
            <li>
              <Link href="/links" className="text-sm text-gray-600 hover:text-gray-900">
                Links
              </Link>
            </li>
            <li>
              <Link href="/buttons" className="text-sm text-gray-600 hover:text-gray-900">
                Buttons
              </Link>
            </li>
            <li>
              <Link href="/typography" className="text-sm text-gray-600 hover:text-gray-900">
                Typography
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 3: More Themes */}
        <div>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">More Themes</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/lexington" className="text-sm text-gray-600 hover:text-gray-900">
                Lexington Themes
              </Link>
            </li>
            <li>
              <Link href="/oxbow" className="text-sm text-gray-600 hover:text-gray-900">
                Oxbow UI
              </Link>
            </li>
            {/* Add more links as needed */}
          </ul>
        </div>

        {/* Column 4: Stay updated */}
        <div>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Stay updated</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/license" className="text-sm text-gray-600 hover:text-gray-900">
                License
              </Link>
            </li>
            <li>
              <Link href="/changelog" className="text-sm text-gray-600 hover:text-gray-900">
                Changelog
              </Link>
            </li>
            <li>
              <Link href="/documentation" className="text-sm text-gray-600 hover:text-gray-900">
                Documentation
              </Link>
            </li>
            {/* Add more links as needed */}
          </ul>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
