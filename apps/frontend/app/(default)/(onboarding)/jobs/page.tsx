import JobDescriptionUploadTextArea from '@/components/jd-upload/text-area';
import BackgroundContainer from '@/components/common/background-container';
import ApiKeyMenu from '@/components/settings/api-key-menu';
import { Suspense } from 'react';

const ProvideJobDescriptionsPage = () => {
	return (
		<BackgroundContainer innerClassName="items-stretch justify-start py-16">
			<div className="flex w-full max-w-7xl flex-col gap-10 mx-auto">
				<div className="self-end">
					<ApiKeyMenu />
				</div>
				<div className="flex flex-col items-center text-center gap-6">
					<h1 className="text-5xl sm:text-6xl font-bold text-white">
						Provide Job Description
					</h1>
					<p className="text-gray-300 text-lg sm:text-xl max-w-2xl">
						Paste your job description below. We&apos;ll compare it against your résumé and surface the best match.
					</p>
				</div>
				<div className="flex justify-center">
					<Suspense fallback={<div className="text-gray-300">Loading input...</div>}>
						<JobDescriptionUploadTextArea />
					</Suspense>
				</div>
			</div>
		</BackgroundContainer>
	);
};

export default ProvideJobDescriptionsPage;
