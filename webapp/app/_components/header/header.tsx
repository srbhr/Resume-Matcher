import Image from "next/image";
import Button from "@/components/button/button";

const Header = () => {
  return (
    <header className="flex justify-between items-center px-24 py-4 bg-[#24202A] shadow-md">
      <Image
        src="/resume_matcher_logo.png"
        alt="Resume Matcher Logo"
        width={100}
        height={60}
      />
      <nav className="grow">
        <ul
          className="flex justify-center gap-6 text-[#e2e8f0] text-sm "
          role="list"
        >
          <li className="hover:text-[#94a3b8]">
            <a
              href="https://github.com/srbhr/Resume-Matcher/graphs/contributors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contributions
            </a>
          </li>
          <li className="hover:text-[#94a3b8]">
            <a
              href="https://github.com/srbhr/Resume-Matcher#readme"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
          </li>
          <li className="hover:text-[#94a3b8]">
            <a
              href="https://www.resumematcher.fyi/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Main Site
            </a>
          </li>
        </ul>
      </nav>
      <nav>
        <ul className="flex gap-4 text-xs">
          <li>
            <a
              href="https://github.com/srbhr/Resume-Matcher"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-white text-black py-3 shadow-xl hover:bg-[#e5e7eb]">
                Star Us
                <Image
                  src="/icons/github.svg"
                  width={16}
                  height={16}
                  alt="GitHub Octocat Logo"
                />
              </Button>
            </a>
          </li>
          <li>
            <a
              href="https://dsc.gg/resume-matcher"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-[#302442] text-white py-3 drop-shadow-xl hover:bg-[#2A2137]">
                Join our Discord
              </Button>
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;
