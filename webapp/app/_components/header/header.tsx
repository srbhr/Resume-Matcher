import Image from "next/image";
import Button from "@/components/button/button";

const Header = () => {
  return (
    <header className="flex justify-between items-center px-32 py-4 bg-[#211E27]">
      <Image
        src="/resume_matcher_logo.png"
        alt="Resume Matcher Logo"
        width={250}
        height={90}
      />
      <nav className="grow">
        <ul className="flex justify-center gap-6 text-[#DCCDCD]" role="list">
          <li>Contributions</li>
          <li>Docs</li>
          <li>Main Site</li>
        </ul>
      </nav>
      <nav>
        <ul className="flex gap-6">
          <li>
            <a
              href="https://github.com/srbhr/Resume-Matcher"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-white text-black ">
                Star Us
                <Image
                  src="/icons/github.svg"
                  width={24}
                  height={24}
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
              <Button className="bg-[#302442] text-white">
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
