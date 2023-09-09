export type ServiceKeys = Record<string, string>;

export type GetServiceKeysResponse = {
  config_keys?: ServiceKeys;
  error?: string;
};
