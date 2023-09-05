import { ServiceKeys } from "@/types/service-keys";

export type ReducerState = {
  serviceKeys: ServiceKeys;
  shouldDisableButtons: boolean;
};

type AddServiceKeyAction = {
  type: "ADD_SERVICE_KEY";
  payload: Record<string, string>;
};

type UpdateButtonStateAction = {
  type: "UPDATE_BUTTON_STATE";
  payload: boolean;
};

export type ReducerAction = AddServiceKeyAction | UpdateButtonStateAction;

export function reducer(state: ReducerState, action: ReducerAction) {
  switch (action.type) {
    case "ADD_SERVICE_KEY": {
      return {
        ...state,
        serviceKeys: {
          ...state.serviceKeys,
          ...action.payload,
        },
      };
    }
    case "UPDATE_BUTTON_STATE": {
      return {
        ...state,
        shouldDisableButtons: action.payload,
      };
    }
  }

  return state;
}
