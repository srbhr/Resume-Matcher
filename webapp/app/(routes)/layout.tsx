import type { Metadata } from "next";
import { Fira_Sans } from "next/font/google";
import "@/app/globals.css";
import Header from "@/components/header/header";
const firaSans = Fira_Sans({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume Matcher",
  description:
    "An AI Based Free & Open Source ATS, Resume Matcher to tailor your resume to a job description. Find the best keywords, and gain deep insights into your resume.",
  keywords: ["Resume", "Matcher", "ATS", "Score"],
  authors: [
    { name: "Samurize", url: "https://github.com/srbhr" },
    { name: "Sayvai", url: "https://github.com/Sayvai" },
  ],
  icons: {
    icon: "/favicon-32x32.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={firaSans.className}>
        <div className="flex flex-col w-full 2xl:w-2/3 m-auto bg-[#2A203B]">
          <Header />
          {children}
        </div>
      </body>
    </html>
  );
}
