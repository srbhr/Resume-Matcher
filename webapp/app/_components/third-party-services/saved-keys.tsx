"use client";

import { ServiceKeys } from "@/types/service-keys";
import Button from "@/components/button/button";
import { useEffect, useReducer, useRef } from "react";
import { ReducerState, reducer } from "./reducer";

type SavedKeysProps = {
  keys: ServiceKeys;
};

const SavedKeys = ({ keys: savedKeys }: SavedKeysProps) => {
  const refOriginalKeys = useRef(savedKeys); // persist the original keys throughout component re-renders to compare with the updated keys

  const intiialReducerState: ReducerState = {
    serviceKeys: savedKeys,
    shouldDisableButtons: false,
  };

  const [state, dispatch] = useReducer(reducer, intiialReducerState);

  useEffect(() => {
    // if the keys have been updated, then disable the button
    updateButtonState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.serviceKeys]);

  const hasSetAllKeys = state.serviceKeys ? validateKeys() : false;

  async function handleOnSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/service-keys", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        // update the original keys with the new set of keys, a reference when checking for changes
        refOriginalKeys.current = state.serviceKeys;
        updateButtonState();
      } else {
        throw new Error(
          `There was a problem updating the keys. Please refer to console / network output. Error: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error(error);

      // TODO: Future work to potentially add a toast notification, or in a full-width horizontal message bar at the top of the page 🤔
      alert(error);
    }
  }

  function validateKeys() {
    const values = Object.values(state.serviceKeys);

    if (values.length === 0) {
      return false;
    }

    for (let i = 0; i < values.length; i++) {
      if (!values[i]) {
        return false;
      }
    }

    return true;
  }

  function updateButtonState() {
    const keysUpdated = hasKeysUpdated();

    dispatch({
      type: "UPDATE_BUTTON_STATE",
      payload: !hasSetAllKeys || !keysUpdated,
    });
  }

  function hasKeysUpdated() {
    return (
      JSON.stringify(state.serviceKeys) !==
      JSON.stringify(refOriginalKeys.current)
    );
  }

  return (
    <form onSubmit={handleOnSubmit} className="flex flex-col gap-4">
      {Object.entries(state.serviceKeys).map(([key, value]) => {
        return (
          <div key={key} className="flex flex-col gap-2 p-2 bg-transparent">
            <label htmlFor={key} className="text-purple-400">
              {key}
            </label>
            <input
              id={key}
              className="p-1 text-white bg-slate-800"
              type="text"
              name={key}
              value={value}
              onChange={(event) => {
                dispatch({
                  type: "ADD_SERVICE_KEY",
                  payload: { [key]: event.target.value },
                });
              }}
            />
          </div>
        );
      })}
      <Button
        type="submit"
        className="text-white bg-orange-700 disabled:opacity-50 self-end"
        disabled={state.shouldDisableButtons}
      >
        Update Keys
      </Button>
    </form>
  );
};

export default SavedKeys;
