import Image from "next/image";
import data from "./footerLinks";

const Footer = () => {
  return (
    <section className="text-[#CFCDD2] bg-[#221932] px-24 py-16">
      <div className="flex justify-between">
        <div className="text-3xl w-2/5">
          <p className="pb-4 font-semibold">Resume Matcher</p>
          <ul className="flex">
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
                      target={item.shouldOpenInNewPage ? "_blank" : undefined}
                      rel={
                        item.shouldOpenInNewPage
                          ? "noopener noreferrer"
                          : undefined
                      }
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
      <div className="flex gap-5 pt-12">
        <a
          className="p-2 rounded-xl hover:p-2 hover:bg-[#44365F] transition duration-300"
          href="https://discord.com/invite/t3Y9HEuV34"
          title="Discord"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            className="hover:bg-[#44365F]"
            src="/icons/discord-light.svg"
            width={20}
            height={20}
            alt="Discord Logo"
          />
        </a>
        <a
          className="p-2 rounded-xl hover:p-2 hover:bg-[#44365F] transition duration-300"
          href="https://www.producthunt.com/posts/resume-matcher"
          title="Product Hunt"
          rel="noopener noreferrer"
        >
          <Image
            className="hover:bg-[#44365F]"
            src="/icons/productHunt-light.svg"
            width={20}
            height={20}
            alt="Product Hunt Logo"
          />
        </a>
        <a
          className="p-2 rounded-xl hover:p-2 hover:bg-[#44365F] transition duration-300"
          href="https://github.com/srbhr/Resume-Matcher"
          title="GitHub"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            className="hover:bg-[#44365F]"
            src="/icons/github-light.svg"
            width={20}
            height={20}
            alt="GitHub Logo"
          />
        </a>
      </div>
    </section>
  );
};
export default Footer;
