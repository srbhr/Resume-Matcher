type HeroProps = {
    children?: React.ReactNode;
};

const Hero = ({ children }: HeroProps) => {
    return (
        <>
            <section className="flex flex-col gap-12 px-32 py-10  items-center bg-gradient-to-r from-[#2C203E] to-[#030205]">
                <h1 className="text-4xl font-normal text-center leading-normal mx-4 mt-4">
                    Free and Open Source ATS to help your resume pass the
                    screening stage.
                </h1>
                {children}
            </section>
        </>
    );
};

export default Hero;
