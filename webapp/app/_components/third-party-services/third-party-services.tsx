import SavedKeys from "@/app/_components/third-party-services/saved-keys";
import { getErrorMessage } from "@/utils/errors";
import { GetServiceKeysResponse } from "@/types/service-keys";
import {
  getProtocolAndHost,
  isRunningInDevEnvironment,
} from "@/utils/environment";

async function getServiceKeys(): Promise<GetServiceKeysResponse> {
  const isDevEnvironment = isRunningInDevEnvironment();
  let url = "/api/service-keys";

  if (isDevEnvironment) {
    const protocolHost = getProtocolAndHost();
    url = `${protocolHost}${url}`;
  }

  try {
    const response = await fetch(url, { cache: "no-store" });

    const data = (await response.json()) as Promise<GetServiceKeysResponse>;

    return data;
  } catch (error) {
    console.error(error);
    return {
      error: getErrorMessage(error),
    };
  }
}

const ThirdPartyServicesKeys = async () => {
  const data = await getServiceKeys();

  if (
    data.error ||
    !data?.config_keys ||
    Object.keys(data.config_keys).length === 0
  ) {
    // implies that no requieed user service keps are to be set for the app to work, so no need to render service keys component
    console.warn(
      "No configurable service keys found. If this is unexpected, please check the GET API response to '/api/service-keys'."
    );
    return null;
  }

  return (
    <section className="flex flex-col gap-4 w-full px-32 py-10">
      <h2 className="text-3xl font-normal leading-normal">Service Keys</h2>
      <div className="flex flex-col gap-4 text-black p-4 bg-transparent border-2 border-[#2C203E]">
        <SavedKeys keys={data.config_keys} />
      </div>
    </section>
  );
};

export default ThirdPartyServicesKeys;
