import { create } from 'zustand';

interface IStore {
  // states
  state1: string;
  // methods
  setState1: (data: string) => void;
}

// slice (can be named - useUserStore etc...)
const useStoreExample = create<IStore>()((set) => ({
  state1: '',
  setState1: (data) => set(() => ({ state1: data }))
}));

export { useStoreExample };

// Usage
// -------------------------------------------
// 1. Reactive Data (inside components)
// const { state1, setState1 } = useStoreExample((state) => ({
//   state1: state.state1,
//   setState1: state.setState1
// }));
// -------------------------------------------
// 2. Non-Reactive Data (inside utility fns)
// const state1 = useStoreExample.getState().state1;
// -------------------------------------------
