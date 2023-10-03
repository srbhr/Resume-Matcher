import Image from 'next/image';
import Button from '@/components/button/button';

const Header = () => {
    return (
        <header className="flex justify-between items-center px-24 py-4 bg-[#211E27]">
            <Image
                src="/resume_matcher_logo.png"
                alt="Resume Matcher Logo"
                width={100}
                height={60}
            />
            <nav className="grow">
                <ul
                    className="flex justify-center gap-6 text-[#DCCDCD] text-sm"
                    role="list"
                >
                    <li>Contributions</li>
                    <li>Docs</li>
                    <li>Main Site</li>
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
                            <Button className="bg-white text-black py-2">
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
                            <Button className="bg-[#302442] text-white py-2">
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
