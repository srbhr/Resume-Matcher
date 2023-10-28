import Image from "next/image";
import data from "./footerLinks";

const Footer = () => {
  return (
    <>
      <section className="text-[#CFCDD2] bg-[#221932] px-24 py-16">
        <div className="flex justify-between ">
          <div className="text-3xl w-2/5 ">
            <p className="pb-4 font-semibold">Resume Matcher</p>
            <ul className="flex ">
              <a
                className="text-base pr-4 hover:text-[#A49DA2]"
                href="https://github.com/srbhr/Resume-Matcher"
                target="_blank"
                rel="noopener noreferrer"
              >
                Github
              </a>
              <a
                className="text-base hover:text-[#A49DA2]"
                href="https://github.com/srbhr/Resume-Matcher/blob/master/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
              >
                Apache 2.0
              </a>
            </ul>
          </div>
          <div className="flex justify-around text-xl w-3/5">
            {data.map((section, index) => (
              <div key={index}>
                <p className="pb-4 font-semibold">{section.label}</p>
                <ul>
                  {section.items.map((item, itemIndex) => (
                    <li
                      className="py-1 text-base hover:text-[#A49DA2]"
                      key={itemIndex}
                    >
                      <a
                        {...(item.shouldOpenInNewPage
                          ? { target: "_blank" }
                          : {})}
                        rel="noopener noreferrer"
                        href={item.link}
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-between pt-16">
          <p className="flex py-2">
            Apache 2.0 ©{" "}
            <a
              className="text-[#B3A8C3] hover:text-[#9385A8]"
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/srbhr/Resume-Matcher/graphs/contributors"
            >
              Resume Matcher Contributers
            </a>{" "}
          </p>
          <div className="flex gap-5">
            <a href="https://github.com/srbhr/Resume-Matcher">
              <div className="p-2 rounded-xl hover:p-2 hover:bg-[#44365F] transition duration-300">
                <Image
                  className="hover:bg-[#44365F]"
                  src="/icons/discord-light.svg"
                  width={20}
                  height={20}
                  alt="GitHub Octocat Logo"
                />{" "}
              </div>
            </a>

            <a href="https://www.producthunt.com/posts/resume-matcher">
              <div className="p-2 rounded-xl hover:p-2 hover:bg-[#44365F] transition duration-300">
                <Image
                  className="hover:bg-[#44365F]"
                  src="/icons/productHunt-light.svg"
                  width={20}
                  height={20}
                  alt="GitHub Octocat Logo"
                />{" "}
              </div>
            </a>
            <a href="https://discord.com/invite/t3Y9HEuV34">
              <div className="p-2 rounded-xl hover:p-2 hover:bg-[#44365F] transition duration-300">
                <Image
                  className="hover:bg-[#44365F]"
                  src="/icons/github-light.svg"
                  width={20}
                  height={20}
                  alt="GitHub Octocat Logo"
                />
              </div>
            </a>
          </div>
        </div>
      </section>
    </>
  );
};
export default Footer;
