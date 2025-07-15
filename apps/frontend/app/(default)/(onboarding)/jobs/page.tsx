import JobDescriptionUploadTextArea from '@/components/jd-upload/text-area';
import BackgroundContainer from '@/components/common/background-container';
import { Suspense } from 'react';

const ProvideJobDescriptionsPage = () => {
	return (
		<BackgroundContainer>
			<div className="flex flex-col items-center justify-center max-w-7xl">
				<h1 className="text-6xl font-bold text-center mb-12 text-white">
					Provide Job Descriptions
				</h1>
				<p className="text-center text-gray-300 text-xl mb-8 max-w-xl mx-auto">
					Paste up to three job descriptions below. We&apos;ll use these to compare
					against your resume and find the best matches.
				</p>
				<Suspense fallback={<div>Loading input...</div>}>
					<JobDescriptionUploadTextArea />
				</Suspense>
			</div>
		</BackgroundContainer>
	);
};

export default ProvideJobDescriptionsPage;
