type HeroProps = {
  children?: React.ReactNode;
};

const Hero = ({ children }: HeroProps) => {
  return (
    <>
      <section className="flex flex-col gap-12 px-32 py-14 pb-24 h-100% items-center bg-gradient-to-br from-[#2C203E] to-[#030205]">
        <h1 className="text-5xl text-center leading-normal mx-2 mt-10">
          Free and Open Source ATS to help your resume pass the screening stage.
        </h1>
        {children}
      </section>
    </>
  );
};

export default Hero;
