from typing import Any, Dict


from typing import Dict


def get_similarity_config_keys_values(
    config: Dict[str, str | Dict[str, str]]
) -> Dict[str, str]:
    """
    Recursively flattens a nested dictionary into a single-level dictionary with keys
    in the format "parent_key__child_key" for all nested keys. Returns the resulting
    flattened dictionary.

    Args:
        config (Dict[str, str | Dict[str, str]]): The nested dictionary to flatten.

    Returns:
        Dict[str, str]: The resulting flattened dictionary.
    """
    result: Dict[str, str] = {}
    for key, value in config.items():
        if isinstance(value, dict):
            # Recursively call this function to flatten the nested dictionary
            subkeys: Dict[str, str] = get_similarity_config_keys_values(value)  # type: ignore - use of isinstance() check strictly infers that value is a dict[str, str], but it could contain nested dicts as its values. Need to figure out how to correctly type this 🤔

            # Update the result dictionary with the flattened keys and values
            result.update(
                {
                    f"{key}__{subkey_key}": subkey_value
                    for subkey_key, subkey_value in subkeys.items()
                }
            )
        else:
            # If the value is not a dictionary (it is a string), add value to the resulting key in the dictionary
            result[key] = value

    # Return the resulting flattened dictionary
    return result


from typing import Dict, Any


def update_yaml_config(keys: Dict[str, str]) -> Dict[str, Any]:
    """
    Recursively updates a dictionary with keys that contain double underscores ('__') in their names.
    The double underscores are used to indicate nested keys in a YAML file.

    Args:
        keys (Dict[str, str]): A dictionary containing keys and values to update.

    Returns:
        Dict[str, Any]: The updated dictionary. Note: the type should be Dict[str, str | Dict[str, str]], but the type checker doesn't like that. Need to figure out how to correctly type this 🤔
    """

    # Initialize the config dictionary which will be used to write to the YAML file
    config: Dict[str, Any] = {}

    # Iterate through the keys and values from the input flattened dictionary
    for key, value in keys.items():
        if "__" in key:
            # If the key contains double underscores, it is a nested key
            parent_key, child_key = key.split("__", 1)

            # Recursively call this function to update the nested key
            if parent_key not in config:
                config[parent_key] = {}
            config[parent_key].update(update_yaml_config({child_key: value}))
        else:
            # If the key does not contain double underscores, it is not a nested key, and the (string) value can be added to the config dictionary
            config[key] = value

    # Return the updated config dictionary to be written to the YAML file
    return config
