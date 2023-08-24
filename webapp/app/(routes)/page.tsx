import Resume from "@/components/resume/resume";
import JobDescriptions from "@/components/job-descriptions/job-descriptions";
import VectorScore from "@/components/vector-scores/vector-scores";
import CommonWords from "@/components/common-words/common-words";
import Suggestions from "@/components/suggestions/suggestions";

export default function Home() {
  return (
    <main>
      <Resume />
      <JobDescriptions />
      <VectorScore />
      <CommonWords />
      <Suggestions />
    </main>
  );
}
